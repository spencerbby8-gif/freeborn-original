#!/usr/bin/env bash
# pose-negctl.sh — negative controls for the pose e2e.
#
# WHY THIS EXISTS
#   A green test suite proves nothing on its own: a test that cannot fail is indistinguishable from
#   a test that passes. So each control takes a WORKING tree, reintroduces one specific defect, and
#   requires the suite to go red for that reason. "CAUGHT" means the mutation was noticed; "MISSED"
#   means the assertion is decorative and the feature it appears to protect is untested. Control 5
#   below was found MISSED once already, and the missing coverage was a real bug: the hatch approved
#   a request whose liveness token had never existed.
#
# MECHANICS
#   Nothing is stashed and nothing is checked out: each mutated file is copied to a sibling, patched
#   in place, and restored from the copy whether the run passes, fails or dies. `git checkout --` is
#   deliberately NOT used, because it would also throw away unrelated work in the tree.
#   The runner rebuilds the bundle from source on every invocation, so a mutation is guaranteed to
#   reach the child process (a stale bundle is how a "control caught" line can be a lie).
#
# Usage
#   bash scripts/trust/pose-negctl.sh
#   NEGCTL_ONLY=5,6 bash scripts/trust/pose-negctl.sh
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
ROOT="$PWD"
export PATH=/home/user/toolchain/node/bin:$PATH
export LD_LIBRARY_PATH=/home/user/pgroot/usr/lib/x86_64-linux-gnu:/usr/lib/x86_64-linux-gnu
PSQL=${PSQL:-/home/user/pgroot/usr/lib/postgresql/17/bin/psql}
PSQL_URL=${PSQL_URL:-postgresql://postgres:postgres@127.0.0.1:5432/app_db}
OUT=${NEGCTL_DIR:-/home/user/re/analysis-2026-10-29/negctl}   # evidence lives in the workspace, not /tmp
mkdir -p "$OUT"
LOG="$OUT/$(date -u +%Y%m%dT%H%M%SZ).log"
ONLY="${NEGCTL_ONLY:-}"
ROUTE=src/app/api/verification/check/route.ts
LIVENESS=src/lib/liveness-challenge.ts
INTEGRITY=src/lib/browser-integrity.ts
# Restore bookkeeping. The list is filled in the CURRENT shell (never inside a command substitution,
# where an append would be lost), so a control that dies mid-flight cannot leave a mutated source
# file behind. `.ctl.*` is gitignored, and the originals are restored from the copies rather than
# from git — `git checkout --` would take unrelated work in the tree with it.
PAIRS=()
BACKUP=""
backup() { # backup <file>  -> sets $BACKUP
  BACKUP="$ROOT/scripts/trust/.ctl.$(basename "$1").$$"
  cp "$ROOT/$1" "$BACKUP"
  PAIRS+=("$BACKUP"$'\t'"$1")
}
restore_all() {
  for pair in "${PAIRS[@]:-}"; do
    local b="${pair%%$'\t'*}" f="${pair#*$'\t'}"
    [[ -f "$b" ]] && cp "$b" "$ROOT/$f" && rm -f "$b"
  done
  PAIRS=()
}
trap restore_all EXIT INT TERM

mutate() { # mutate <file> <python-needle> <replacement>
  python3 - "$1" "$2" "$3" <<'PY'
import sys, pathlib
f, needle, repl = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
s = f.read_text()
if s.count(needle) != 1:
    print(f"MUTATION-FAILED count={s.count(needle)} for {sys.argv[2][:60]!r}", file=sys.stderr)
    sys.exit(3)
f.write_text(s.replace(needle, repl))
PY
}

run_mode() { # run_mode <modes|HARNESS> <logfile>
  local modes="$1" log="$2"
  if [[ "$modes" == "HARNESS" ]]; then
    # Rebuilt from source every time: a stale bundle is how "control caught" could be a lie.
    rm -f scripts/trust/.harness.build.mjs
    node_modules/.bin/esbuild scripts/trust/harness.ts --bundle --platform=node --format=esm \
      --tsconfig=tsconfig.json --outfile=scripts/trust/.harness.build.mjs --packages=external \
      >"$log" 2>&1
    node scripts/trust/.harness.build.mjs >>"$log" 2>&1
    echo $?
    return
  fi
  POSE_E2E_ONLY="$modes" timeout 1500 node scripts/trust/pose-run.mjs >"$log" 2>&1
  echo $?
}
# Returns 0 when the suite went RED and named one of the expected tests.
caught() { # caught <rc> <log> <expected-substring...>
  local rc="$1" log="$2"; shift 2
  [[ "$rc" != 0 ]] || return 1
  local hit=0
  for want in "$@"; do
    grep -qF -- "$want" "$log" && hit=1
  done
  [[ "$hit" == 1 ]] || return 2
  return 0
}

TOTAL=0; MISSED=0
control() { # control <id> <title> <modes> <file> <needle> <replacement> [expected...]
  local id="$1" title="$2" modes="$3" file="$4" needle="$5" repl="$6"; shift 6
  if [[ -n "$ONLY" && ",$ONLY," != *",$id,"* ]]; then echo "  skip  control $id (NEGCTL_ONLY)"; return 0; fi
  TOTAL=$((TOTAL+1))
  echo "-- control $id: $title"
  backup "$file" || { echo "   BACKUP FAILED"; MISSED=$((MISSED+1)); return 0; }
  local b="$BACKUP"
  if ! mutate "$ROOT/$file" "$needle" "$repl"; then
    echo "   MUTATION FAILED — the needle is not unique in the current source; not counted"; return 0
  fi
  local rc log; log="$OUT/c$id.log"; rc="$(run_mode "$modes" "$log")"
  cp "$log" "$OUT/c$id.$([[ $rc == 0 ]] && echo green || echo red).log"
  cp "$b" "$ROOT/$file"; rm -f "$b"
  if [[ "$1" == "NEGCTL_EXPECT_MASKED" ]]; then
    # Redundancy is a fact worth recording: this control is EXPECTED not to be caught, because the
    # same rule is enforced elsewhere. Report it as MASKED-BY-DESIGN without counting it, so nobody
    # later "fixes" the count by deleting the assertion that covers the real path.
    if [[ "$rc" == 0 ]]; then
      echo "   MASKED BY DESIGN  (exit 0: the second enforcement still refused it — redundancy, confirmed)"
    else
      echo "   note: the suite went red WITHOUT the CAS, so the read guard is not redundant after all"
    fi
    return 0
  fi
  if caught "$rc" "$log" "$@"; then
    echo "   CAUGHT  (suite exited $rc, and named the expected test)"
  else
    echo "   MISSED  (exit $rc); the assertions for this defect are decorative"
    MISSED=$((MISSED+1))
  fi
}

echo "== pose e2e negative controls — $(date -u) ==" | tee "$LOG"

control 1 "the pose/freshness veto is removed from the approval gate (the original hole)" adversarial "$ROUTE" \
  'if (!approvable || !freshnessProven || !poseProven) {' 'if (!approvable) {' \
  "no token at all" "spent token cannot be redeemed"

control 2 "stage 2 is told the CLIENT's pose string instead of the server's" main "$ROUTE" \
  'The member was asked to roughly perform: "${askedPose}".' 'The member was asked to roughly perform: "${poseLabel}".' \
  "stage 2 was asked about the same server pose"

control 3 "the browser observations are persisted verbatim instead of as rule names" main "$ROUTE" \
  'detail: persistableDetail(integrity),' 'detail: JSON.stringify(browser ?? {}),' \
  "a clean browser is recorded as 'none'"

# Control 4 attacks the evaluator itself: a check that fires on ABSENCE rather than contradiction.
control 4 "the integrity checks fire on missing input instead of on contradiction" HARNESS "$INTEGRITY" \
  '  const lang = primary(b.language);
  if (lang && hasExplicitList && !tags.some((t) => primary(t) === lang)) {' \
  '  const lang = primary(b.language);
  if (!lang || !hasExplicitList || !tags.some((t) => primary(t) === lang)) {' \
  "no observations at all silences every check"

# ---- control 5: single-use, the way it is actually enforced -------------------------------
# Freshness was first probed here by deleting ONLY the read guard, and the suite stayed green — which
# was at first mistaken for a decorative test. It is not. Single-use is enforced twice: the read
# guard, and `status = 'issued'` inside the consuming UPDATE's WHERE (a compare-and-set). Either one
# alone refuses a replay, so a control that removes one is MASKED by the other — and removing one does
# not open the hole. 5a and 5b record that redundancy as expected-green; control 5 removes BOTH, which
# is the only mutation under which a spent token really can be redeemed again, and the suite must go
# red there. The distinction is the point of running controls at all: it separates "the test is weak"
# from "the product has two locks on this door", and only the first is a defect.
GUARD_LINE='  if (row.status !== "issued") return { state: "replayed", detail: `token status=${row.status}` };
'
# ...and the CAS needle has to include its `.returning` line: the identical WHERE clause appears twice
# in this file — once to expire a stale token, once to consume a live one — and only the second is the
# control. A needle that matches both would mutate the wrong statement and "catch" nothing.
CAS_LINE='    .where(and(eq(humanChallenges.id, row.id), eq(humanChallenges.status, "issued")))
    .returning({ id: humanChallenges.id });'
CAS_RELAXED='    .where(eq(humanChallenges.id, row.id))
    .returning({ id: humanChallenges.id });'

control5both() {
  TOTAL=$((TOTAL + 1))
  echo "-- control 5: BOTH freshness enforcements removed (read guard + consuming CAS) -> a spent token is redeemable"
  backup "$LIVENESS"
  local b="$BACKUP"
  if ! NCTL_GUARD="$GUARD_LINE" NCTL_CAS="$CAS_LINE" NCTL_RELAXED="$CAS_RELAXED" NCTL_FILE="$ROOT/$LIVENESS" python3 - <<'NCPY'
import os, pathlib, sys
f = pathlib.Path(os.environ["NCTL_FILE"]); s = f.read_text()
guard, cas = os.environ["NCTL_GUARD"], os.environ["NCTL_CAS"]
if s.count(guard) != 1 or s.count(cas) != 1:
    print(f"needles not unique: guard={s.count(guard)} cas={s.count(cas)}", file=sys.stderr)
    sys.exit(3)
f.write_text(s.replace(guard, "").replace(cas, os.environ["NCTL_RELAXED"]))
NCPY
  then
    echo "   MUTATION FAILED — the needles are not unique in the current source; not counted"
    cp "$b" "$ROOT/$LIVENESS"; rm -f "$b"
    TOTAL=$((TOTAL - 1)); return 0
  fi
  local rc log
  log="$OUT/c5.log"
  rc="$(run_mode legacy "$log")"
  cp "$log" "$OUT/c5.$([[ $rc == 0 ]] && echo green || echo red).log"
  cp "$b" "$ROOT/$LIVENESS"; rm -f "$b"
  if caught "$rc" "$log" "freshness is single-use INDEPENDENT"; then
    echo "   CAUGHT  (a replayable token turns the legacy regression test red, which is the whole point of it)"
  else
    echo "   MISSED  (exit $rc): with both locks off, a replayed selfie would buy a badge and nothing notices"
    MISSED=$((MISSED + 1))
  fi
}
control5both

control 5a "only the read guard deleted (expected MASKED: the consuming CAS still refuses)" legacy "$LIVENESS" \
  "$GUARD_LINE" '' \
  "NEGCTL_EXPECT_MASKED"

control 5b "only the consuming CAS relaxed (expected MASKED: the read guard still refuses)" legacy "$LIVENESS" \
  "$CAS_LINE" "$CAS_RELAXED" \
  "NEGCTL_EXPECT_MASKED"

# Control 6 is a schema mutation, done in the database rather than in a file, and restored after.
if [[ -z "$ONLY" || ",$ONLY," == *",6,"* ]]; then
  TOTAL=$((TOTAL+1))
  echo "-- control 6: human_challenges_single_live goes back to including status (the lockout)"
  "$PSQL" "$PSQL_URL" -q <<'SQL' >/dev/null 2>&1
drop index if exists public.human_challenges_single_live;
create unique index human_challenges_single_live on public.human_challenges (email, purpose, status);
SQL
  rc="$(run_mode main "$OUT/c6.log")"
  "$PSQL" "$PSQL_URL" -q <<'SQL' >/dev/null 2>&1
drop index if exists public.human_challenges_single_live;
create unique index if not exists human_challenges_single_live on public.human_challenges (email, purpose) where status = 'issued';
SQL
  if caught "$rc" "$OUT/c6.log" "23505 regression"; then
    echo "   CAUGHT  (the suite's re-issue test saw the lockout)"
  else
    echo "   MISSED  (exit $rc): the lockout has no test behind it"
    MISSED=$((MISSED+1))
  fi
fi

echo
echo "== controls run: $TOTAL, missed: $MISSED  (log: $LOG) =="
[[ "$MISSED" == 0 && "$TOTAL" -gt 0 ]] || exit 1
echo "ALL CONTROLS CAUGHT — each of these defects would have been reported as a pass by a suite that cannot fail."
