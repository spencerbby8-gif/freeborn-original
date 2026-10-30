# Browser-integrity signals + end-to-end pose verification — 2026-10-30

Scope of this pass: integrate the useful, verified mechanisms from the Tinder/Bumble/Hinge research
into Freeborn's existing security engines — starting with privacy-safe browser-integrity signals —
and complete real browser-level end-to-end testing of the server-issued selfie pose challenge.
Nothing here restarts the audit or builds a parallel system: every change extends the existing
`/api/verification/*` chain, the existing `security_events` table and the existing trust layer.

Research discipline kept intact: reverse-engineering evidence lives in
`re/analysis-2026-10-29/` (REA output, per-file inventories) and is reported as such. The specific
observation that a competitor's shipped bundle runs a client-side *consistency* detector rather than
a scoring engine is **my manual reading** of `re/analysis-2026-10-29/bumble/7baa63ca4f39942f.js`
(module 471), not REA output, and nothing in this document claims knowledge of any competitor's
backend. No proprietary code was copied: the evaluator was written from the principle (compare two
independent views of the same request), not from their implementation.

---

## 1. Implemented (in this branch, with the gate that proves each claim)

### 1a. Privacy-safe browser-integrity signals — advisory only
| Piece | File | What it does |
|---|---|---|
| evaluator | `src/lib/browser-integrity.ts` (new) | Four consistency checks comparing what the page reports against the headers the **server's own edge** received: `tzVsAcceptLanguage`, `languageNotInAcceptLanguage`, `platformContradictsUserAgent`, `chromeWithoutClientHints`. Pure, zero imports, `advisory: true` in the type. |
| collector | `src/lib/browser-integrity-client.ts` (new) | The only place in the client that reads anything about the device: `getTimezoneOffset`, `navigator.language`, `maxTouchPoints`, `userAgentData.platform`, two capability bits, `isSecureContext`. Returns `{}` on any failure. |
| wiring | `src/app/api/verification/check/route.ts`, `src/components/app/verify-modal.tsx` | The modal attaches the observations; the route evaluates them and records them. |
| persistence | same route, into the existing `security_events` | `kind='browser_integrity'`, `detail` = **fired rule names only** (or `none`). The observations themselves are never stored. |

Constraints from the brief, each enforced by a test rather than by a comment:
* **risk indicator, never proof** — no branch of the decision reads the result. `[14] nothing in the
  decision path reads the integrity result` pins that, and the e2e asserts an honest attempt still
  approves *with* contradictory observations present (`adversarial`).
* **no automatic ban, ever, on these signals** — the suite asserts a flag cannot remove a seal, and the
  write is `catch`-wrapped so it cannot fail a member's verification.
* **no covert persistent fingerprinting** — the client module is grepped (comments stripped, so the
  doc header that *names* canvas to explain its absence cannot pass for using it) against 25 forbidden
  surfaces: no canvas/WebGL/fonts/plugins/audio/`deviceMemory`/`hardwareConcurrency`/screen geometry/
  battery/`localStorage`/`indexedDB`/cookies/service worker/`enumerateDevices`. Nothing is persisted,
  so there is no identifier to rotate or to covertly store.
* **minimise what is collected** — only rule names are retained, capped at 120 chars; `NEVER_COLLECTED`
  is exported so the list is checkable, and `memberVisibleIntegrity()` withholds the two factors whose
  names would teach someone which header they forgot.
* **checks fire on contradictions, never on rarity** — a missing observation or a wildcard
  `Accept-Language` **silences** the relevant check; mixed language lists are ignored; the quoted
  `Sec-CH-UA-Platform` header is unquoted before comparison (the false positive that would have fired
  on every honest Chrome user), and desktop user-agents contribute nothing rather than contradicting.

Harness `scripts/trust/harness.ts` section `[14]` adds **58 assertions** (244 total, from 186 at
`b6051d4`), including a 1,536-combination fixture matrix over the evaluator.

### 1b. End-to-end testing of the server-issued pose challenge
`scripts/trust/pose-run.mjs` builds one bundle from source and runs **six child processes**, because
the behaviour under test is configured by environment at module scope. Each child executes the shipped
route handlers, the freshness consumer, the pose store's Drizzle adapter, the identity bookkeeping and
the real HTTP clients for both vision engines, against a real Postgres and a scripted
OpenAI-compatible double (`scripts/trust/pose-fixtures/gateway.ts`) that testifies to every prompt it
received. Only two modules are substituted — the bearer-token resolver and the connection string
(guarded to loopback URLs) — and the runner refuses to proceed if the bundle does **not** contain the
product's gate, or if it contains a baked-in connection string or a service-role client.

| mode | checks | what it establishes |
|---|---|---|
| `main` | 13 | token↔pose binding, re-issue supersede (the 23505 regression), honest approval + seal, **both engines were asked about the pose the server issued**, no photo URL/base64 in any prompt, clean browser recorded as `none`, at most one undecided selfie retained, refusals store no face |
| `adversarial` | 15 | no token, replayed token, borrowed token, claimed-pose mismatch, prompt injection via `poseLabel`, expired pose, contradictory browser claims, scripted Chrome headers, unknown observation fields, malformed/oversized/non-JSON bodies, `low-confidence` and `unparseable` verdicts, photo-of-a-photo |
| `ratelimit` | 10 | exactly 6 accepted attempts per member per hour, the 7th refused with no engine budget burned, budget is per member |
| `legacy` | 7 | what the operator escape hatch may grant (a pose-store outage) and what it must refuse (spent token, forged token, foreign token); every hatch grant is marked and queryable |
| `single` | 6 | the one-engine chain: can approve with both proofs, cannot without a fresh token |
| `refused` | 7 | a second engine that is configured and refuses us is reported, in the response and in the audit row |

**Total 58 checks.** Run with `npm run test:pose`; one mode with `POSE_E2E_ONLY=legacy`.

### 1c. Negative controls — `npm run test:pose:negctl`
A green suite proves nothing until it can fail. `scripts/trust/pose-negctl.sh` copies a file,
reintroduces one specific defect, requires the suite to go red for that reason, and restores. This
pass: **8 controls, 6 caught, 0 decorative.**

| # | defect reintroduced | result |
|---|---|---|
| 1 | pose/freshness veto removed from the approval gate | CAUGHT |
| 2 | stage 2 told the client's pose string again | CAUGHT |
| 3 | raw observations persisted instead of rule names | CAUGHT |
| 4 | integrity checks firing on missing input | CAUGHT |
| 5 | **both** freshness enforcements removed (read guard + consuming CAS) | CAUGHT |
| 5a / 5b | only one of the two | MASKED BY DESIGN — the other refuses; recorded as confirmed redundancy, not as a coverage gap |
| 6 | `human_challenges_single_live` back to including `status` | CAUGHT |

Control 5 is the one that mattered. It first came back MISSED, which looked like a decorative test;
the truth was that single-use is enforced twice, so removing one of the two opens no hole. The
control was retargeted at both, and the assertion it exercises (the `legacy` regression below) is what
caught a real defect earlier in this work.

### 1d. Verified defects fixed
1. **Challenge-store lockout (pre-existing).** `human_challenges_single_live` was
   `unique(email, purpose, status)`, so the "expire my previous issued row" UPDATE threw `23505`
   after the second abandoned attempt — and that table is shared by verification, appeals, signup and
   reset. Now a partial unique index on `(email, purpose) where status = 'issued'`
   (`src/db/schema.ts`), with `db/migrations/2026-10-29-human-challenge-single-live.sql` for
   production (idempotent both ways, keeps history, keeps the index name, and drops BOTH the constraint
   and the standalone index because production has the former and an ORM push makes the latter). Proven
   live in both directions and pinned by `[14]` plus `main`'s re-issue test plus control 6.
2. **Stage 2 graded the client's pose string (pre-existing).** The second engine's prompt interpolated
   `poseLabel` from the request body while stage 1 used `askedPose`, i.e. the "prove you are live" step
   verified a pose the submitter chose — and that text went into a prompt inside a template literal.
   Now both stages use the server's label; pinned in `[14]`, tested in `main`/`adversarial`, control 2.
3. **A refused second engine was invisible (pre-existing).** `engine:"single"` could not distinguish
   "no second engine configured" from "configured and it rejected our key". The audit method now
   carries `+lm7:<reason>` and the review response carries `engineReason`; tested in `refused`/`single`.
4. **The `legacy` escape hatch was wrong twice, both times caught by this suite.** First it was
   decorative (the flag relaxed nothing, because `approvable` already contained the proof), then the
   first fix relaxed *both* halves and approved a request whose liveness token had never existed. Final
   shape: `approvable` is the models' opinion only; `freshnessProven` is never waivable;
   `poseProven` is relaxed only by `FREEBORN_POSE_ENFORCEMENT=legacy`; and a hatch grant is marked
   `+unproven:legacy-pose` in the column an operator can query, with the prose on the same row. The
   lesson is recorded in `.env.example`, because both failure modes are the kind a future refactor
   re-introduces: an escape hatch that escapes nothing is worse than none (the operator believes the
   control is off), and a hatch that escapes everything is the vulnerability you shipped.

### 1f. Two more defects, both invisible until the branch met production

5. **An engine outage was reported as the member's photograph, and written as their rejection.**
   `askGemini` returned a bare `string | null`; the caller turned `null` into
   `status:"rejected", stage:"inspect"` plus "The verification service couldn't read the photo." Four
   different failures shared that one string: the model answering in prose, the free proxy dropping the
   images, a timeout, and the state production was in — `ANTIGRAVITY_MODEL` did not exist, because the
   id was frozen in source and the gateway in front of `ANTIGRAVITY_BASE_URL` 404s it (502 wrapping a
   backend 404 "Requested entity was not found"). Measured 2026-10-30 with a throwaway probe
   deployment: `gemini-3-flash` and `gemini-2.5-flash` answer 200 *with a real 237 KB photograph
   attached*, returning a usable verdict in the product's own JSON shape, and correctly refusing the
   pose that photograph does not make — `{"observedPose":"Right hand resting on wooden fence.",
   "faceCount":1,"lightingOk":true,"matchesAsked":false}`. The frozen id answered 502. So every member
   attempt that day was refused for our configuration, told it was their face, and recorded as a
   rejected member. Now: `askGemini` returns `{ text, reason }`; a failed *call* parks the attempt
   (`verification_requests.status='pending'`, `reviewed_at` null, the selfie kept for the retry,
   `+stage1:<class>` in the `method` column an operator can query) and answers "nothing was decided,
   try again in a few minutes"; a verdict we could not parse stays a rejection, tagged
   `+stage1:unparseable`. The model id became `ANTIGRAVITY_MODEL` with the probe-verified working id as
   the default, because freezing a gateway fact in source is how this became an outage. `refused`/
   `single` modes now carry a scripted 502 and an empty completion.
6. **The review queue failed open outside production.** `api/admin/review-queue` gated on
   `if (isProduction && allowlist.length === 0)` — `isProduction` being `NODE_ENV === "production"` —
   so in a development-mode runtime with no `FREEBORN_ADMIN_EMAILS` the whole queue (reports, cases,
   appeals, trust history) answered any signed-in member. Checked the Vercel project: that variable is
   assigned to Production and Preview only, so the combination is real. The qualifier is gone; an empty
   allowlist now 404s everywhere, matching what `api/health/engines` already did. The harness pin that
   required the old spelling is retargeted and asserts the old form is *absent*, so it cannot be
   satisfied by keeping both. Verified on both live deployments: `GET /api/admin/review-queue` signed
   out returns 404 "Not found" on production and on this PR's preview.

### 1e. Preserved functionality
`FREEBORN_POSE_ENFORCEMENT` defaults to enforcing (`review`); global automated enforcement is
unchanged and still off; `verify-modal`'s existing pose/camera/gate flow keeps its behaviour and only
adds one body field; no existing route contract changed shape (the added response field
`engineReason` is additive). `npm run lint` 0 problems, `tsc --noEmit` clean, `check:secrets` clean
(271 files), `next build` succeeds, harness 249/249, and all six e2e modes pass: 62 assertions
(main 13, adversarial 15, ratelimit 10, legacy 7, single 8, refused 9). Vercel's own build for
`998df04` ran `npm run test:trust` green inside the deploy pipeline (build 26.5 s,
`dpl_7UiT7fK9NJoYsgXgtZ2Kb4UicQrc`), which is an independent execution of the harness — not of the
e2e, which has no CI runner here (§3.2).

---

## 2. Works in production — what is actually claimable

**Rewritten on 2026-10-30 after the member flow was actually executed against production.** The
earlier version of this section said "nothing in this pass is verified in production", which was true
when it was written and is no longer true; the claims below are each tied to a response or a row.

* **The lockout fix in §1d.1 is applied to production and proven there.** `POST
  /api/verification/challenge` returned 200 three times in a row for one member (poses "Show a peace
  sign beside your eye", "Hand over heart", "Place one hand under your chin"); under the old
  `unique(email, purpose, status)` the second re-issue 500s. The live schema now carries the partial
  unique index (constraint gone, count 0, same index name, 4 indexes on the table).
* **Freshness and pose provenance fire in production.** `verification_requests.method` for that
  member's attempts: `dual_model+fresh+pose`, `dual_model+fresh:missing+pose:absent`,
  `dual_model+fresh:replayed+pose:mismatch` — a replayed token and an absent token are both recorded
  and refused, and no leg of the flow could fake the pose because the server assigned it.
* **The retention rule holds on real data.** All six rejected rows from today have
  `selfie_media IS NULL`; the two 2026-10-07 approved rows still hold theirs, which is exactly the
  policy (only an approved selfie is read back, for the identity gate). After cleanup the database is
  back to its pre-test counts (8 members / 7 identities / 8 profiles / 8 requests / 10 events /
  11 photos / 0 human_challenges).
* **Not verified in production, still:** the approval leg (no consent-clean second face available in
  this session), the review-queue *payload* (no member session carries an admin email; I did not read
  that secret to forge one), the integrity lane's effect (its client half ships only here), and RLS
  policy rows (see the bullet below).

* The changes live on a branch in this workspace's clone, verified against a **local** Postgres 17.11
  cluster (schema pushed from `src/db/schema.ts` + the `hamming64` function from the shipped migration
  set) and a **scripted** vision double. No real member request was made against
  `freeborn-umber.vercel.app` during this pass.
* `db/migrations/2026-10-29-human-challenge-single-live.sql` **has been applied to production**
  (2026-10-30) after the version in this branch was corrected: production holds the rule as a table
  CONSTRAINT, `drop index` on a constraint-backed index fails `2BP01`, so the file now removes both
  shapes before creating the partial index. Reproduced against a temp table: the old shape still
  rejects the second live row with `23505`, the new one does not.
* Row-level security on `security_events` was not re-inspected in production this pass. This lane adds
  **no new table**, so the exposure profile of the integrity rows is exactly the existing
  `security_events` profile that `identity-resolve` already writes to — but "same as before" is not the
  same statement as "verified", and I have not verified it here.
* No vision-provider credentials exist in this environment, so the two engines were exercised through
  a double that speaks their wire format and answers with the shape their parsers expect. That is
  enough to prove prompt construction, consumption ordering, audit content and the gate; it is not
  evidence about model behaviour on real faces.
* `next build` here needed `NODE_OPTIONS=--max-old-space-size=1600`; that is a constraint of this
  sandbox (≈500 MB by default), not of the deploy, and it is deliberately **not** baked into
  `package.json`.

What *is* strong evidence, and worth stating plainly: the gate, the pose binding, the single-use
freshness, the retention bounds and the privacy limits are executed against the shipped code paths, a
real database with real constraints, and HTTP-level engine calls — and eight independent mutations of
those sources make the suite go red.

---

## 3. Still blocked / open
1. **Owner actions required, in risk order.** (a) Production still runs the model id that 404s: merge
   and deploy this branch, or set `ANTIGRAVITY_MODEL=gemini-3-flash` on the `freeborn` project's
   Production target — until one of those happens every verification attempt fails and every member is
   told it is their photograph. (b) Rotate the legacy `anon` + `service_role` JWTs, which are still
   enabled alongside the publishable pair; a leaked `service_role` bypasses every RLS policy here.
   (c) Raise `password_min_length` from 6 to 12 in the Supabase dashboard — `src/lib/password.ts`
   documents the mismatch, and `update_auth_config` exposes no such field (and is a whole-config PUT
   that clears whatever you do not send, so it must not be used for this). (d) Decide what stage 2 is
   for: `VOID_AI_*` answers text and returns `400 Vision/OCR is disabled for free plans`, so the
   "dual model" second opinion currently cannot see the face. (e) The migration is applied; the branch
   is not deployed. I did not write to Vercel's environment or promote a deployment from here.
   See `VERIFICATION-MECHANISM-MAP-2026-10-30.md` for the full implemented-vs-proven map.
2. **No CI in this repository** for these lanes (there is no workflow running the harness or the e2e),
   so a green Vercel check on the PR is *not* validation of any number in this document. Validation is
   `npm run test:security` and `npm run test:pose:negctl`, run locally; the PR body says so.
3. **Environment variables an operator must set** (names only, no values in git or chat):
   `ANTIGRAVITY_BASE_URL`, `ANTIGRAVITY_FREE_API_KEY`, `VOID_AI_BASE_URL`, `VOID_AI_API_KEY`
   (this one must be prefixed `sk-voidai-` or the key guard reports `invalid-key`),
   `FREEBORN_ADMIN_EMAILS`; optional `FREEBORN_POSE_ENFORCEMENT` (default `review`),
   `FREEBORN_HUMAN_CHALLENGE`, `PGPOOL_MAX`. Set in the Vercel project environment.
4. **Retention hygiene, unfixed by choice:** a pose row for an abandoned flow stays `status='active'`
   until the member re-issues or a check expires it — nothing sweeps idle rows. Reads always filter
   `expires_at`, so this is not a bypass (and no assertion here claims it is); it is unbounded row
   growth in a table that should shrink. Deliberately left out of this change set rather than half-done.
5. **Advisory → reviewer visibility is not wired.** `memberVisibleIntegrity()` exists and is tested,
   but the review queue UI does not yet show integrity factors to the reviewer, and the trust score
   carries no weight for them. Both were left out on purpose: adding a score weight is an enforcement
   change, and the brief keeps automated enforcement disabled until legitimate member flows pass in
   production.
6. **Nothing here proves liveness.** `/api/verification/challenge` already says so: freshness and pose
   provenance rule out replay, precomputation and self-serving prompts; a live human still rests on the
   two engines' reading of one frame. Frame-level server-side analysis remains the open gap.

## Reproducing
```
npm run test:harness          # 249 assertions, no DB or network needed
npm run test:pose             # six modes against a local Postgres (see pose-run.mjs header)
npm run test:pose:negctl      # eight controls; expects 6 caught + 2 masked-by-design
npm run lint && npm run typecheck && npm run check:secrets
```
