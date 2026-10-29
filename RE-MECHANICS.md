# Freeborn identity, trust and enforcement mechanics

Implemented from reverse-engineering evidence, 2026-10-28. Companion to
`FREEBORN-AUDIT-2026-10-28.md` (product/security audit) and `/home/user/re/FINDINGS.md`
(the REA reverse-engineering report, which is a workspace artifact, not repo content).

Every statement below is tagged:

- **RECOVERED** — literal string or structure present in a publicly served client bundle I
  downloaded and read.
- **VERIFIED** — confirmed in the live Freeborn database or by executing Freeborn code.
- **INFERRED** — a reasonable conclusion from evidence that does not prove it.
- **MEASURED** — a number produced by running Freeborn's own code in this session.

Nothing here claims knowledge of Bumble/Hinge/Tinder server-side internals. Where a mechanism is
described, the evidence is a client bundle, an official help centre / trust-and-safety page, an
engineering post, or public reporting.

---

## 1. What was reproduced, and where

| # | Mechanism (source app) | Evidence tier | Freeborn implementation |
|---|---|---|---|
| 1 | Perceptual photo hashing at upload (Tinder `/v2/verification/facemap/photo-match`, Bumble Veriff) | RECOVERED (endpoint names) / INFERRED (that they hash server-side) | `src/lib/photo-hash.ts`, called by `POST /api/profile/photos` |
| 2 | Duplicate-photo / same-image-across-accounts resolution (FaceTec "same face, many accounts") | RECOVERED (FaceTec product behaviour, public docs) | `findDuplicatePhotos()` + `deriveAnchor()` + `identity_fingerprints` |
| 3 | Identity fingerprint stored on verification success | INFERRED | `upsertFingerprint()`, called from `POST /api/verification/check` |
| 4 | Device / install-id linkage and shared-device fan-out (Tinder `persistent-device-id`, Bumble `device_id`) | RECOVERED (header/param names in bundles) | `account_devices`, `POST /api/device/self`, `linkDevice()` |
| 5 | Composite trust score feeding moderation priority | INFERRED (Match: "169 automated rules, 108 improved", NBC 2026-10-14) | `src/lib/trust-score.ts`, `user_trust_history`, `GET /api/trust/self` |
| 6 | Graduated enforcement ladder + suppression + acknowledgement (Tinder `WARNING/SUPPRESSION/SUSPENSION/BAN`, `/v1/case/warnings/acknowledge`) | RECOVERED (literal enums in the web bundle) | `src/lib/moderation-policy.ts`, `enforcement_cases`, `GET /api/safety/cases`, `POST /api/safety/cases/ack` |
| 7 | Durable scam-guard signal feeding review priority (Bumble Deception Detector, Tinder "scam" report reason) | RECOVERED (report reason list) | `recordScamFlag()` from `POST /api/chat/messages` |
| 8 | Human challenge gating an appeal (Tinder `appealChallengeToken`, Arkose) | RECOVERED (param + action names) | `POST /api/human/issue` + `POST /api/human/verify`, consumed in `POST /api/appeals` |
| 9 | Server-driven report taxonomy | RECOVERED (`/v4/report/tree`) | `REASON_TO_CASE` in `POST /api/reports` — a server-side mapping, **not** a fetched tree |
| 10 | Agent/bot cadence gate (Tinder `X-Agent-Signals` + forced logout) | RECOVERED (header, path list, logout logic) | Partial: proof-of-work gate only. **No session-cadence collector exists.** |

Suppression is wired into the one query that builds the deck (`GET /api/profiles` excludes
`suppressedUserIds()`), and `suppressedUserIds()` now reads **both** sources `isSuppressed()`
reads — an open `suppression` case *or* `user_trust_history.suppression_active`. Before that fix
the two disagreed, i.e. a suppressed account could still be served. **VERIFIED** by executing both
queries against production.

---

## 2. Production bugs found by executing, not by building

These are the parts of the task that only running the real thing could deliver. None of them was
visible to `tsc`, `eslint`, or `next build`.

### 2.1 Every hashed photo upload would have failed — `22P02`

The migration declared all six hash columns `bit(64)`; `src/lib/photo-hash.ts` emits 16-hex-char
strings (`digest("hex")`). TypeScript types both as `string`, so the mismatch compiled cleanly.
Live proof:

```
DrizzleQueryError … cause: error: "d" is not a valid binary digit
  code 42P02 … routine: bit_in
```

Fix: live migration `freeborn_identity_enforcement_2026_10_28_c` converted the columns to
`char(16)` and added `profile_photos.phash_bytes char(64)`. Verified in `information_schema`:

```
account_devices.device_hash      character(16)
human_challenges.token_hash      character(16)
identity_fingerprints.anchor     character(16)
identity_fingerprints.photo_ahash/dhash character(16)
profile_photos.phash_a/phash_d   character(16)
profile_photos.phash_bytes       character(64)
```

After the fix the same write path that threw now succeeds:
`insert ok=true`, readback `d=deadbeefdeadbeef a=0123456789abcdef bytes=aaaaaaaa…`.

### 2.2 `public.hamming64()` could not run at all — three separate defects

Each was found by calling the function against the live cluster, and each fix broke on the next:

1. `text::bit(64)` / `bytea::bit(8)` → `42846 cannot cast type bytea to bit`, `22P02 "f" is not a
   valid binary digit`. **Postgres has no hex-to-bit cast.**
2. `popcount(bigint)` → `42883 function does not exist`. This cluster is **PG 17.6** and exposes
   only `bit_count(bytea)` and `bit_count(bit)`.
3. `power(16::numeric, k)` returns **non-integral** values here: `16^7 → 268435455.9375`,
   `16^0 → 0.0625`. Any radix-power parse built on it is wrong for every input, and its
   `::integer` cast raised `22003 integer out of range`.
4. A **difference is not a Hamming distance**: `0x80000000` vs `0x7fffffff` differ in 32 bits but
   subtract to 1. Also `% 4294967296` can return 4294967295, which does not fit `::integer`.

Final form (live, migration `_g`): integer-only nibble extraction per 4-hex-char group, XOR,
`bit_count(bit(16))`. **MEASURED** agreement with an independent bit-level oracle over 13 vectors:
13/13, including `ffffffffffffffff` → 64, `0000000100000001` → 2, `1234567890abcdef`/
`abcdef1234567890` → 42. Malformed, wrong-length and NULL input return NULL rather than raising,
so one bad row cannot abort a moderation scan and silently drop the remaining candidates.

### 2.3 The shipped proof-of-work difficulty locked out real users

`CHALLENGE_DIFFICULTY_BITS = 20` was justified in a comment by an estimate ("~1M candidates,
1–3 s on a phone"). Measured with the exact encoding the client sends (decimal **string**, which is
what `/api/human/verify` re-checks) and a 4,000,000-candidate solver budget:

| difficulty | unsolved nonces | mean | worst |
|---|---|---|---|
| 18-bit | **0 / 120 (0.0%)** | 175 ms | 1,182 ms |
| 20-bit | **5 / 106 (4.7%)** | 832 ms | 2,575 ms |
| 22-bit | 17 / 50 (34.0%) | 1,396 ms | 3,511 ms |

So roughly **one member in twenty** would have been unable to complete their own appeal — the worst
possible failure for a control meant to punish automation. Default is now **18**, with
`MAX_CHALLENGE_DIFFICULTY_BITS = 20` as a hard ceiling (above it the control is unreliable rather
than merely costly), `difficultyForRisk("standard"|"elevated"|"high")` → 18/19/20, and
`solverBudget` + `onExhausted` returned in the issue payload: a client whose budget runs out must
re-request a **fresh nonce**, not retry the same one (solvability is decided by the nonce, so a
retry loop on a bad nonce fails forever; one retry takes 4.7% to 0.22%).

### 2.4 The test harness itself was lying, twice

- `ok("name")` with no condition counted as a **pass**. A typo'd assertion was green.
- The summary block sat in the **middle** of the file, so every section appended after it ran,
  printed, and was **not counted**: it reported `62/62` while 80 assertions had passed.

Both fixed (`total` counts calls, `cond === true` required, reporter/counter cross-check,
`process.exitCode = 1` on failure). Negative controls prove the suite can go red: injecting a false
assertion yields `FAILURES: 1 (79/80)` and exit code 1.

### 2.5 Two of my own "improvements" were measured to be worse and reverted

Shift-tolerant dHash (9 windows over a 17×8 strip) and a best-of-windows scan over 24×12 both
scored 22–25 at a 5% crop, i.e. they did not help. Shipped instead: the exact-bytes `sha256`
(`phash_bytes`), which is what actually survives "download, re-upload unchanged". **MEASURED**
crop sensitivity: dHash distance 15 at a 5% crop, 2 after recompression q88→q40, 2 after
640×480→320×240, 6 at +25% brightness, 29 for an unrelated photo, 49 for a mirror.

---

## 3. Live state, read from production

| Check | Result |
|---|---|
| `profile_photos` rows | 12 (7 pre-date hashing, stored in the Supabase bucket; 4 have local bytes and are hashed) |
| Photos with `phash_d` | 4 — e.g. `dcd733717369339d`, `f0e4d050d87cf998`, `b4f4dad0d8ccfc30`, `8080b03030f4fde9` |
| Photos with `phash_bytes` | 4 |
| Rows with malformed hash format | **0** (`phash_d !~ '^[0-9a-f]{16}$'` → 0) |
| Cross-account perceptual distances | 14, 27, 34 — **no false-positive duplicate hits** |
| Identity anchors | 2 members → 2 distinct anchors, 0 collisions |
| Trust scores computed | `772a1827…` → 64 (verified), `9ec02c1f…` → 46 (`watch`) |
| Policy end-to-end on a real member | `openCase(duplicate-photo)` → `tier=suspension`, `reviewRequired=true`; idempotent re-open blocked (`already_open:…`) |
| Warning acknowledge | `acknowledgeCase(own case)` → `ok=true`; `acknowledgeCase(other member's case)` → `ok=false, not-found` |
| Human challenge | 18-bit solved at 40,452 candidates / 65 ms; stored `token_hash` reads back 16 chars; single-use consumption verified |
| New routes, anonymous | `trust/self`, `safety/cases`, `device/self`, `human/issue`, `human/verify` → **401** |
| New routes, cross-origin | `device/self`, `safety/cases/ack` → **403** |
| Test residue | 0 cases, 0 challenges, 0 fingerprints, 0 probe photo rows, 0 probe security_events left |

Harness: **86/86 assertions green**, including 20,000 randomised signal vectors with none outside
`0..100`, and 720 policy input combinations producing **zero** automatic bans.

---

## 4. Honest limits — what this is *not*

- **No biometric face embedding.** FaceTec's FaceMap/FaceVector and verifiable-ID vendors are not
  wired and not emulated. `deriveAnchor()` is a deterministic fold of perceptual photo hashes: an
  *identity-similarity* proxy, not face recognition. Nothing here can match a face across two
  different photo sets.
- **No browser fingerprinting.** Tinder's client calls `initClientFingerprint(createDefaultCollectors(), store)`
  behind a `F()` gate (RECOVERED), but its 49 `fingerprint` string hits and Hinge's are Sentry
  `_fingerprint`; `deviceMemory`/`hardwareConcurrency` in both are web-vitals probes. Freeborn's
  `device_id` is a **client-supplied install secret**, so a fresh browser profile reads as a new
  device — strictly weaker than a native `persistent-device-id`.
- **Crop robustness.** A >5% crop defeats the perceptual match (measured, §2.5). The byte digest
  covers re-uploads of the unchanged file only. A scammer who crops 8% and re-saves is not caught
  by this control.
- **Report taxonomy is a mapping, not a tree.** `REASON_TO_CASE` lives in the route; there is no
  `/v4/report/tree`-style endpoint a client fetches.
- **No cadence collector.** The `X-Agent-Signals`-class control is reduced to proof-of-work on two
  endpoints (appeals, human challenge). There is no swipe-rate/session-elapsed signal, so
  "agent detection" as Tinder frames it is **not** implemented.
- **Enforcement is advisory by default.** Cases open with `reviewRequired`; nothing auto-bans, and
  no code path lifts a suspension. Reinstatement remains manual — a deliberate, documented
  property, not an oversight.
- **CAPTCHA remains off** by standing instruction: no provider, no secrets, no widget, no
  production signup test. `FREEBORN_HUMAN_CHALLENGE` defaults to `record`.
- **Not yet in production.** `a1063aa` and the follow-on commit are local; push is blocked (see §5).
  The live database changes in §2/§3 *are* applied. The route code that consumes them is not
  deployed.

---

### 2.6 Production serves HTTP **200 + HTML** for unknown `/api/*` routes

`POST https://freeborn-umber.vercel.app/api/human/issue` (a route that does not exist in the
deployed build) returns **`HTTP/2 200`**, `content-type: text/html`, with
`x-matched-path: /_not-found`. An invented path `/api/definitely-not-real` behaves identically, so
this is the app's general behaviour for unmatched API paths, not something specific to this route.
`GET /api/trust/self` and `GET /api/safety/cases` do return 404 - the App Router 404 page.

Why it matters here specifically: an API client that treats `res.ok` as success will read a
**200** from a missing or removed security endpoint and conclude the control ran. A client told to
solve a human challenge would parse HTML, get nothing, and either fail silently or skip the step.
Missing protection and working protection become indistinguishable from the response status alone.

Not fixed in this change set: a correct fix means middleware that recognises API-shaped paths and
returns a JSON 404, and a path allowlist is exactly the kind of thing that silently rots. Flagged
for an explicit decision instead of a half-measure.

## 4c. Deployed — 2026-10-29, with evidence

| Item | Value |
|---|---|
| Commit on `main` | `4355a371e89ac6e5595d40130e306a30f4738a5a` (pushed fast-forward `c445c7c..4355a37`, `--force-with-lease=main:c445c7c`; no rewrite) |
| GitHub Actions | run `40833619801`, "CI — typecheck / lint / secret scan / build", **completed/success** in 52 s |
| Vercel deployment | `dpl_FatxAjugrRprxGZCtiqQ6iuG2xQu`, state READY, `readySubstate: PROMOTED`, `target: production`, alias `freeborn-umber.vercel.app` |
| Vercel build log | `✓ Compiled successfully in 7.5s`, TypeScript executed, no errors; only warnings are Next 16's `middleware`→`proxy` deprecation and two unapproved install scripts (esbuild, unrs-resolver — build-time only) |

Live probes against `freeborn-umber.vercel.app` after promotion (all with `x-matched-path` equal to
the route, i.e. the handler really ran — contrast §2.6, where a *missing* route answers 200/HTML):

| Probe | Result |
|---|---|
| `GET /api/trust/self`, `GET /api/safety/cases` (anon) | 401 |
| `POST /api/device/self`, `/api/human/issue`, `/api/human/verify`, `/api/safety/cases/ack` (anon) | 401 `{"error":"Not signed in."}` |
| `POST /api/trust/self`, `POST /api/safety/cases` | 405 — method-not-allowed, so routing is correct |
| Same six with `Origin: https://evil.example` | **403** on every one (CSRF guard, before any body parsing) |
| `POST /api/human/issue {"purpose":"nonsense"}` (anon) | 401 — auth is checked **before** input validation, as it must be |
| `POST /api/human/verify` with a raw non-JSON text body | 401, not 500 |
| All of the above with a forged `alg:none` Bearer JWT | 401 — the token is verified against Supabase, never trusted |
| `/`, `/discover`, `/api/profiles` | 200, 200, 401 — no regression to the existing surface |

**Not covered, stated plainly:** no *authenticated* HTTP round trip of the photo-upload or
appeal-challenge path. Freeborn resolves members from a Supabase-verified Bearer token
(`supabase.auth.getUser()`), and this environment has no service-role key (none is configured in the
project's env — 11 vars, all read), no `vault.secrets` rows, SMTP unset with `mailer_autoconfirm=false`
(so a confirmation link cannot be retrieved), and no Docker/`supabase` CLI for a disposable local
auth server. Minting a token by other means would be forging a production session, so the check was
left undone rather than faked. The *logic* those routes call is nevertheless verified against the
production database by `route-sql-proof.ts` (§3), and the first real upload will be detectable with:

```sql
select id, phash_d, phash_bytes, phash_at from public.profile_photos
 order by created_at desc limit 1;   -- phash_d must be 16 hex chars, phash_bytes 64
```

`sharp` is a new runtime dependency; Vercel restored it from the build cache (`up to date in 791ms`)
rather than reinstalling, so its native binary was not re-verified in the deployed image. It is
verified locally (all 86 harness assertions decode real JPEGs through it).

## 4b. Repository state, measured

`origin/main` is `c445c7c`. Local `HEAD` is `94fa668`:

```
94fa668 fix(trust): measured PoW difficulty, deck/suppression parity, and the RE-MECHANICS record
a1063aa feat(trust): identity enforcement recovered from REA - hashing, dedup, trust, cases, PoW
709e7a3 docs(audit): PASS 4 - shipped record: ce34772/c445c7c on main ...
```

Three commits are therefore local-only. **The audit record in `709e7a3` states "ce34772/c445c7c on
main"; that is no longer true as of this writing** - `c445c7c` is the furthest commit actually on
`origin/main`, and `709e7a3` itself was never pushed. Correcting that rather than repeating it.
Production `dpl_2QNY7zbvcUi3527oEZfz8C1qiMET` still serves the `c445c7c` build: verified above by
the 404s on the new routes.

## 5. Blocked / operator actions outstanding

0. ~~Push/deploy~~ **DONE 2026-10-29** — see §4c. Items 1–2 below are the historical record of why
   they were blocked at the time of writing, retained because the reasoning (and the credential
   handling) is the point.

1. **Push to GitHub** — no credential in this environment: `git push` returns
   `Invalid username or token. Password authentication is not supported`, the `origin` URL carries a
   placeholder token, there is no `gh` CLI, no `~/.git-credentials`, no `GITHUB_TOKEN`, and the
   previously supplied PAT was revoked by its owner. Needs a fresh PAT scoped to
   `spencerbby8-gif/freeborn-original`.
2. **Deploy** — blocked behind (1). A file-based Vercel deployment is technically possible (the
   connector is authenticated and the project's env vars are readable) but would push 246 files
   including credentials pasted into tool arguments, and Vercel would build a tree that is not in
   version control. Deliberately not done.
3. **After deploy, run the production probes** in §3 against `freeborn-umber.vercel.app` and the
   live API — the 401/403 rows and a real photo upload through the deployed route.
4. **Rotation**: the database pooler password and the GitHub PATs pasted into this conversation
   should be considered compromised and rotated.
5. **7 photos stored in the Supabase bucket** are not hashed because their bytes are not in
   `chat_media`. Backfilling them needs a signed-URL fetch with the service key; left undone rather
   than half-done.

## 6. Reproducing this

```bash
export PATH=/home/user/re/node24/bin:$PATH         # any node >=20 runs the harness; package.json engines ask for 24
node_modules/.bin/esbuild scripts/trust/harness.ts --bundle --platform=node --format=esm \
  --outfile=scripts/trust/.harness.build.mjs --external:sharp --external:pg --alias:@=./src
node scripts/trust/.harness.build.mjs              # expects: ALL PASS (N/N assertions, 0 failed)

SUPABASE_TRANSACTION_POOLER='postgresql://…' \
  node scripts/trust/.live-proof.build.mjs         # write path against production, self-cleaning
```

Bundling into the repo (not `/tmp`) is required so `--external:sharp` resolves.

## 12. Making the recovered mechanics operable (2026-10-29, commit `d10a6bc`)

§11 described mechanisms that were implemented but not *executable*. This section records what changed
when they were pushed to the point where they run — and one defect that only that push found.

**(a) The CHECK that destroyed reports.** §6/§8 recorded the live `reports_reason_check` as "the 12-value
list". True, and useless: the app's `REASONS` contained `safety` and `ai_generated_media`, which the live
constraint rejected, and `reports/route.ts:95` inserted unguarded. So a member reporting a safety concern
got HTTP 500 and their report was **not recorded**. Reproduced against production first
(`insert … values ('safety')` → `23514`). Reconciled in `db/migrations/2026-10-29-engine-operability.sql`
as a union with what existing rows already carry (so it can never be re-narrowed), normalised at the route,
retried once with `other` + a `security_events` row, and pinned by harness section [11] (app set ==
migration set == schema set, plus a direct assertion that a rejected insert cannot escape as a 500).
*Lesson kept: verifying that a constraint exists is not verifying that it agrees with the caller.*

**(b) An unreachable escalation.** Scam-guard's auto-escalation needed `score >= 70` with a history, but
the history bonus capped at 20 over a 45-point serious ask: `45 + 20 = 65`. The control never fired for
any input. Fixed (serious-with-history **or** persistent-mild sender) and asserted reachable. 10 unweighted
signals → 22 weighted across 9 categories; deliberately no tone/grammar features, which would police
non-native speakers. Chat remains unblocked — flag, case, human decide.

**(c) Liveness honesty, narrowed at the verifiable layer.** `verification/check` trusted client JSON for
`blinkTag`. Now a server-issued, member-bound, 5-minute single-use token (compare-and-set consumption) is
required before any engine call, and the single-engine approval path requires `state === "verified"`.
What this proves: the challenge was issued by us, is fresh, and was used once. What it still does **not**
prove: that a live human was in front of the camera. A camera-feed verifier would be a different mechanism
and is not claimed here.

**(d) A rate control nobody could pass is an outage.** `FREEBORN_HUMAN_CHALLENGE=enforce` was unusable
until this change because no client answered the 428 — every appeal would have been refused. Measured
before choosing: WebCrypto sustains ~8.5 k sha256/s here, the 18-bit default averages ~262 k candidates
(~31 s) and a full 4,000,000-candidate run did not finish in 242 s. Added a 12-bit `browser` tier
(~0.5–2 s, `src/lib/human-challenge-client.ts`, predicate asserted identical to the server's over 400
inputs × 6 tiers) and left the flag at `record`. The PoW raises the per-account cost of farming; it does
not stop a distributed attacker and is not CAPTCHA.

**(e) Photo hashing finished.** The earlier backfill only understood `/api/chat/media/` paths and skipped
Supabase object keys — 7 of 11 production photos were unhashed. `scripts/trust/backfill-photos.ts` now
handles both; run against production: 7 hashed, **11/11**, second run 0 (idempotent). Cross-account result
over the whole set: 40 pairs, closest Hamming **14** against a ≤10 threshold → **no duplicate identity**.
A null result, recorded as one. `phash_bytes` is `char(64)` hex and `hamming64` only accepts 16-hex input,
so bytes are compared by exact equality — which is what `identity-resolve.ts` does; my first two SQL probes
got this backwards and returned misleading NULLs.

**(f) Admin surface, deliberately read-only.** `GET /api/admin/review-queue` fails closed to a bare 404 in
production when `FREEBORN_ADMIN_EMAILS` is empty (confirmed live) and reads nothing beyond what a reviewer
needs. No write panel, per §2 of `REVIEW-SURFACE-DESIGN.md`.

Gates at `d10a6bc`: tsc 0, eslint 0, `next build` 0 (16/16), secret scan OK on 257 tracked files, harness
**ALL PASS 136/136** (negative control re-confirmed: injected failures → `FAILURES: 2`, exit 1).
REA was re-run bounded on one Bumble and one Hinge chunk (exit 0, ~10.8 MB evidence each); it added **no**
corroboration for the `device_id` claim — see §5 of `RE-EVIDENCE-GAP-REPORT.md` for the correction.
