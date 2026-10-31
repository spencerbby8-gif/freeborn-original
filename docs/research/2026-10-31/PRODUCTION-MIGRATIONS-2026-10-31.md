# Production migration application — Freeborn, 2026-10-31

Target: Supabase project **`ihwtpwlszegrjgakqsxx`** ("Freeborn", `ACTIVE_HEALTHY`, us-east-1,
Postgres 17.6.1.141, org `xtvkbfzhkuzqupghkhct`). The two sibling projects
(`sjkouqonyynvwdxshsux` AbegHelpMe, `xdcsxxwhvpiissetbrdr` ReplyMate) are `INACTIVE` and were
never touched.

Every statement below was **executed**, by this agent, through the Supabase connector
(`create_migration` / `execute_query`). Nothing in this file is a plan or a file listing.

---

## 1. Pre-flight (read-only, before any DDL)

| probe | value |
|---|---|
| `matches` rows | 1, all `status='active'` |
| `messages` rows | 16 (0 with `match_id IS NULL`) |
| `chat_media` rows | 11 (6 attached to the match, 5 unattached) |
| `user_profiles` rows | 9 |
| `matches` columns | created_at, id, initiated_by, last_message_at, status, user_a, user_b — **no `unmatch*`** |
| `matches_status_check` | `CHECK (status = ANY (ARRAY['active','archived','blocked']))` |
| indexes on `matches` | `matches_pair_unique`, `matches_pkey` only |
| `chat_signals` | `ABSENT` |
| `supabase_realtime` publication | exists |
| `auth.uid()` | exists |
| policies on `messages` | 0 |

The single `matches` row (`05f33352-a422-4918-8fdf-55bba3656c53`, members
`772a1827-…0839` / `b9bc7ac1-…4f97c`) and all 16 messages / 11 media rows were snapshotted to
JSON first, as a restore reference. Because the only pre-existing thread had an in-vocabulary
status, widening the CHECK could not fail row validation.

## 2. What was applied

| order | migration | applied as | result |
|---|---|---|---|
| 1 | `db/migrations/2026-10-30-unmatch-detach.sql` | migration `2026_10_30_unmatch_detach` | applied |
| 2 | `db/migrations/2026-10-30-chat-signals.sql` | migration `2026_10_30_chat_signals` | applied |
| 3 | corrective follow-up (see §4) | migration `2026_10_31_chat_signals_participant_predicate` | applied |

Both files were taken from the pushed PR head `a6c7b22` (`git fetch` of
`arena/rea-media-match-lifecycle`), **not re-authored from memory**. Each was fed to
`create_migration`, which runs it in a transaction and rolls back on failure. Migration 1 was
passed with its own `begin;`/`commit;` stripped, so the tool owns the transaction boundary.
`list_migrations` afterwards shows the three records: `20261031010300`, `20261031010330`,
`20261031010856` — note that `create_migration` echoes `"version": null` in its own response even
when it has written the row, so the history query is the fact and the echo is not.

## 3. Verification against the actual database (not a scratch cluster)

`2026-10-30-unmatch-detach.sql`, its own "Verify with" block, executed on production:

```
matches_status_check         CHECK (status = ANY (ARRAY['active','archived','blocked','unmatched']))
matches_unmatch_reason_check CHECK (unmatch_reason IS NULL OR unmatch_reason = ANY (ARRAY[
                             'not_interested','met_someone','moved_off_app','inappropriate','safety','other']))
matches_unmatched_has_actor  CHECK (status <> 'unmatched' OR (unmatched_by IS NOT NULL AND unmatched_at IS NOT NULL))
matches_unmatched_by_fkey    FOREIGN KEY (unmatched_by) REFERENCES user_profiles(id) ON DELETE SET NULL
columns  unmatch_reason text null · unmatched_at timestamptz null · unmatched_by uuid null
indexes  matches_status_idx · matches_unmatched_at_idx (partial, WHERE unmatched_at IS NOT NULL)
rowcounts after: matches 1 · messages 16 · chat_media 11      <- unchanged: the migration rewrote no rows
```

`2026-10-30-chat-signals.sql`:

```
relrowsecurity/relforcerowsecurity  true/true
policies                            exactly 1, SELECT -> authenticated
publication membership              1
chat_signals_kind_check             CHECK (kind IN ('message','typing','severed','cleared'))
columns                             id, match_id, kind, created_at      <- no content columns
chat_signals_match_id_fkey          FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
row_count                           0
```

Behavioural pins were then run on production from
`docs/research/2026-10-31/sql/production-verify.sql`. That script contains **no `BEGIN` and no
`COMMIT`**: its last statement raises the report as an exception, which aborts the whole
multi-statement query, so every probe is rolled back automatically and no `idle in transaction`
session is left holding a lock on `matches`. Post-probe confirmation: `chat_signals` 0 rows, the
match back to `active|by=null|at=null|reason=null`, 16/11/9 intact, `idle in transaction`
sessions = 0.

Report (verbatim, as far as the API let it through):

```
P1a_sever_accepted=1  P1b_messages=16  P1c_media=6  P1d_row=kept
P2_no_actor=refused   P3_reason=refused             P4_participants=both_kept
P5_media_attach=ok    P6a_kinds=4inserted           P6b_bogus=refused
P7_participant_rows=0  <- see §4, this was the bug
P7b_messages_rows=0    (messages stays deny-by-default to clients, by design)
```

Severing a thread kept all 16 messages, all 6 attached media rows and the `matches` row itself;
an `unmatched` row with no actor was refused; an invented reason was refused. The first execution
of this script failed on `matches_unmatched_has_actor` — because **the probe** set
`status='unmatched'` without `unmatched_by`, which is the one thing the constraint exists to
catch. The migration was right and the test was wrong; it was corrected, not the constraint.

## 4. The unexpected result, and what it turned out to be

`P7_participant_rows=0`: a member **in** the match read **zero** signals. Diagnosis, isolated and
measured rather than assumed:

```
DIAG uid=772a1827-0cfb-430d-9fc4-771dbce20839  claims={"sub":"772a1827-…","role":"authenticated"}
     sees_matches=0  sees_signals=0  sees_chatmedia=0  forced=true/true
```

`auth.uid()` was resolving correctly. The cause is the shipped policy itself: its predicate read
`public.matches` directly, and `matches` is RLS-enabled **and force-enabled with zero policies** —
so when PostgREST/Realtime evaluates the policy as `authenticated`, the subquery *inside* the
policy is itself filtered to nothing. **The policy could never be satisfied: every client would
have been denied signals silently, forever**, and realtime would have looked "connected" while
delivering nothing.

Fix (migration 3, and amended into `2026-10-30-chat-signals.sql`): a `SECURITY DEFINER` helper
`public.is_match_participant(uuid)`, owned by `postgres`, which carries `rolbypassrls = true`
(`postgres|super=false|bypass=true`, `supabase_admin|super=true`, `authenticated|bypass=false`) —
so the check can read `matches` while no caller gains readable access to it. Revoked from
`public`, granted to `authenticated` and `service_role`, returns one boolean about the caller's
own membership. Policy is now `using ( public.is_match_participant(match_id) )`.

Re-tested across **two separate member accounts** on production, same abort-and-rollback pattern:

```
actorA_signals=2  all=2  msgs=0  NEG=false  Awrite=refused
victimB_signals=2 Bpart=true
strangerC_signals=0  Cpart=false
```

* Member A (the one who severs) still receives the conversation's signals.
* Member B (the one left with the read-only thread) receives them too — participation is
  status-agnostic, which is exactly the "you can still report them" contract.
* Member C, who is in no conversation, reads 0.
* `NEG=false`: `is_match_participant(gen_random_uuid())` is false, so the definer function is
  provably not an always-true shortcut that would pass the two positive cases above.
* `Awrite=refused`: a member cannot insert a signal row even to spam a peer.
* `msgs=0`: `messages` remains unreadable from a client role — the reason the signal table exists.

Live shape of the fix, read back from the catalog afterwards:

```
definer        true  owner=postgres  bypass=true
acl            postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres   <- public revoked
config         search_path=public, pg_temp                                               <- pinned, not hijackable
policy_now     is_match_participant(match_id)
signals_residue 0                                                                        <- no test rows left
```

## 5. Account-deletion FK coverage (`docs/research/2026-10-30/sql/account-delete-fk-coverage.sql`)

The request cited it as `sql/account-delete-fk-coverage.sql`; the real path is under
`docs/research/2026-10-30/sql/`. **As shipped it could not run**, for two reasons, both now fixed:

1. `deleted(tbl text) as (values …)` — a CTE column list takes names only, no types → syntax
   error 42601. So this check had never once completed, anywhere.
2. `c.conrelid::regclass::text` renders **unqualified** (`chat_media`) whenever the schema is on
   `search_path`, while the `deleted` list is qualified (`public.chat_media`). Once the syntax was
   fixed, all 27 rows came back `covered_by_account_delete = false` — a false alarm of exactly the
   kind that trains you to ignore an audit. Names are now built from `pg_namespace`/`pg_class` and
   `policies` uses `split_part`, so the comparison is search-path independent.

Corrected result on production (27 child tables carrying an FK into `user_profiles` / `accounts` /
`auth.users`):

* 23 are `covered_by_account_delete = true`.
* 4 are not in the route's list — `account_devices`, `enforcement_cases`,
  `identity_fingerprints`, `match_messages` — and all four **CASCADE** from `user_profiles`, so
  the profile delete takes them. `identity_fingerprints` is the biometric template table, which
  is the one that actually matters here.
* **`gap_survives = false` for all 27**: no member data outlives `POST /api/account {action:"delete"}`.
* `chat_media.sender_id` and `reports.*` are `SET NULL` (not cascade) — both tables *are* in the
  route's list, so they are covered by an explicit delete rather than by a cascade.

The FK-less half, which a constraint-driven review structurally cannot see, was run as a second
statement (now in the file): exactly one table has an owner column and **no** FK into a deletable
parent — `moderation_actions (subject_id, fk_to_owner=0, policies=0)` — and
`src/app/api/account/route.ts` already deletes it explicitly
(`subject_id = ${id} or subject_email = ${email}`), after reading bucket paths and before the row
cascade. `chat_signals` is covered transitively: `chat_signals_match_id_fkey … ON DELETE CASCADE`
from `matches`, which the route deletes.

**So there was no deletion gap to repair in the product.** What needed repairing was the audit.

## 6. Why the local gate did not catch §4 — and the fix

`scripts/qa/pg-migration-verify.sh` builds its scratch cluster from `drizzle-kit generate` only,
so it never applies the production RLS-hardening migrations: locally `matches` had **no RLS at
all**, and the fixture granted `authenticated` `select on public.matches` and asserted a client
reads **2** rows from it. A fixture more permissive than production cannot detect a policy that
depends on a locked table — the participant-read assertion passed because the environment made it
passable. (The script's own prose already admitted the scratch schema "does not reproduce
FORCE-RLS with zero policies"; a documented limitation is not a gate.)

Four changes, all now in the script:

1. `matches` is locked to production's shape (`enable` + `force row level security`, zero
   policies) before any client-role read.
2. The sanity assertion is inverted to the truth: a client reads **0** rows from `matches` even
   holding SELECT.
3. A control proves the fixture can now fail: the pre-fix predicate form (`EXISTS` over the locked
   `matches`) evaluates to 0 for a real participant, while the definer-policy read is 1.
4. A structural gate fails the run if *any* policy anywhere reads an RLS-locked table directly.
   `match_messages`' two legacy policies are named as explicit inert exceptions: that table has no
   writer anywhere in this codebase (the trust harness pins it out of scope), so churning them in
   a media changeset would be unrelated risk.

Also fixed while getting the gate to run for real: the role bootstrap now creates `service_role`
(the shipped migration GRANTs to it, and on a vanilla cluster that aborted the migration and made
every downstream read test fail for a non-RLS reason), and the owner guard uses `pg_proc` +
`::regprocedure` — **a function is not a relation**, so `'public.is_match_participant'::regclass`
fails with "relation does not exist".

Result: **41/41 assertions** (was 38) against real Postgres 17, rc=0.

## 7. Repo gates, exit codes unmasked

`npm run typecheck` 0 · `npm run lint` 0 · `npm run test:harness` **464/464** ·
`npm run check:secrets` OK (329 tracked files) · `npm run build` 0.

Live preview probes (branch deployment, no session — the deny path is the only honest thing to
check without a login):

```
GET  /api/health                                  200 {"ok":true}
GET  /api/chat/media/<real id>                    401 Not signed in.
GET  /api/chat/messages?match_id=<real id>        401 {"error":"Not signed in."}
POST /api/chat/unmatch  {"matchId":<real id>}     401 {"error":"Not signed in."}   (no side effect)
```

## 8. Still unproven, stated plainly

* **Browser-level, two-account E2E against a deployment running this code is not possible from
  here.** It needs two authenticated sessions: signup has `mailer_autoconfirm = false`, there is
  no service-role key in the app environment, and minting member JWTs is out of scope. The
  production app also still served `main` until PR #26 merged, so an E2E there would have tested
  the old unmatch route, not this one. What was proven instead: the data-layer contract end-to-end
  on the production database as two real member identities plus a stranger (§3, §4), and the
  refusal boundary over HTTP (§7).
* Known nit, deliberately not fixed here: `GET /api/chat/media/:id` returns its 401 as a bare
  string (`Not signed in.`) where sibling routes return `{"error": …}`. The client's failure
  classifier keys on status, not body, so it is cosmetic — but the API's error shape is
  inconsistent on that one route.
* `verification_requests.selfie_media` stays inline (9 rows, 280,901 chars) and verification stays
  `pending`; `jwt_exp` stays 3600. Per the shipped migration's own reasoning, the one subsystem
  with a freshly proven production run does not get destabilised in a media changeset.

## 9. Sequencing note

Production is ahead of the merged code path only in the safe direction: the schema now accepts what
the branch writes, and `main`'s code never writes `status='unmatched'` or a `chat_signals` row, so
the applied-but-unmerged state is inert. Had the order been reversed — code first — every unmatch
tap would have died on the three-value CHECK.
