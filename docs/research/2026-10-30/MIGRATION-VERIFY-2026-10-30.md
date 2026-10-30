# Migration verification against a real Postgres 17 — 2026-10-30

**What this is.** Both migrations dated 2026-10-30 were executed against a real Postgres
server, not read as text. Command:

```
bash scripts/qa/pg-migration-verify.sh      # 38/38 assertions, rc=0
```

Result of the last run: `ALL PASS  (38/38 migration assertions executed against real Postgres)`.

**What is and is not deployed.** These migrations are applied to **no** database — not this
scratch cluster (which is created and torn down by the script), and not production
(`ihwtpwng…`, ref `ihwtpwlszegrjgakqsxx`). No code here is deployed either; it is a local
working tree. The production schema still has `matches.status` with three values, no
`unmatched_by`, and no `chat_signals` table.

## Environment

| | |
|---|---|
| Server | PostgreSQL **17.11** (installed this session into `/usr/lib/postgresql/17/bin`), throwaway cluster, port **55499**, unix socket in `/tmp/fb-migration-verify`, no TCP listener |
| Schema source | `drizzle-kit generate` against `src/db/schema.ts` → 36 tables of DDL, i.e. the app's own declared schema, **not** a hand-written stand-in |
| Pre-state | the migration's **own rollback block** is applied first, so the run starts from what production actually looks like today |
| Stubs | `auth.uid()` (reads a test GUC), `anon`/`authenticated` roles, since a vanilla cluster has neither. `authenticated` gets explicit grants the way Supabase grants them, because `SET ROLE authenticated` inherits nothing. |

## What the run proves

1. **Sever, never destroy.** After `2026-10-30-unmatch-detach.sql`, an unmatch leaves the
   2 messages, the conversation attachment row and the `matches` row itself intact — the
   cascade that used to erase a member's whole history is gone (`on delete set null` on
   `matches.user_a/user_b`, `match_id` FKs no longer cascade on unmatch).
2. **Erasure still works.** Deleting the member's `user_profiles` row still removes
   messages, conversation media and the match. The cascades were narrowed, not deleted.
   Separately proven: `chat_media` rows with `match_id IS NULL` (profile-upload blobs) are
   covered by **no** FK, so only the route's explicit `delete … where sender_id = …` removes
   them. That distinction is asserted, not assumed.
3. **The pre-state rejects the new writes.** `status='unmatched'` fails against today's
   three-value CHECK, which is exactly why the migration must land before the code does.
4. **The new guards bite**, in this order: missing actor on `unmatched` refused, invented
   reason (`stalking_harassment`) refused, out-of-vocabulary `status='ghosted'` refused,
   `unmatch_reason IS NULL` still legal (matching the API's optional-reason contract).
5. **RLS is load-bearing and correct**: `chat_signals` is enabled + forced, has exactly one
   policy (SELECT), zero write policies, a closed `kind` vocabulary and no content columns.
   With a real unprivileged role: participant A reads the row, participant B reads the row,
   an unrelated member holds `SELECT` on the table and reads **0 rows**, a signed-out request
   reads 0, and INSERT/UPDATE/DELETE are all refused.
6. **The premise of the whole realtime design is checked, not asserted**: `messages` is not
   selectable by any client role, so `postgres_changes` on `messages` would deliver nothing —
   which is why a content-free signal table exists at all.
7. **Idempotent + reversible**: re-running the unmatch migration is a no-op, its rollback block
   runs after it, and the migration re-applies on top of that. The signal migration's
   publication step tolerates a deployment with no `supabase_realtime` publication.

## Defects this run found (all fixed, none cosmetic)

| Found by | Defect | Fix |
|---|---|---|
| seeding a signal row | `id` is `generated always as identity`, so the seeded `insert … (id, …)` was rejected — and `>/dev/null 2>&1` hid it, leaving privilege tests reading an empty table | seed without an explicit id, check the exit status, and add an existence precondition |
| participant read returning 0 | the emulator created `fb_client … noinherit`; Postgres picks applicable policies with `has_privs_of_role()`, which **ignores NOINHERIT memberships**, so the planner emitted `One-Time Filter: false` and the read failed for a reason unrelated to the policy | `login inherit`, plus a deliberate `SET ROLE authenticated` case that mirrors how PostgREST actually runs |
| `chat_signals` structural check | the `kind` CHECK lives inside `create table if not exists`, so a database where `drizzle-kit push` already created the table from `schema.ts` **silently had no vocabulary guard** — and `schema.ts` declared no check at all | `check("chat_signals_kind_check", …)` added to `src/db/schema.ts`, and the migration now adds the constraint when it is genuinely absent |
| wipe-path review during the run | `DELETE /api/chat/messages` emptied the thread but emitted no signal, so the other member's open view kept the deleted messages until its next poll — while the table's `kind` vocabulary already reserved `'cleared'` | the wipe path inserts the `cleared` signal under the same optional-signal try/catch as the send path |
| FK audit cross-check | `public.moderation_actions` has a member `subject_id` and a denormalised `subject_email`, and **no FK**, so a staff note naming a member would outlive their deletion | the erasure path now deletes it by either identifier; harness `[21]` pins the delete list against the FK audit |

## Limits of this evidence (read before trusting it)

* It is **not** Supabase. `auth.uid()`, `anon`/`authenticated` and the realtime publication
  are emulated. Production policies, the real `auth` schema, PostgREST role switching and
  `supabase_realtime` behaviour are untested here. Production `matches`/`messages` are
  additionally `FORCE`-RLS with zero policies, which this scratch schema does not reproduce.
* Row-level **behaviour** of the app (does the UI actually show the preserved history) is not
  covered; only the storage semantics are.
* RLS was exercised with a single-session `SET ROLE`, not through PostgREST, so any
  role-mangling the API layer performs is unverified.
* The script asserts the FK/CHECK structure the migration creates. It cannot prove that no
  *other* code path writes an unsafe value — that stays with the API guards and `[18]`–`[21]`.

## Reproduce

```
sudo -n apt-get install -y postgresql-17        # or set PATH to any pg 17 install
bash scripts/qa/pg-migration-verify.sh          # 38 assertions, exit 0
npm run test:harness                            # 422 assertions, exit 0
npx tsc --noEmit; npm run lint; npm run build   # all clean
```
`USE_RUNNING_PG=1` reuses an already-listening cluster; `FB_PGPORT`/`FB_PGUSER` override the
connection when a sandbox cannot bind a socket directory.
