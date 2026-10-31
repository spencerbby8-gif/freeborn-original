#!/usr/bin/env bash
# ============================================================================
# MIGRATION VERIFICATION against a REAL Postgres — 2026-10-30
#
# What this proves, and why a unit test cannot: both migrations in PR #26 change what the
# DATABASE will accept, and the whole unmatch design rests on a claim about foreign keys —
# "severing a conversation must not cascade the thread away, while account deletion still
# must". That is only checkable by executing it.
#
# Method (no production database is touched, ever):
#   1. `drizzle-kit generate` the schema from src/db/schema.ts into a scratch dir — the DDL
#      comes from the app's real source of truth, not a hand-written approximation.
#   2. Load it into a throwaway cluster, then apply the migration's own documented ROLLBACK
#      block. The fixture is now in the PRE-migration state production is in today.
#   3. Assert the pre-state really refuses an unmatch (status CHECK has no 'unmatched').
#   4. Apply the migration. Assert every structural claim + run the two-member scenario and
#      count rows: messages/chat_media must SURVIVE an unmatch and must NOT survive account
#      deletion.
#   5. Re-apply it (idempotency) and roll it back (reversibility).
#   6. Apply 2026-10-30-chat-signals.sql and test its RLS with an unprivileged role: the
#      participant reads, a non-participant gets zero rows, and NO client may write.
#
# Usage:  bash scripts/qa/pg-migration-verify.sh
# Env:    PGPORT/PGHOST to reuse a running cluster instead of spawning one (CI-friendly).
# ============================================================================
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${FB_VERIFY_DIR:-/tmp/fb-migration-verify}"
PGVER="${FB_PGVERSION:-17}"
PGBIN="/usr/lib/postgresql/${PGVER}/bin"
PORT="${FB_PGPORT:-55499}"
OK=0; BAD=0

say()  { printf '%s\n' "$*"; }
pass() { OK=$((OK+1));  printf '  ok   %s\n' "$*"; }
fail() { BAD=$((BAD+1)); printf '  FAIL %s\n' "$*"; }

# assert_sql <label> <sql-file>  — psql must exit 0 and print exactly one row: PASS
assert_sql() {
  local label="$1" file="$2" out
  out=$(psql -X -q -t -A -v ON_ERROR_STOP=1 -p "$PORT" -U "$PGUSER_NAME" -d fbtest -f "$file" 2>&1)
  if [ "$(printf '%s' "$out" | tail -1 | tr -d '[:space:]')" = "PASS" ]; then
    pass "$label"
  else
    fail "$label"; printf '%s\n' "$out" | sed 's/^/         /' | head -8
  fi
}
# assert_psql_fails <label> <sql>  — the statement must be REJECTED
assert_rejected() {
  local label="$1" sql="$2" out
  out=$(psql -X -q -v ON_ERROR_STOP=1 -p "$PORT" -U "$PGUSER_NAME" -d fbtest -c "$sql" 2>&1)
  if [ -n "$out" ]; then pass "$label"; else fail "$label  (it SUCCEEDED — the database accepted something it must not)"; fi
}
count_is() { # count_is <label> <sql> <expected>
  local label="$1" sql="$2" want="$3" got
  got=$(psql -X -t -A -p "$PORT" -U "$PGUSER_NAME" -d fbtest -c "$sql" | tr -d '[:space:]')
  if [ "$got" = "$want" ]; then pass "$label ($got)"; else fail "$label — got '$got', want '$want'"; fi
}

say "== workspace: $WORK"
rm -rf "$WORK"; mkdir -p "$WORK"
cd "$REPO" || exit 2

# ---------------------------------------------------------------- 1. real DDL
say "-- generating schema DDL from src/db/schema.ts"
cat > "$WORK/drizzle.config.json" <<JSON
{ "dialect": "postgresql", "schema": "./src/db/schema.ts", "out": "$WORK/gen" }
JSON
npx drizzle-kit generate --config "$WORK/drizzle.config.json" > "$WORK/gen.log" 2>&1 \
  || { say "FATAL: drizzle-kit generate failed"; tail -5 "$WORK/gen.log"; exit 2; }
DDL=$(ls "$WORK"/gen/0000_*.sql | head -1)
[ -n "${DDL:-}" ] || { say "FATAL: no DDL produced"; exit 2; }
# drizzle separates statements with a marker; turn it into real semicolons
sed 's/--> statement-breakpoint/;/g' "$DDL" > "$WORK/schema.sql"
say "   $(grep -ciE '^[[:space:]]*create table' "$WORK/schema.sql") tables, $(wc -l < "$WORK/schema.sql") lines of DDL (from the app's own schema source)"

# ------------------------------------------------------- 2. throwaway cluster
if [ -n "${USE_RUNNING_PG:-}" ]; then
  say "-- using the cluster already listening on $PORT"
else
  [ -x "$PGBIN/initdb" ] || { say "FATAL: $PGBIN/initdb not found (FB_PGVERSION / USE_RUNNING_PG are knobs)"; exit 2; }
  # initdb refuses to run as root, and the server must own its data dir. Use the current
  # user; only escalate (via sudo -n, never a password) if we happen to BE root.
  ME="$(id -un)"; PGUSER_NAME="${FB_PGUSER:-$ME}"
  [ "$ME" = "root" ] && PGUSER_NAME="${FB_PGUSER:-postgres}"
  say "-- initdb into $WORK/data as $PGUSER_NAME"
  [ "$ME" = "root" ] && chown -R "$PGUSER_NAME" "$WORK" 2>/dev/null
  run() {
    if [ "$(id -un)" = "$PGUSER_NAME" ]; then "$@"
    elif [ "$(id -un)" = "root" ]; then sudo -n -u "$PGUSER_NAME" "$@"
    else say "FATAL: cannot run the cluster as $PGUSER_NAME while logged in as $(id -un) (set FB_PGUSER or USE_RUNNING_PG)"; exit 2; fi
  }
  run "$PGBIN/initdb" -D "$WORK/data" -A trust > "$WORK/initdb.log" 2>&1 || { say "FATAL: initdb"; tail -3 "$WORK/initdb.log"; exit 2; }
  run "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/server.log" start > /dev/null 2>&1
  for _ in 1 2 3 4 5 6 7 8 9 10; do "$PGBIN/pg_isready" -h "$WORK" -p "$PORT" >/dev/null 2>&1 && break; sleep 1; done
  export PGHOST="$WORK"
  trap 'run "$PGBIN/pg_ctl" -D "$WORK/data" stop -m fast >/dev/null 2>&1' EXIT
fi
: "${PGUSER_NAME:=${FB_PGUSER:-$(id -un)}}"
export PGPORT="$PORT" PGUSER="$PGUSER_NAME" PGDATABASE=postgres
psql -X -q -c "drop database if exists fbtest" >/dev/null 2>&1
psql -X -q -c "create database fbtest" >/dev/null 2>&1 || { say "FATAL: cannot create fbtest"; exit 2; }
# Extensions the app's columns rely on (production creates these in its own bootstrap).
for ext in citext pgcrypto; do
  psql -X -q -d fbtest -c "create extension if not exists \"$ext\"" >/dev/null 2>&1 \
    || say "   (extension $ext unavailable in this cluster — columns using it may not load)"
done
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -f "$WORK/schema.sql" > "$WORK/load.log" 2>&1 \
  || { say "FATAL: schema load failed"; tail -6 "$WORK/load.log"; exit 2; }
pass "the app's real schema loads into Postgres ${PGVER}"

MIG="$REPO/db/migrations/2026-10-30-unmatch-detach.sql"
SIG="$REPO/db/migrations/2026-10-30-chat-signals.sql"
[ -f "$MIG" ] && [ -f "$SIG" ] || { say "FATAL: a migration file is missing"; exit 2; }

# ------------------------------------------- 3. force the PRE-migration state
cat > "$WORK/prestate.sql" <<'SQL'
-- exactly the rollback block from 2026-10-30-unmatch-detach.sql
alter table public.matches drop constraint if exists matches_unmatched_has_actor;
alter table public.matches drop constraint if exists matches_unmatch_reason_check;
alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches add constraint matches_status_check check (status in ('active','archived','blocked'));
drop index if exists public.matches_status_idx;
drop index if exists public.matches_unmatched_at_idx;
alter table public.matches drop column if exists unmatch_reason;
alter table public.matches drop column if exists unmatched_at;
alter table public.matches drop column if exists unmatched_by;
select 'PASS';
SQL
assert_sql "the rollback block runs, leaving the schema in production's current pre-state" "$WORK/prestate.sql"

count_is "pre-state: unmatched_by is absent" \
  "select count(*) from information_schema.columns where table_name='matches' and column_name='unmatched_by'" "0"
PRE_DEF=$(psql -X -t -A -d fbtest -c "select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.matches'::regclass and conname='matches_status_check'")
case "$PRE_DEF" in
  *unmatched*) fail "pre-state CHECK still accepts 'unmatched' — the fixture is not really pre-migration, so every assertion below would prove nothing" ;;
  *)           pass "pre-state CHECK rejects 'unmatched'  [$PRE_DEF]" ;;
esac

# a fixture pair, in the pre-migration state
cat > "$WORK/fixture.sql" <<'SQL'
-- user_profiles.id is itself an FK into accounts.id, so the member rows need their account
-- rows first. (Verified against the generated DDL: user_profiles_id_accounts_id_fk.)
insert into public.accounts (id, email)
values ('00000000-0000-0000-0000-00000000000a','ada@example.test'),
       ('00000000-0000-0000-0000-00000000000b','ben@example.test'),
       ('00000000-0000-0000-0000-00000000000c','cy@example.test')
on conflict (id) do nothing;
insert into public.user_profiles (id, email, display_name)
values ('00000000-0000-0000-0000-00000000000a','ada@example.test','Ada'),
       ('00000000-0000-0000-0000-00000000000b','ben@example.test','Ben')
on conflict (id) do nothing;
insert into public.matches (id, user_a, user_b, status)
values ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','active')
on conflict do nothing;
insert into public.messages (id, match_id, sender_id, body)
values ('22222222-2222-2222-2222-222222222221','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000a','hi'),
       ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-00000000000b','hey')
on conflict do nothing;
-- one attachment in the conversation, one profile-upload blob with NO conversation
insert into public.chat_media (id, sender_id, kind, mime, data, match_id)
values ('33333333-3333-3333-3333-333333333331','00000000-0000-0000-0000-00000000000a','image','image/jpeg',
        decode('ffd8ffe0','hex'),'11111111-1111-1111-1111-111111111111'),
       ('33333333-3333-3333-3333-333333333332','00000000-0000-0000-0000-00000000000a','image','image/jpeg',
        decode('ffd8ffe0','hex'),null)
on conflict do nothing;
select 'PASS';
SQL
assert_sql "fixture: two members, one active match, 2 messages, 2 chat_media rows" "$WORK/fixture.sql"

# Without this, every assert_rejected below could pass vacuously: an UPDATE whose WHERE clause
# matches nothing "succeeds" while changing no data, and a rejection test would report a
# constraint that never fired. Pin the row count first.
count_is "precondition: the fixture really stored 2 messages" "select count(*) from public.messages" "2"
count_is "precondition: and 2 chat_media rows" "select count(*) from public.chat_media" "2"
count_is "precondition: and one active match" "select count(*) from public.matches where status='active'" "1"

say "-- the pre-state must reject an unmatch outright (this is why the migration gates the code)"
assert_rejected "status='unmatched' is refused by the old three-value CHECK" \
  "update public.matches set status='unmatched' where id='11111111-1111-1111-1111-111111111111'"

# --------------------------------------------------- 4. apply the migration
say "-- applying 2026-10-30-unmatch-detach.sql"
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -f "$MIG" > "$WORK/mig.log" 2>&1 \
  && pass "the migration applies cleanly on top of the pre-state" \
  || { fail "the migration failed to apply"; sed 's/^/         /' "$WORK/mig.log" | head -6; }

cat > "$WORK/a1.sql" <<'SQL'
do $$
declare n int; def text;
begin
  -- the vocabulary is widened
  select pg_get_constraintdef(oid) into def from pg_constraint
    where conrelid='public.matches'::regclass and conname='matches_status_check';
  if def not like '%unmatched%' then raise exception 'ASSERT: matches_status_check does not accept unmatched: %', def; end if;

  -- provenance columns exist and are nullable
  select count(*) into n from information_schema.columns
    where table_name='matches' and column_name in ('unmatched_by','unmatched_at','unmatch_reason');
  if n <> 3 then raise exception 'ASSERT: expected 3 unmatch columns, found %', n; end if;

  -- unmatched_by is SET NULL on account deletion, so the survivor keeps the record of why
  select count(*) into n from pg_constraint
    where conrelid='public.matches'::regclass and contype='f' and confdeltype='n'
      and conkey @> array[(select attnum from pg_attribute where attrelid='public.matches'::regclass and attname='unmatched_by')]::smallint[];
  if n <> 1 then raise exception 'ASSERT: unmatched_by is not on delete set null (found %)', n; end if;

  -- both indexes ship
  select count(*) into n from pg_indexes where tablename='matches' and indexname in ('matches_status_idx','matches_unmatched_at_idx');
  if n <> 2 then raise exception 'ASSERT: expected 2 new indexes, found %', n; end if;

  -- THE CENTRAL CLAIM: severing must not destroy the shared history.
  update public.matches set status='unmatched', unmatched_by='00000000-0000-0000-0000-00000000000a',
         unmatched_at=now(), unmatch_reason='not_interested'
    where id='11111111-1111-1111-1111-111111111111';
  select count(*) into n from public.messages where match_id='11111111-1111-1111-1111-111111111111';
  if n <> 2 then raise exception 'ASSERT: unmatch destroyed the thread — % messages left, expected 2', n; end if;
  select count(*) into n from public.chat_media where match_id='11111111-1111-1111-1111-111111111111';
  if n <> 1 then raise exception 'ASSERT: unmatch orphaned the attachment — % chat_media rows left, expected 1', n; end if;
  select count(*) into n from public.matches where id='11111111-1111-1111-1111-111111111111';
  if n <> 1 then raise exception 'ASSERT: the match row itself must survive an unmatch (found %)', n; end if;
end $$;
select 'PASS';
SQL
assert_sql "after the migration: severed thread keeps its 2 messages, its attachment and its match row" "$WORK/a1.sql"

say "-- the new constraints must actually bite"
assert_rejected "an 'unmatched' row with no actor is refused (matches_unmatched_has_actor)" \
  "update public.matches set status='unmatched', unmatched_by=null, unmatched_at=null where id='11111111-1111-1111-1111-111111111111'"
assert_rejected "an invented reason is refused (matches_unmatch_reason_check)" \
  "update public.matches set unmatch_reason='stalking_harassment' where id='11111111-1111-1111-1111-111111111111'"
assert_rejected "a status outside the four-value vocabulary is still refused" \
  "update public.matches set status='ghosted' where id='11111111-1111-1111-1111-111111111111'"
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -c \
  "update public.matches set unmatch_reason=null where id='11111111-1111-1111-1111-111111111111'" >/dev/null 2>&1 \
  && pass "no reason stays legal — the API's optional-reason contract matches the CHECK" \
  || fail "NULL reason was rejected, but the API treats a reason as optional"

say "-- account deletion must STILL purge (the cascades are load-bearing, not dead weight)"
count_is "before: messages on the fixture match" "select count(*) from public.messages" "2"
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -c \
  "delete from public.user_profiles where id='00000000-0000-0000-0000-00000000000a'" >/dev/null 2>&1 \
  || fail "deleting a member's profile errored"
count_is "after: the conversation rows are gone with the member's profile (match cascade)" \
  "select count(*) from public.messages" "0"
# The attachment linked to the conversation goes with the match (FK cascade). The blob with
# match_id NULL — a PROFILE-photo upload, which never has a conversation — is only reachable by
# the route's explicit `delete from chat_media where sender_id = …`; the schema does not cover
# it. Asserting them apart keeps that distinction true instead of papering over it.
count_is "after: the conversation-linked attachment row cascaded away" \
  "select count(*) from public.chat_media where match_id is not null" "0"
count_is "after: the sender-only profile blob is the one no FK covers (route must delete it)" \
  "select count(*) from public.chat_media where match_id is null" "1"
count_is "after: the match row is gone" "select count(*) from public.matches" "0"

# ------------------------------------------------------------ 5. idempotency
say "-- re-running both migrations must be a no-op, and the rollback must round-trip"
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -f "$MIG" > "$WORK/mig2.log" 2>&1 \
  && pass "unmatch migration is idempotent (second apply is clean)" || { fail "second apply failed"; tail -3 "$WORK/mig2.log"; }
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -f "$WORK/prestate.sql" > /dev/null 2>&1 \
  && pass "its rollback block runs again after the migration (round-trip is real)" || fail "rollback block failed"
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -f "$MIG" > /dev/null 2>&1 \
  && pass "and the migration re-applies on top of that" || fail "re-apply after rollback failed"

# ------------------------------------------------------------- 6. chat signals
say "-- applying 2026-10-30-chat-signals.sql (RLS tested with a real unprivileged role)"
# Supabase ships `anon` and `authenticated` roles and its policies target them; a vanilla
# cluster does not, so create them — otherwise "policy applies to the right role" is untested.
cat > "$WORK/roles.sql" <<'SQL'
-- NOTE the distinct dollar-quote tags: a nested $$ inside do $$ ends the block early,
-- which is exactly how this bootstrap failed the first time (silently, because the heredoc
-- swallowed it) and every policy test afterwards reported "role does not exist".
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  -- service_role too, not just the two client roles: 2026-10-30-chat-signals.sql grants the
  -- definer helper EXECUTE to `authenticated, service_role`, and on a vanilla cluster that
  -- GRANT aborted the whole migration — the policy was then never created and every read test
  -- below failed for a reason that had nothing to do with RLS. A fixture must know every role
  -- the shipped DDL names.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  -- Supabase owns the `auth` schema and its auth.uid(); the shipped policy calls it, so a
  -- cluster without it cannot evaluate the policy at all. Stub it the same way: a stable
  -- function reading the request-scoped claim.
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as
    $uid$ select nullif(current_setting('fb.test_uid', true), '')::uuid $uid$;
  grant usage on schema auth to public;
  grant execute on function auth.uid() to public;
end
$roles$;
SQL
psql -X -q -d fbtest -f "$WORK/roles.sql" > "$WORK/roles.log" 2>&1 \
  && pass "Supabase's anon/authenticated/service_role roles emulated (a policy that targets a missing role would silently apply to nobody)" \
  || { fail "role bootstrap failed"; sed 's/^/         /' "$WORK/roles.log" | head -3; }

psql -X -q -v ON_ERROR_STOP=1 -d fbtest -f "$SIG" > "$WORK/sig.log" 2>&1 \
  && pass "the signal table migration applies" || { fail "signal migration failed"; sed 's/^/         /' "$WORK/sig.log" | head -6; }
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -f "$SIG" > "$WORK/sig2.log" 2>&1 \
  && pass "idempotent — and its publication guard tolerates a deployment with no supabase_realtime publication" \
  || { fail "second signal apply failed (the publication guard is not actually guarding)"; tail -3 "$WORK/sig2.log"; }

cat > "$WORK/a2.sql" <<'SQL'
-- the guard is what lets this run outside Supabase: adding a table to a publication that
-- does not exist would abort a real deploy on any project that renames or drops it.
do $$
declare n int;
begin
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='public' and c.relname='chat_signals' and c.relrowsecurity and c.relforcerowsecurity;
  if n <> 1 then raise exception 'ASSERT: chat_signals must exist with RLS enabled AND forced (found %)', n; end if;
  select count(*) into n from pg_policies where tablename='chat_signals';
  if n <> 1 then raise exception 'ASSERT: expected exactly ONE policy on chat_signals, found %', n; end if;
  select count(*) into n from pg_policies where tablename='chat_signals' and cmd <> 'SELECT';
  if n <> 0 then raise exception 'ASSERT: a write policy leaked into chat_signals (% non-SELECT policies)', n; end if;
  select count(*) into n from pg_constraint where conrelid='public.chat_signals'::regclass and contype='c';
  if n <> 1 then raise exception 'ASSERT: the kind CHECK is missing (found %) — a table created by `drizzle-kit push` without this migration would have no vocabulary guard', n; end if;
  -- existence is not enough. Read the CHECK's own text and require exactly the four kinds the
  -- server can write; a narrower or wider set is drift between schema.ts and the migration.
  select count(*) into n from pg_constraint
   where conrelid='public.chat_signals'::regclass and conname='chat_signals_kind_check'
     and pg_get_constraintdef(oid) like '%''message''%'
     and pg_get_constraintdef(oid) like '%''typing''%'
     and pg_get_constraintdef(oid) like '%''severed''%'
     and pg_get_constraintdef(oid) like '%''cleared''%'
     and pg_get_constraintdef(oid) not like '%''unread''%';
  if n <> 1 then raise exception 'ASSERT: the kind CHECK does not carry the four server-writable kinds (found %)', n; end if;
  -- no message content can possibly be stored here: the table has 4 columns and no text payload
  select count(*) into n from information_schema.columns where table_name='chat_signals';
  if n > 5 then raise exception 'ASSERT: chat_signals grew columns beyond the signal contract (% )', n; end if;
end $$;
select 'PASS';
SQL
assert_sql "RLS forced, one SELECT policy, zero write policies, closed kind vocabulary, no content columns" "$WORK/a2.sql"

# the privilege boundary, tested as a client would meet it
# --------------------------------------------------------------------------- 6b. privilege tests
# Re-run the fixture with a real `psql -f` (the account-deletion section above deleted member
# `a`, and with it that pair's match row — that cascade is the point of it). A `\i $WORK/x.sql`
# inside a <<'SQL' heredoc does NOT expand $WORK, and psql without ON_ERROR_STOP carries on
# regardless: that is how this section once read a populated-looking but wrong fixture.
if psql -X -q -t -A -v ON_ERROR_STOP=1 -p "$PORT" -U "$PGUSER_NAME" -d fbtest \
     -f "$WORK/fixture.sql" > "$WORK/fixture2.log" 2>&1; then
  pass "fixture re-applied for the privilege tests"
else
  fail "fixture re-apply failed"; sed 's/^/         /' "$WORK/fixture2.log" | head -4
fi

cat > "$WORK/a3.sql" <<'SQL'
drop role if exists fb_client;
-- INHERIT is not cosmetic here. Postgres decides which RLS policies apply with
-- has_privs_of_role(), which IGNORES a NOINHERIT membership: a member role would then hit
-- "One-Time Filter: false" and read nothing, and the failure looks exactly like a broken
-- policy. Supabase is unaffected because PostgREST does `set local role authenticated`, i.e.
-- it connects AS the role the policy names — which is what `set role authenticated` below
-- reproduces deliberately.
create role fb_client login inherit;
grant authenticated to fb_client;
grant usage on schema public to fb_client;
grant select on public.chat_signals to fb_client;
grant select on public.matches to fb_client;
grant select on public.user_profiles to fb_client;
grant usage on schema auth to fb_client;
grant execute on function auth.uid() to fb_client;
-- `set role authenticated` inherits nothing from fb_client: privileges are granted TO the role
-- that runs the query. Supabase works the same way (its migrations grant anon/authenticated
-- explicitly), so the emulation has to as well or the "read as authenticated" test below fails
-- for a reason that has nothing to do with RLS.
grant usage on schema public to authenticated;
grant select on public.chat_signals to authenticated;
grant select on public.matches to authenticated;
grant select on public.user_profiles to authenticated;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
SQL
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -f "$WORK/a3.sql" > "$WORK/a3.log" 2>&1 \
  || { fail "client role bootstrap failed"; sed 's/^/         /' "$WORK/a3.log" | head -4; }
psql -X -q -d fbtest -c "insert into public.user_profiles (id,email,display_name) values ('00000000-0000-0000-0000-00000000000c','cy@example.test','Cy') on conflict (id) do nothing" >/dev/null 2>&1
psql -X -q -d fbtest -c "insert into public.matches (id,user_a,user_b,status) values ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c','active') on conflict do nothing" >/dev/null 2>&1
# Seed the signal row on the FIXTURE's conversation, by its known id — never `select id from
# matches limit 1`, which can silently return a different pair and make every count below true
# for the wrong reason.
# `id` is `bigint generated always as identity`, so an explicit id is REJECTED by the schema -
# and piping that failure to /dev/null left the reads below running against an empty table.
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -c "delete from public.chat_signals; insert into public.chat_signals (match_id,kind) values ('11111111-1111-1111-1111-111111111111','message')" > "$WORK/seed.log" 2>&1 \
  || { fail "could not seed the signal row"; sed 's/^/         /' "$WORK/seed.log" | head -3; }

# ---------------------------------------------------------------------------
# Mirror PRODUCTION's enforcement on `matches` before any client-role read runs.
#
# The scratch schema comes from drizzle-kit, which encodes NO row-level security, and
# production's RLS came from migrations this script never applies. That gap let the
# original policy — `exists (select 1 from public.matches ...)` — read as `authenticated`
# and PASS here while returning ZERO rows in production (measured 2026-10-31:
# sees_matches=0 sees_signals=0). A fixture that is more permissive than production cannot
# detect a policy that depends on a locked table. So: enable + FORCE row security on
# `matches`, which has no policies in either database, exactly as production has it.
psql -X -q -v ON_ERROR_STOP=1 -d fbtest -c "alter table public.matches enable row level security; alter table public.matches force row level security" >/dev/null 2>&1 \
  && pass "matches locked to production's shape (RLS enabled + forced, zero policies) before client reads" \
  || fail "could not apply production's RLS shape to the fixture"

count_is "precondition: the seeded conversation has Ada as user_a and Ben as user_b" \
  "select count(*) from public.matches where id='11111111-1111-1111-1111-111111111111' and user_a='00000000-0000-0000-0000-00000000000a' and user_b='00000000-0000-0000-0000-00000000000b'" "1"
count_is "precondition: and the signal row the reads below depend on exists" \
  "select count(*) from public.chat_signals where match_id='11111111-1111-1111-1111-111111111111'" "1"

# One session per read: `set role` and the auth.uid() stand-in must both be live for the SELECT.
run_as() {   # raw output, for statements whose ERROR TEXT is itself the assertion
  cat > "$WORK/run.sql" <<SQL
set role $2;
select set_config('fb.test_uid', '$1', false);
$3
SQL
  psql -X -q -t -A -d fbtest -f "$WORK/run.sql" 2>&1
}
read_as() {  # last line only, for scalar counts
  run_as "$1" "$2" "$3" | tail -1 | tr -d '[:space:]'
}
ADA='00000000-0000-0000-0000-00000000000a'; BEN='00000000-0000-0000-0000-00000000000b'
CY='00000000-0000-0000-0000-00000000000c'
Q='select count(*) from public.chat_signals'

[ "$(read_as "$ADA" fb_client "$Q")" = "1" ] \
  && pass "member A reads their own conversation's signal" \
  || fail "member A could not read the signal"
[ "$(read_as "$BEN" fb_client "$Q")" = "1" ] \
  && pass "and so can member B — the policy is symmetric, not owner-biased" \
  || fail "member B could not read the signal"
[ "$(read_as "$ADA" authenticated "$Q")" = "1" ] \
  && pass "reading AS the authenticated role works too, which is how PostgREST actually runs" \
  || fail "authenticated could not read the signal — in production NOTHING would be delivered"
[ "$(read_as "$CY" fb_client "$Q")" = "0" ] \
  && pass "an unrelated member reads ZERO from a table they hold SELECT on — the policy, not the grant, decides" \
  || fail "a non-participant could read someone else's signal"
[ "$(read_as "" fb_client "$Q")" = "0" ] \
  && pass "no auth.uid (signed-out) reads nothing" \
  || fail "an anonymous request read signals"
[ "$(read_as "$CY" fb_client "select count(*) from public.matches")" = "0" ] \
  && pass "a client reads ZERO rows from matches even holding SELECT — the locked-table shape production has" \
  || fail "fixture does not mirror production: matches should read 0 rows to a client role, got $(read_as "$CY" fb_client "select count(*) from public.matches")"

# The control that makes the assertion above meaningful: the OLD predicate form, evaluated by
# hand as the same member, must find nothing now that matches is locked. If this returned 1,
# the fixture would still be too permissive to have caught the production bug.
NAIVE=$(read_as "$ADA" authenticated "select count(*) from public.chat_signals cs where exists (select 1 from public.matches m where m.id = cs.match_id and (m.user_a = auth.uid() or m.user_b = auth.uid()))" | tail -1 | tr -d '[:space:]')
[ "$NAIVE" = "0" ] \
  && pass "control: the pre-fix predicate form reads 0 rows for a real participant — the bug is now detectable" \
  || fail "control broken: the pre-fix form reads $NAIVE rows, so this fixture cannot catch an unsatisfiable policy"

denials=0
for stmt in "insert into public.chat_signals (match_id,kind) values ('11111111-1111-1111-1111-111111111111','message')" \
            "delete from public.chat_signals" \
            "update public.chat_signals set kind = 'typing'"; do
  out=$(run_as "$BEN" fb_client "$stmt")
  if printf '%s' "$out" | grep -qiE "permission denied|row-level security"; then
    denials=$((denials + 1))
  else
    fail "a client was allowed to run: ${stmt:0:22}... - $(printf '%s' "$out" | tail -1)"
  fi
done
[ "$denials" = "3" ] && pass "clients can neither insert, delete, nor update a signal row (nobody can spam, mute or rewrite a peer's channel)"

# ------------------------------------------------------ 6b. the flaw class, generally
# Any policy whose predicate reads an RLS-locked table (enabled, zero policies) directly is
# unsatisfiable for the role it guards. This is the shape of the bug that reached production.
# `match_messages`' two legacy policies are listed as known-inert exceptions on purpose: the
# table has no writer in this codebase, so pinning them here would force unrelated churn.
cat > "$WORK/policyscan.sql" <<'SQL'
with locked as (
  select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p where p.tablename=c.relname and p.schemaname='public')
),
scan as (
  select p.tablename, p.policyname,
    (select string_agg(l.relname, ', ' order by l.relname) from locked l
      where position(l.relname in coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) > 0) as refs_locked
  from pg_policies p where p.schemaname='public'
)
select case
  when count(*) filter (where refs_locked is not null
        and not (tablename='match_messages' and policyname in
          ('Match participants can read messages','Match participants can send messages'))) > 0
  then 'FAIL: ' || (select string_agg(tablename||'.'||policyname||' -> '||refs_locked, '; ')
                      from scan where refs_locked is not null
                        and not (tablename='match_messages' and policyname in
                          ('Match participants can read messages','Match participants can send messages')))
  else 'PASS'
end as verdict
from scan;
SQL
assert_sql "no policy anywhere reads an RLS-locked table directly (the unsatisfiable-policy class)" "$WORK/policyscan.sql"

# --------------------------------------------------------- 7. the old tables
say "-- the design claim that the LIVE chat tables must stay unreadable from a client"
out=$(run_as "$BEN" fb_client "select count(*) from public.messages")
printf '%s' "$out" | grep -qi "permission denied" \
  && pass "messages is not selectable by any client role — which is WHY chat_signals exists (postgres_changes on messages would deliver nothing)" \
  || fail "messages was readable by a client role — the signal-table premise would be wrong"

say ""
say "───────────────────────────────────────────────"
if [ "$BAD" -eq 0 ]; then say "ALL PASS  ($OK/$((OK+BAD)) migration assertions executed against real Postgres)"; exit 0
else say "FAILURES: $BAD  ($OK passed)"; exit 1; fi
