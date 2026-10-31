# The remaining systems, mined from the clients — with two corrections to what I claimed before

2026-10-30. `rea-systems-mine.py` → `SYSTEMS-MINE.json`: 11 systems × 67 files / 11,530,553 bytes,
counts **and** per-hit file@offset samples. Every conclusion below was read in context; several
counts were rejected as noise and that is recorded too. Client-side only — none of this shows a
server.

## Corrections to earlier statements in this folder

**C1 — "Tinder's selfie verification is first-party; no verification vendor appears anywhere" was WRONG.**
The earlier grep looked for `jumio|onfido|veriff|yoti|persona` only. Reading the actual bundle:

- `tinder.main-…js@~93141` reducer: `case Ae.cv:{const{selfieChallengeToken:a}=t.payload;…} case …{selfieStatus…}` —
  challenge **token + status live in the store**, written by typed actions.
- `…@~93141 …liveness`: an enumeration of *methods and states* —
  `SELFIE_VERIFICATION:"selfieVerification", MLC_LIVENESS:"mlcLiveness"`, and
  `l={LIVENESS:"liveness", MATCH_3D:"3d3d", IDV:"idv", IDV_SCAN_ONLY:"idvScanOnly"}, d="VALID", _="/vendor/fa…`.
- `…@~93141 …facescan`: **`FaceTec_presession_brighten_your_environment`,
  `FaceTec_result_facescan_upload_message`, `FaceTec_retry_header`, `FaceTec_retry_subheader_message`**
  → FaceTec is the liveness vendor, and it has per-outcome copy including a *retry* screen and a
  pre-session lighting prompt.
- `…@~93141 …jumio`: **`onboarding.age_gate_jumio_appeal_enabled`**, `age_verification.post_onboarding_enabled`
  → Jumio for the age gate, with an **appeal** path attached to the gate, and `identity.account_deletion_full_page`.
- Same block: `integrity.agent_signals_enabled`, `integrity.agent_signal_block`,
  **`integrity.biometrics_liveness_bouncer_enabled`**, **`integrity.liveness_use_backend_value`**
  → the liveness pipeline is **flag-addressed**, and the *backend's* liveness value wins over the
  client's. `X-Agent-Signals` (found earlier in the transport config) is gated by the same flag family.

What Freeborn keeps and what changes: our two-stage selfie + review stays (it fits a community that
will not hand a third party their biometrics, and the brief forbids inferring anything about
members). Adopted as *mechanisms*: (a) **server-authoritative result** — never trust the client's
pass/fail, which `verification_requests.status` already enforces and which I should mirror in the
pose stage; (b) **a distinct retry copy per failure mode** (bright environment / upload / retry)
rather than one generic "try again"; (c) the whole surface behind flags, so enforcement can be
turned per cohort — which is how `FREEBORN_POSE_ENFORCEMENT` already works.

**C2 — the HTTP→gRPC mapping and `Retry-After` reading are TELEMETRY code, not the member API path.**
`hinge/_app-7f50c6d6b07df510.js@…`: `case 413:{code:"failed_precondition"} case 429:{code:"resource_exhausted"}
case 499:{code:"cancelled"}` sits **two lines from** `"x-sentry-rate-limits": e.headers.get("X-Sentry-Rate-Limits"),
"retry-after": e.headers.get("Retry-After")` — i.e. it is the Sentry transport's own backpressure handling.
Tinder's `if(429===t)return` telemetry-skip and `429===t&&(o.all=s+6e4)` belong to the same class of code.

So `src/lib/api-response.ts` is **not** "what their app clients do". It is a sound design whose
*parts* are evidenced (bounded retries, honour `Retry-After`, don't alarm on 429) and whose
composition is ours. The label on that claim is corrected here; the code does not change — suppressing
telemetry noise for a throttle and refusing to parse a non-JSON body are correct on their own merits,
and the harness measures them.

## New findings worth having

1. **No realtime transport exists in any acquired bundle.** `new WebSocket(`, `socket.io`, `Pusher(`,
   `EventSource(`, `ably-js`: **zero** across 67 files. The `ably` matches from the pattern mine were
   the substring in "pro**bably**" (Sentry log text, video.js MIME checks) — rejected. Conclusion, stated
   as a limit: their member-app realtime is not in the public bundles, so **Freeborn's chat realtime is a
   design decision on Supabase (`postgres_changes`), not something to copy.** Nothing in this repo should
   ever claim to have RE'd their sync protocol.
2. **Hinge wraps a channel publish in a bounded retry with jitter** —
   `132-4be892819dbac6b1.js@~35.2k–36.3k`: `maxRetries||5`, `retryDelay||k`, `shouldRetry:P`,
   `attemptNumber:l+1`, `Math.pow(2,e)+100*Math.random()`, around `setTimeout(()=>i.channels.request.publish(h),u(l))`.
   Library identity unconfirmed, but the *shape* is: publishes are retried with capped exponential
   backoff + random jitter, and the attempt number travels with the call. Freeborn's realtime publish
   (call-bus) and media fetch should follow the same shape, with jitter — which my `retryDelayMs` lacks
   by default (`jitter:0`). Follow-up: pass jitter on publish paths so two members' clients don't
   re-sync in lockstep.
3. **Account deletion is an explicit saga with a success action**: `DELETE_ACCOUNT` → `deleteAccountSaga`,
   and `DELETE_ACCOUNT_SUCCESS` in a set alongside `FETCH_PROFILE_SUCCESS`/`USER_DATA_SET`
   (`tinder.main-…js@~159574`, `@~73931`). Our `/api/account` DELETE is one request whose bucket sweep is
   pinned as an ordering property; the pattern to adopt is the **completion signal** (an event/row that says
   the deletion finished), so a partially-completed deletion is visible rather than assumed.
4. **Media URL builders take `{src,width,quality}`** — hinge `107-…js@17570` and `@114077`
   (`quality:80`, `width:1280`) on poster/asset paths, i.e. a *single helper* every image call goes
   through. Freeborn has `resolvePhotoUrl` doing only prefix selection; extending that one function is
   where any future sizing or blur would go — one choke point, as they have.
5. **Rejections recorded**: `matching` 96/106/19, `ranking` 72/60/69 and `moderation` 280/55/119 are
   dominated by generic tokens (`score`, `report`, `matchId` inside framework code); `privacy` bumble=146
   is **marketing i18n keys** (`bumblesite@pages.features.incognito-mode.hero.title`, `travelMode`) —
   evidence the features are advertised, not how they work; tinder's `lastActive` hits are Sentry
   `lastActiveSpan`. `photoVerification` and `persona` (hinge/bumble) were `personalProfileBlock` /
   `personal information`. None of those rows are citable, and `resumable_chunks`/`multipart` upload
   evidence remains absent from the member path (tinder's `multipart` hit is unrelated).

## Reproduce
```bash
python3 re/rea-systems-mine.py     # → re/analysis-2026-10-30/rea/SYSTEMS-MINE.json
```
