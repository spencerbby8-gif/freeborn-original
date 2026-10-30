# Freeborn's anti-fake-profile mechanisms — what exists, what runs, what is proven (2026-10-30)

Written from the shipped tree at `arena/browser-integrity-pose-e2e` (`998df04`+comment) and from
requests actually executed against `freeborn-umber.vercel.app` (production build
`dpl_p9oAXPzVEaQWxgd8ZZQRLhDYtJdb`, deployed from `main@b6051d4`) and its PR preview
`dpl_7UiT7fK9NJoYsgXgtZ2Kb4UicQrc`. Database facts come from SQL against project
`ihwtpwlszegrjgakqsxx`.

**"Production-tested" in this file means: I made the request and read the response, or read the row
the request wrote.** A green local suite is stated as local. Nothing here is inferred from reading a
handler and declaring it works.

## States

| Code | Meaning |
|---|---|
| PT | implemented **and** observed working in production |
| IC | implemented, behaviour decided by a config knob — currently in a state that limits it |
| LU | implemented, locally proven (harness / pose e2e against real Postgres), not yet exercised in production |
| PART | partially implemented; the missing part is named |
| AB | absent |

## The verification path itself

| Mechanism | Defends against | Where | State |
|---|---|---|---|
| Dual-model selfie judgement | one model's error granting a badge | `api/verification/check/route.ts`, `lib/lm7.ts`, `lib/moderation.ts` | PART — see "stage 2 cannot see" |
| Stage 1 "inspect" (pose + face count + lighting) | mask of a photo, wrong face, no face | `check/route.ts:404-441` | IC — its model id was broken in production until this pass |
| Server-assigned pose challenge | a face image prepared in advance, and any prompt the attacker wrote | `lib/pose-challenge.ts`, `pose-pool.ts` (8 labels), `pose-store.ts`, TTL 300 s | LU |
| Pose graded against the server's copy, not the client's string | prompt injection through `poseLabel` | `askedPose = poseChallenge.label ?? sanitized(poseLabel)`, both stages | LU |
| Freshness token, single-use, consumed before any engine call | replaying one good capture across accounts/attempts | `lib/liveness-challenge.ts` | **PT** — replayed token returned 200 with `+fresh:replayed` and `+pose:mismatch` in `verification_requests.method` |
| Human challenge (proof of work) at issue | a bot farming verifications | `api/human/issue`, `api/human/verify`, `lib/human-challenge-client.ts` | IC — `FREEBORN_HUMAN_CHALLENGE` unset ⇒ `record`: solved, counted, **never required**; enforced only for appeals, and only if set (`api/appeals/route.ts:149`) |
| Client-asserted on-device liveness (`gate`, `blink`) | nothing, on its own | `lib/face-gate.ts`, carried at `check/route.ts:324-334` | PART — required to be present, never verified; the route's own comment says so. The real defence is pose + freshness, not this |
| Identity gate on later photo uploads | swapping a verified face for a different one | `lib/identity-match.ts` (uses `callEngine`, `MATCH_MODEL_1/2`) | LU — reads the retained approved selfie |
| Photo anchor + cross-account duplication | one face, many accounts | `lib/photo-hash.ts`, `lib/identity-resolve.ts` (`deriveAnchor`, `findSharedAnchor`, `upsertFingerprint`, `openCase`) | LU |
| Trust score, review-queue priority, safety cases | silent bans; unread queues | `lib/trust-score.ts`, `review-queue-priority.ts`, `api/safety/cases` | LU |
| Browser-consistency signals (advisory) | scripted clients | `lib/browser-integrity.ts` + `-client.ts` | LU, **not in production**: the client half exists only on PR #25, so a real member sends no observations |
| Retention of refused biometrics | an audience for leaked faces | `check/route.ts` clause-7 inserts, `selfieMedia: status === "rejected" ? null : selfie` | **PT** — all six of today's rejected rows have `selfie_media IS NULL`; the two 2026-10-07 approved rows still hold theirs, by design |
| Rate limit per member (hourly verification budget) | grinding the engine for a lucky verdict | `check/route.ts` budget + `lib/engine-budget.ts` (20 s) | LU — 10/10 rate-limit mode tests; production leg untested |

## Around it

| Mechanism | Where | State |
|---|---|---|
| CSRF/origin guard on mutating routes | `lib/request-guard.ts`, `FREEBORN_ALLOWED_ORIGINS` | PT (401/405 shapes observed on unauthenticated calls; the guard's own behaviour is locally proven) |
| Security headers | `lib/security-headers.ts` | LU |
| IP reputation, scam guard, moderation policy | `lib/ip-reputation.ts`, `scam-guard.ts`, `moderation-policy.ts` | LU |
| Report → case → appeal chain with PoW | `api/reports`, `api/safety/cases`, `api/appeals` | LU |
| Operator engine diagnostic (self-reporting ladder state) | `api/health/engines` | implemented, **fails closed** when `FREEBORN_ADMIN_EMAILS` is empty; not readable by me (I never held an admin-email session) |
| Admin review queue | `api/admin/review-queue` | implemented; **was fail-open outside production** — fixed on PR #25; still needs an admin email to be usable |
| Row-level security | 4 security tables | PART — `relrowsecurity = true` on production, but the *policy rows* are not readable through the tooling I have, so I can only say "no worse than `security_events`", not "correct" |

## Four config facts that decide what a member actually experiences today

1. **Stage 1's model id was `gemini-3.6-flash-high`; the gateway answers it with 502 wrapping a
   backend 404 "Requested entity was not found".** Measured against the production project's own
   `ANTIGRAVITY_BASE_URL` (throwaway probe deployment, 2026-10-30):
   `gemini-3-flash` → 200, `gemini-2.5-flash` → 200, `gemini-3.6-flash`, `gemini-3.5-flash`,
   `gemini-2.0-flash`, `gemini-flash-latest`, `gpt-4.1`, `gpt-4o` → 404 "not found on this gateway".
   With the product's real prompt and a real 237 KB photograph, `gemini-3-flash` returned
   `{"observedPose":"Right hand resting on wooden fence.","faceCount":1,"lightingOk":true,"matchesAsked":false}`
   and `gemini-2.5-flash` returned the same shape. Note `matchesAsked:false`: the sample photo is not
   a peace sign, and the model said so — a model that was ignoring the image would have agreed.
   So: **every** verification attempt failed, and every failure was reported as the member's photo.
   Fixed on PR #25 (default now `gemini-3-flash`, overridable by `ANTIGRAVITY_MODEL`). Production
   still runs the broken default until this merges or `ANTIGRAVITY_MODEL` is set.
2. **Stage 2's provider refuses images at the account level.** `VOID_AI_*` answers text
   (`gpt-4.1` → 200 "ok") and returns
   `400 Vision/OCR is disabled for free plans. Remove image attachments or upgrade your plan.`
   for any image. `lib/lm7.ts` already names this case (`reason: "vision-disabled"`), and
   `engine:"dual"` only means *configured*, so the second opinion is currently text-only.
   Historical rows (`2026-10-07`, `dual_model:gpt-4.1 … stage1+stage2 pass`, approved) prove the
   plan used to allow it. This needs an owner decision — upgrade, or a second vision-capable key.
3. **The verification lane is the only engine consumer that does not use the shared ladder.**
   `lib/engine-request.ts` walks models × parameter rungs, caches the winner, and keeps the gateway's
   error text; `identity-match.ts:334` and `moderation.ts:88` use it, `check/route.ts` hand-rolls
   `askGemini` (`MAX_ATTEMPTS = 2`, same body every time). That asymmetry is why a gateway model-id
   change silenced verification while the identity gate kept answering. Aligning them is the
   principled fix and is deliberately left out of this PR (see the code comment).
4. **`FREEBORN_ADMIN_EMAILS` is assigned to Production and Preview only, not Development.**
   Combined with the old `isProduction &&` qualifier it made the review queue readable to any
   signed-in member in any development-mode runtime. Both halves are addressed on PR #25 (gate) —
   the missing Development assignment is a Vercel change I did not make, because I do not write
   secrets or env to this project without an explicit go-ahead.

## Missing / recommended, in risk order

1. **Rotate the legacy `anon` + `service_role` JWTs.** Both still exist and are enabled alongside the
   publishable key pair. A leaked `service_role` string bypasses every RLS policy in this file.
2. **Raise `password_min_length` from 6 to 12 in the Supabase dashboard.** `src/lib/password.ts`
   documents that the app requires 12 while the provider accepts 6, and that hosted password-recovery
   flows do not go through this codebase. Verified-blocked from my side: `update_auth_config` exposes
   no such field, and it is a whole-config PUT that clears fields it is not given, so "just set it"
   would damage unrelated settings.
3. **Decide what stage 2 is for.** As configured it cannot see the selfie (fact 2). Either it becomes
   a text-only second opinion about stage 1's *description* — and the docs should stop implying two
   models looked at the face — or the plan changes.
4. **Set `FREEBORN_HUMAN_CHALLENGE=enforce` for verification too, not only appeals.** Right now the
   proof of work is recorded and ignored on the path where bot volume actually matters.
5. **Sweep or delete the legacy `verification_challenges` lane.** 7 rows, every one still `active`,
   every one from 2026-07-13, one account, and none with a token shaped like the current server's
   nonce. That lane has produced nothing since July and nothing expires it.
6. **Verify RLS policy *rows*, not just `relrowsecurity`.** From the tooling available to me the
   policies are unread; that is the one claim in this file an owner has to confirm.
7. **Give the client integrity collector a release.** The server half tolerates its absence by
   design, so shipping it is a pure information gain — and until it ships, "browser-consistency
   signals" are not a production mechanism, they are a local one.
8. **One honest sentence in the product copy:** nothing here proves a live person. Freshness and pose
   provenance rule out replay, precomputation and self-serving prompts; they are not a liveness
   proof, and a determined attacker with a render farm and a solved pose is out of scope for this
   design. `face-gate`'s blink flag is client-asserted and should not be advertised as detection.

## What I could not test, and why

- **The approval leg.** Producing a consenting second face needs an image generator; that tool is
  blocked in this session (403). The refusal legs are all tested; an approval in production is not.
- **Admin surfaces.** No member session carries an email in `FREEBORN_ADMIN_EMAILS`, and I did not
  read that secret to forge one. So: gate behaviour verified (404 on both production and the PR
  preview for signed-out requests), payload never read.
- **The full member route on the fixed build.** A session requires either a temporary
  `mailer_autoconfirm` flip (this project's built-in SMTP sends 2 emails/hour, so confirmation links
  are not usable) or the admin API. The engine half was verified instead at the provider boundary
  with the product's own prompt and parse rule (fact 1); the route's behaviour on the outage path is
  proven locally against real Postgres (pose e2e `refused`/`single` modes).

Evidence: `/home/user/re/analysis-2026-10-30/live/` (`flow.py`, `flow2.py`, `check1.json`,
`check-live.json`, `e2e-final.log`, this file's DB counts) and the throwaway branch
`arena/engine-probe-20261030` (probe route, deleted after this pass; its redacted replies are quoted
above rather than pasted, because provider error text is a fingerprint map).
