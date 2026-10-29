# Freeborn — production configuration inventory

Generated 2026-10-29 from three sources, each labelled. Nothing here was inferred from
file names or from what a deployment "probably" has.

1. **What the code reads** — `grep` for `process.env.*` across `src/` (16 load-bearing names).
2. **What the deployment defines** — Vercel `GET /v9/projects/.../env`, **names, targets and
   the empty/non-empty fact only**. No value was decrypted, and none should be: values of
   `sensitive` vars are not returned by that endpoint at all, which is why "empty" is
   observable and "what is the key" is not.
3. **What the app does with it** — read at the consuming line, quoted below.

> **Never paste a secret into this chat.** Set values in the Vercel dashboard
> (Project → Settings → Environment Variables) or with `vercel env add <NAME> production`
> in your own terminal, which prompts for the value. I only need the name to be present;
> I will verify it by behaviour, never by reading it.

## A. The one-line summary

Four `sensitive` variables are **defined and empty**. That is not a missing-credential
problem, it is a missing-*value* problem, and it is the single cause of the moderation,
identity and second-engine outages. Everything else that is unset is unset-by-design and
degrades truthfully.

## B. Per-engine requirement table

| # | Engine | Variables it reads | Live state | Exact consequence of that state (from the code) |
|---|---|---|---|---|
| 1 | Server-verified selfie liveness | `ANTIGRAVITY_BASE_URL`, `ANTIGRAVITY_FREE_API_KEY` (stage 1) | defined, **empty** | `verification/check` reaches `if (!BASE \|\| !KEY)` → `status:"pending-fallback", engine:"none"`. Attempt is recorded, no badge. The pose challenge itself needs no credentials and is now live. |
| 2 | Identity matching | `ANTIGRAVITY_*` (vision) + `VOID_AI_*` (comparison) | defined, **empty** | `identity-match.ts` runs no model; photo-hash/dHash matching is pure SQL and **works without any of these** (11/11 hashed, verified). |
| 3 | Dual-model report moderation | stage 1 `ANTIGRAVITY_*` → `gemini-3.6-flash-medium`; stage 2 `VOID_AI_*` → `gpt-4o` | defined, **empty** | `moderation.ts:143` — "in that case the report still lands in the human queue, unjudged". Now visible as `reports.triage='pending'`… see note below. |
| 4 | Scam detection | none | **fully configured** | 22 weighted rules run in-process. Nothing to set. |
| 5 | Human-challenge enforcement | `FREEBORN_HUMAN_CHALLENGE` | **absent** | `issue/route.ts:134` — `enforcing: process.env.FREEBORN_HUMAN_CHALLENGE === "enforce"`. Absent ⇒ `record`: counted, logged, never blocks. Set to the literal string `enforce` to block. |
| 6 | Graduated moderation + appeals | `FREEBORN_ADMIN_EMAILS` | defined, **empty** | Both operator surfaces fail closed: `/api/admin/review-queue` → bare 404, `/api/health/engines` → bare 404. Appeals and enforcement work for members; **nobody can see the queue.** |

**Note on #3:** verified against `src/db/schema.ts` and the route, not from memory: the
column is `public.reports.triage` and the value written when no model ran is `'pending'`.
Current production: 2 open reports, both `triage is null` — they predate the column. So the
unjudged state is now *measurable*, but has not yet been *observed* under real traffic.

## C. Exactly what to configure, in the order that unblocks the most

Priority 1 — **restores three engines at once** (`dual-model moderation`, `verification
stage 1`, `identity comparison`). All four are already defined with empty values, so this
is *fill in the value*, not *create the variable*:

| Variable | Target | Value needed |
|---|---|---|
| `ANTIGRAVITY_BASE_URL` | Production | gateway origin, no trailing slash (the code strips one) |
| `ANTIGRAVITY_FREE_API_KEY` | Production | key for that gateway |
| `VOID_AI_BASE_URL` | Production | gateway origin |
| `VOID_AI_API_KEY` | Production | key for that gateway |

⚠ Set all four. Stage 2 (`gpt-4o`) and the second-engine verification path both read
`VOID_AI_*`; setting only Antigravity leaves every decision single-engine, which after
this change **cannot self-serve a badge** (single-engine approval now also requires the
server pose and a consumed freshness token).

Priority 2 — **makes the operator surface reachable**, and is the prerequisite for proving
anything end-to-end:

| Variable | Target | Value needed |
|---|---|---|
| `FREEBORN_ADMIN_EMAILS` | Production | comma-separated member emails, exact match against the Supabase user email. Until this is set, the review queue and the engine diagnostic are 404 for everyone, including you. |

Priority 3 — **opt-in, only after member flows pass**:

| Variable | Target | Value |
|---|---|---|
| `FREEBORN_HUMAN_CHALLENGE` | Production | literal `enforce` (anything else, or absent, = `record`) |

Priority 4 — product features, not security: `FREEBORN_TURN_URL` + `FREEBORN_TURN_USER` +
`FREEBORN_TURN_CRED` (all three or none). With none set, `/api/calls/ice` returns STUN only —
deliberate: the previous build handed a hardcoded public relay (`openrelay.metered.ca`) to
anonymous callers.

## D. Deliberately NOT to set

| Variable | Why leaving it alone is correct |
|---|---|
| `LM7_BASE_URL`, `LM7_API_KEY` | Legacy aliases. `lm7.ts:28` is `VOID_BASE \|\| LEGACY_BASE`, so setting these re-enables the same engine under a stale name and invites two sources of truth. |
| `NEXT_PUBLIC_*` | Client-visible by definition; nothing secret belongs there. |
| `FREEBORN_ALLOW_CROSS_SITE_COOKIES` | Widens CSRF surface; the app works without it. |
| `SUPABASE_TRANSACTION_POOLER` (as `sensitive`) | Correctly `encrypted` today across production/preview/development. If it was rotated, the value here must be updated too — see E. |

## E. Verified, not assumed: database connectivity after the password rotation

`/api/health` is `await db.execute(sql\`select 1\`)` and answers `{"ok":true}` **with no
auth** — so it is an unforgeable statement that the deployed function connected to the
pooler. Probed three times in a row: `200 {"ok":true}` × 3. `/api/health/engines`, which
also reads the DB, correctly returns 404 because of C's Priority 2, not because of the
database.

The `SUPABASE_TRANSACTION_POOLER` entry reports `updated_at` equal to its `created_at`
(1791472303500), i.e. **the string in Vercel has not been edited since it was created.**
Production still connects, so either the rotation has not happened yet, or it was done in a
way that kept the pooler secret valid. Confirm in the Supabase dashboard; if you did rotate
it, update this variable and redeploy, then re-run `curl https://freeborn-umber.vercel.app/api/health`.

## F. How each item will be proven, once configured

The gates below are offline and already pass; none of them can prove a *credential works*,
so each engine needs the live check listed here instead:

| Engine | Live proof, after configuration |
|---|---|
| Liveness / verification | Real member completes the modal; then `select status, method, reject_reason from verification_requests order by submitted_at desc limit 1` shows `method` containing `+fresh+pose`, and `select status from verification_challenges where user_id=...` shows `consumed`, not `active`. |
| Dual-model moderation | Submit one report; `select triage from reports order by created_at desc limit 1` is **not** `pending`. |
| Identity matching | `select count(*) from identity_fingerprints` rises above 0 for the accounts involved. |
| Human challenge | With `enforce`: an appeal without a solved token returns 428 and the member's next attempt succeeds — verified by a real browser, not by curl. |
| Admin surfaces | `/api/health/engines` returns 200 with the attempt log instead of 404. |
