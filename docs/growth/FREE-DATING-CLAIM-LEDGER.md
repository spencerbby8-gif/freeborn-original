# Build 2: free matching and messaging page — claim ledger

**Route:** `/free-dating`. **State:** implemented locally for review, not deployed. **Baseline:** existing branch `feat/discovery-settings-polish`, starting commit `8e22edb42c1a2ff16bf80ba568eed6ff91ecdb48`, retaining Build 1 uncommitted changes. No production accounts, messages, submissions or payments created.

## What this actually adds

A complete server-rendered product-intent landing page, not a new matching/chat backend. Six current-feature rows with limitations; like → match → conversation explanation; three contact-troubleshooting disclosures; eight visible FAQs from the same array as FAQ structured data; real signup links; exact existing brand mark; mobile layouts; skip link and keyboard-usable native disclosures. No fake member profiles, fabricated testimonials, live-member counters or checkout UI. No new analytics, forms, database writes or public profile feeds.

It links to the existing browser guide, values tool, safety and policies. Homepage footer, guide hub and the values tool link back. Canonical/Open Graph/WebPage/Breadcrumb/FAQ metadata and one dated sitemap allowlist entry are included. No change to private indexing rules, city/market gates or badge-off behavior.

## Claim-to-source map

| Public statement | Evidence inspected | Level / limit |
|---|---|---|
| Create profile, discover, like, match and message without a paid plan | `src/components/landing/faq.tsx`; account/onboarding/profile APIs; profiles/likes/chat APIs below | Consistent with current local product and prior approved FAQ. Not a new live signup certification. |
| No paid plan available currently; planned membership is not purchasable | `src/components/prototype/settings.tsx` `PremiumScreen`: plans marked not live/purchasable; button only sets a notice, states no payment/subscription | Current implementation, not a claim that pricing can never change. No reliance on “billing code does not exist, therefore forever free.” |
| Mutual likes required to open a match conversation | `src/lib/conversation-access.ts` `hasMutualLike` returns `ab && ba`; `src/app/api/chat/start/route.ts` denies non-mutual starts; `src/app/api/likes/route.ts` reciprocal-like match path | Source behavior. Message requests are a separate existing flow; page carefully refers to opening a **match conversation**, not a claim that all request mechanisms are absent. |
| Blocks/privacy can restrict contact | chat/start and chat/messages paths check `isBlockedPair` and `messagePrivacy`; `src/lib/match-lifecycle.ts` separates view/send access | Does not promise universal availability or that free overrides consent. No recipient data exposed on the public page. |
| Chat requires participation and sendable conversation status | `src/app/api/chat/messages/route.ts`: `getMember`, `ownsMatch`, `decideMatchAccess`; no payment upgrade gate in the inspected flow | Source checks, not provider-health or realtime performance proof. Some old route comments refer to preview personas; copy follows executable code, not those obsolete comments. |
| Photos and voice notes part of chat with format/size/abuse limits | `src/app/api/chat/media/route.ts`: `image`, `voice` rules, match authorization/lifecycle/block checks, MIME whitelist, maxBytes, rateLimited; corresponding member chat UI exists | Does not advertise unlimited uploads, exact caps as permanent facts or physically certified recording on every device. |
| Discovery depends on preferences, visibility and actual supply | `src/app/api/profiles/route.ts` authenticated viewer, preference/audience/block filtering; existing privacy/presentation contracts | No member-count or near-you promise. No public profile cards fetched for this page. |
| No app-store download necessary | Actual Next.js browser app/auth route; existing manifest; existing browser guide | Supported-browser access, not offline operation. No new app install or physical iPhone/Android tests. |
| Closed-app notifications not guaranteed | `NotificationsScreen` in settings explicitly states closed-app push unavailable | Page does not convert PWA installability into a push claim. |
| Adults 18+; safety/onboarding/eligibility requirements remain | Existing FAQ, terms/onboarding implementation | No claim that all age checks or production provider systems have been revalidated. |
| Badge is not a safety guarantee | Existing FAQ and safety/policy limitations | No health badge reinstated or health verification implied. |
| No guaranteed local members | Existing city gating remains untouched: `src/lib/city-pages.ts` threshold five, allowed-country list, QA exclusion, banded counts | A **public city-page eligibility gate**, not proof of account-wide country availability. Page does not enumerate countries or promise coverage. |

## Tests added

- `scripts/seo/free-dating-contracts.mjs`: copy/data invariants, same-source FAQ wiring, source guards, links and dated allowlist entry. Saves hashes for inspected source files when `FREE_DATING_EVIDENCE_DIR` is provided. A regex/contract passing does not prove end-to-end backend security.
- `scripts/seo/free-dating-browser.cjs`: actual rendered metadata/JSON-LD, six feature rows, eleven native disclosures, keyboard and no-JavaScript use, signup navigation without submission, canonical/sitemap and public link coverage, responsive layouts and axe scans.
- Existing Build 1 suite and full harness are rerun as regressions; results recorded in the delivered Build 2 evidence pack, not assumed from old logs.

## What would make this “growth proof” (not available yet)

1. Approved deployment and checks against that exact release.
2. Authorized real-device/account/provider testing through the existing release gates.
3. Search Console/Bing baseline plus post-release observations: actual eligible non-branded queries, impressions/clicks and index status.
4. Privacy-reviewed aggregate completed signups and useful return, with referral acquisition reported separately from search.

The landing page is an implemented piece of that funnel. It is not evidence of demand, traffic, successful matches, legal compliance or a completed growth system. No external release/PR/submission/public-post permission is implied by this build.
