# Reference chat rebuild and native verification

> Historical baseline. The newer loader/OTP/onboarding/media work, migration dependency and fresh results are documented in [SETUP-MEDIA-VERIFICATION-REVIEW.md](SETUP-MEDIA-VERIFICATION-REVIEW.md).

## Scope

Continues the existing `feat/prototype-to-production` branch and draft PR #90. The previously reviewed, unpushed chat/settings work was preserved as commit `a7f185a` after recovering it against the remote `33001a6` baseline. No merge or direct production deployment.

## Rebuild

- Shared `ChatHeader` uses the reference avatar, verified name, presence line, back chevron and three-dot menu. Verified/presence fields come from the authorized API, respecting hidden activity.
- Default matched chat now follows the reference: 73px header, compact date label, 78%-width text bubbles, reference padding/radii/palette, and bottom plus/input/send-arrow bar. Calls move behind the three-dot menu; voice recording behind Attach. Uploads, camera, reactions, quotes, refusals, policy enforcement and server sends remain.
- Private unmatched drafts use the same chrome, retaining explicit consent invitation semantics; opener text is not secretly delivered. Actual chat suggestions remain unsent until Send.
- Typing dots only appear on a real typing notice, not scripted prototype timers or fake replies. Timestamps/read receipts remain accessible without adding visible rows inside the reference bubbles.
- Restored the supplied shared color/gradient tokens after identifying a later override. The exact `verify-badge.tsx` and original auth flame are unchanged.
- Login verification invitation and every process step are now native full-screen member UI: intro, pose, camera, review, checking, pending, approved, rejected and error. The reference shield/check is copied independently of the member badge.
- Notification permission prompt restyled and suppressed during verification, chat and calls; browser notification permission is requested only via the explicit alerts button, not an unrelated first gesture.

## Verification and chat correctness found during testing

- Non-2xx/unconfirmed selfie submissions report error, never false pending/success. Only confirmed server results select outcome screens. No fake progress percentage or promised approval time.
- Capture freezes liveness evidence before camera cleanup. Close/review stops camera tracks. A permission request completing after close releases its stream rather than reopening capture.
- Clock-skew tests exposed optimistic chat echoes that were not retired by a stored message's acknowledged ID. Reconciliation now uses the exact stored ID, preserving unrelated equal-text sends. Added regression assertions.
- Server verification/pose controls and data-retention endpoints were not weakened or bypassed. No migrations added.

## Evidence

- Clean Node 24 production build with fixture public URL/key: pass.
- TypeScript and ESLint: pass.
- Browser fixtures: 39 general checks + 20 focused chat/verification checks = **59/59**, **100 captures**, **zero page errors**, at 393×852 and 1440×1000.
- Focused camera tests use Chromium's fake camera and intercepted verification responses. Green test-pattern images are not a person's selfie. These tests prove UI lifecycle/request behavior, **not biometric accuracy**.
- Local handler contracts: **23/23**, with substituted auth/database adapters.
- Static member-route reachability: **26 entries**, no banned legacy views reached.
- Trust harness final result recorded in `evidence/chat-verification/trust.log`. Two earlier runs on the busy build worker tripped the unchanged 25ms image-hash timing check (25.3/26.6ms); no assertion or threshold was removed or relaxed.
- Selected PNGs, test result JSON and reference comparison JSON are under `evidence/chat-verification/`.
- Complete self-contained visual review: `/home/user/freeborn-audit/Freeborn-Chat-Verification-Comparison.html`.

## Exactness audit — not a blanket pass

**37 original/current pairs compared, zero missing captures, zero pixel-identical pairs.** This includes all supplied real-screen captures, their lower scroll states, the empty deck, both viewport sizes and the new login verification invitation. The supplied `verification-simulated` success state is intentionally not reproduced: approval must come from the existing server.

The new chat uses the same fixture text and original Maya portrait to make comparison meaningful. Mobile first bubble starts at y=115px; header is 73px. Raw RGB mean absolute channel error is about 0.16/255 on that pair, including the intentionally absent fake typing indicator. This is **not** a claim that the app is pixel-exact, nor a UX similarity score.

Remaining differences are listed per screen in `reference-comparison.json` and the HTML review:
- Discover: enclosed actions, crop/spacing/stack and data-driven filter chips still differ from this reference capture.
- Member detail: taller photo, fuller supplied details and hidden tabs reflect earlier requested changes.
- Lists, profile statistics and matches use actual fixture/service-shaped data, not made-up prototype counts/people.
- Onboarding contains full production fields rather than the shorter simulation.
- Auth includes the requested visible real Google buttons and recovery access.
- Membership does not fabricate prices/live checkout.
- Verification adds real consent/storage disclosures, recoverable failures and server-confirmed results instead of the prototype no-op disclaimer.

## Limits and release

No hosted Supabase/RLS, actual Google sign-in, real account persistence, physical-device camera or biometric acceptance is claimed. No OAuth/database configuration changes. Pushing this branch can trigger its normal Preview build; this work performs no merge or direct production deployment. Exact remote commit and PR state are verified separately in the completion receipt after the push.
