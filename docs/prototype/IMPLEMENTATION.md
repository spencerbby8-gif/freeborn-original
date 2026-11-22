# Prototype-to-production implementation review

**Status: reviewable local implementation, NOT production acceptance. Do not merge or deploy on the strength of the fixture tests.**

Branch: `feat/prototype-to-production`
Created from main: `caea1beaa8ee4f3e58b0f4052ffd01ddaeae2b33`
Authoritative reference: https://freeborn-git-landing-designed-a934d1-spencerbby8-5225s-projects.vercel.app/prototype

## Scope and audit

The repository/routes, auth, Supabase schema/migration inventory, RLS catalog state, existing feature endpoints, CI and Vercel environment scope were inspected before implementation. The requested product blueprint was absent from main; the owner explicitly approved proceeding without it. No production member rows were used for screenshots or fixtures.

The reference is a frontend simulation: toast-only checkout, timed verification, scripted chat and sample members are not production contracts. Those simulations were not transplanted into member-facing functionality.

The existing Vercel project was identified, and its configured Preview Supabase reference is `paskturljojjopxhnrik`. The accessible Supabase connector exposed production rather than that Preview project. Both provided management tokens returned 401. Production was not substituted for Preview. No remote migrations or environment changes were made.

## Implemented route wiring

| Reference screen | Implementation | Behavior / retained services |
|---|---|---|
| Welcome | `/auth` | Reference marketing art and form; existing Supabase email/password, Google, CAPTCHA, password strength, password reveal/Caps Lock help, recovery and confirmation handlers retained |
| Onboarding | `/onboarding` | Reference frame, progress, option cards and CTA; original seven-step draft/save/upload/validation/completion flow retained |
| Discover | `/app` | Authenticated discovery; persisted preferences; pass/like/spark/reset and consent-based message requests; retained advanced filters |
| Profile detail | Discover/Likes member dialog | Actual profile data, pass/like/spark/request actions; full original profile/safety/report/block/unmatch controls remain accessible |
| Likes | `/app/likes` | Authenticated incoming likes and like-back; original activity/outgoing/undo interface preserved at `/app/likes/activity` |
| Messages / chat | `/app/chat`, `?match=…` | Existing thread loader, messages, delivery/retry state, media, voice, calls, reactions, consent and read-only notices retained; reference list/header/search/bubble styling |
| My profile | `/app/profile` | Actual profile, photos, likes and matches; full existing editor at `/app/profile/edit` |
| Notifications | `/app/notifications` | Existing live feed, type filters, links and polling; server-persisted dismissal cutoff for Clear all |
| Settings | `/app/settings` | Menu routes to actual account, privacy, notification, discovery, subscription, support and legal surfaces; actual sign-out |
| Preferences | `/app/preferences` | API-backed age/distance/gender/interests/intention settings and save/error feedback |
| Premium | `/app/premium` | Reference plan selection retained; explicit unavailable notice; no fake charge, entitlement or purchase success |
| Matches | `/app/matches` | Actual active matches and thread deep links; no sample people |
| Verification | `/app/verification` | Reference presentation opens existing camera/verification consent and engine flow, never a timed approval |
| Privacy | `/app/privacy` | API-backed distance/presence/discoverability/receipts; original detailed audience and blocked-account controls preserved under `/app/settings/privacy` |

Additional legacy controls remain accessible through the original settings tabs. Account opens the Account area, support links to the real support form, and About links to actual policy/support pages.

## Backend changes

- Settings reads now return interests, profile goals and saved discovery intentions. Read failures return an error rather than fabricated defaults that could overwrite existing preferences.
- Settings writes validate/bound/deduplicate interests and validate discovery intention values. Authenticated owner filtering remains in place.
- Discovery uses saved relationship intentions unless explicitly overridden by nonempty advanced filters.
- Like-card metadata includes actual calculated age, occupation and interests. No invented distance is returned.
- Notification clear records a server timestamp for the signed-in member. It does **not** delete messages, mark them read, remove matches or alter likes. The synthetic welcome tip does not reappear after dismissal.

### Additive migration — not applied remotely

`supabase/migrations/20261121210000_notification_dismissal.sql` adds nullable `notification_preferences.dismissed_before timestamptz`. NULL preserves prior feed behavior. Existing owner/runtime RLS policies and grants are unchanged. There are no destructive statements.

The clean-start manifest includes the new step **after** the frozen legacy verifier. Historical migration SQL remains unchanged. Inventory is 53 replay steps / 44 public tables / 449 columns / 130 indexes / 82 checks. The replay script's final ledger count now derives from the manifest, instead of the previous stale literal.

**Apply/review the additive migration in the isolated Preview environment before enabling code that selects the new Drizzle column.** No clean-start/reset command was run; it is not an upgrade procedure for a populated database.

## Tests and evidence

Local environment: Node 24.22.2. Production builds used explicit nonfunctional test-only public Supabase configuration, not production or Preview credentials.

| Check | Actual result |
|---|---|
| TypeScript | Passed |
| ESLint | Passed |
| Next production build | Passed; middleware-to-proxy deprecation warning remains |
| Migration inventory / historical immutability | Passed |
| Trust harness | 619/619 passed |
| Engine request controls | 10/10 passed |
| Database TLS controls | 10/10 passed |
| TURN controls | 30/30 passed, local doubles |
| New settings/notification handler contracts | 23/23 passed, substituted auth/database adapters |
| UI interaction checks | 9/9 passed, intercepted fixture APIs |
| UI captures | 15 screens × 2 viewports = 30 implementation screenshots; no page JavaScript errors in that run |
| Local HTTP boundaries | Settings/discovery/likes/notifications anonymous GET: 401; foreign-Origin notification POST: 403 |
| Environment-isolation / secret scan | Passed |
| Hosted Preview auth, persistence, RLS negative tests, messaging/calls, media and verification | **Not run: Preview access blocked** |
| Billing / entitlement webhook acceptance | **Not run: provider/products unselected** |
| Physical phone / real camera / accessibility audit | **Not performed** |

[Screen-by-screen comparison](COMPARISONS.md) contains reference and implementation images at **393×852** and **1440×1000**. Implementation data is deliberately fabricated **inside test adapters only**; it is not shipped as member data or proof of backend acceptance. Lossless screenshots preserve differences rather than claiming a pixel-match score.

### Reproduce local UI checks

1. `npm ci` using Node 24.
2. `npx playwright install chromium --with-deps` (or install the headless shell only).
3. Build and start locally with `NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.co`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture-publishable-key`, and `NEXT_PUBLIC_APP_URL=http://localhost:3000`. These values are nonfunctional test configuration; do not add them to Vercel or commit an environment file.
4. `npm run test:prototype-ui`. Test adapters intercept APIs in Chromium; the application source has no fixture-mode bypass. The runner refuses non-loopback targets. Captures default to ignored `scripts/prototype/.shots/`.
5. `npm run test:prototype-api` runs actual settings/notification handlers with substituted service adapters, no hosted database.

## Known gaps / deviations requiring follow-up

This is not an assertion that every original acceptance criterion is complete.

- Hosted full-stack acceptance and migration application remain blocked by isolated Preview access. Auth providers, actual database persistence/RLS, uploads, real two-party chat/calls and verification have not been proven on the new UI.
- Billing provider, approved price IDs/currency and webhook contracts are undecided. Reference prices are presentation only; purchases/entitlements are unavailable.
- Profile-view tracking/analytics is not implemented in the existing backend. The view count is honestly shown as `—`, not the reference's invented 152. Likes/matches use API counts.
- Ephemeral stories are not implemented. The reference's “Your story” entry links to actual profile-photo editing and is annotated as such; other rings open real profiles. This is not story publishing/viewing acceptance.
- Likes do not currently receive a distance calculation; Nearby cannot populate without authorized distance data. No city-to-mileage or fabricated proximity substitute was introduced.
- Onboarding preserves required existing values validation and all existing intention choices, so it is longer than the reference's three-option demonstration. The actual intent step is step 4 of the retained flow, not the reference's decorative step 2. Additional camera/upload/editor/recovery/safety controls retain their original fuller UI.
- Profile-detail tiles use only real stored attributes. There is no fabricated zodiac/matcha/lifestyle metadata. Extra safety access and existing call/voice/media controls remain visible rather than being removed to achieve a screenshot match.
- Welcome contains additional provider/recovery/legal access; Premium contains truthful unavailability text; member counts/content naturally differ from sample screenshots. Icon paths and some retained subflows are not pixel-identical.
- UI tests cover nine targeted interactions, not every button or every error/empty state. They are not a substitute for the outstanding real-backend and device checks.

## Delivery restrictions

One feature branch only. No merge, direct production deployment, production database operation, or environment edit has been performed. The intended delivery is **one draft PR to main** with these blockers visible; do not mark it production-ready or merge it automatically.
