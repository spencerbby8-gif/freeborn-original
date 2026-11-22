# Chat, cards and native Settings review

## Scope and verification

Prepared on `feat/prototype-to-production`, continuing draft PR #90, without merge or direct production deployment.

- Node 24 clean production build: pass (fixture Supabase URL/public placeholder key).
- TypeScript and ESLint: pass.
- Trust harness: 619/619. Legal-source assertions now follow the shared documents **only when the public route retains the expected document import and metadata re-export**. No assertion removed.
- Local handler contracts: 23/23 (substituted auth/database adapters).
- Browser fixtures: 39/39, 64 captures across 393×852 and 1440×1000, zero page errors.
- Secret scan and `git diff --check`: pass.
- Exact `verify-badge.tsx`: no diff. Original auth flame retained.

Evidence: `evidence/chat-settings/results.json` and selected captures beside it. Full local review: `/home/user/freeborn-audit/Freeborn-Chat-Settings-Review.html`.

These are local tests, **not hosted Supabase/RLS, real OAuth sign-in, or persistence acceptance**. Pixel-exact equivalence and physical-device behavior are not claimed.

## Say hello: no silent delivery

1. Discover/member-detail Say hello only navigates to `/app/chat?to=<authorized member>`.
2. Authorized public profile fields generate a deterministic editable opener. No external AI request, invented compatibility claim, request, like, or message is triggered on opening or editing.
3. Existing match: renders the existing real `Thread` with an initial draft. Only its existing Send handler posts `{match, text}`. Existing policy/read-only checks remain intact.
4. Unmatched member: explicit **Send request** posts only `{to}` to the existing consent API. The opener is **not** included, delivered or server-persisted. The UI explains this before and after confirmation.
5. Incoming invitation: explicit **Accept & open chat** accepts; opening the real Thread does not auto-send the suggestion.
6. Pending invitations disable repeat sending. Refusals remain errors, never sent confirmations. Server authorization/consent remains authoritative.
7. Unmatched drafts live only in component memory; closing/reloading discards them. Waiting on the same screen polls for an accepted match. No queued-message schema was added.

The shell still emits existing presence heartbeat/security checks on navigation. Tests record all writes, excluding only those two unrelated endpoints from chat/like no-side-effect assertions.

## Card and branding audit

- Shared DiscoveryCard drives landing samples and authenticated Discover.
- Beneath-name reference fields: age, occupation, city, height, activity, interests and bio; actual API fields only. Height falls back to the existing alternate height column.
- Landing samples are explicitly illustrative. No verification/activity claim is made about the sample portraits. Public sample artwork uses a plain image; authenticated images retain authorized-media handling.
- Discover notices overlay rather than pushing the deck down. Portrait top/height remains stable after Spark at both tested sizes; Say hello return checked on mobile.
- Landing mark follows the auth-inspired flame with a warm metallic disc/ember treatment. Auth's exact original mark is unchanged.
- Visual inspection found and corrected public sample image opacity and legal-grid table overflow. Regression checks now cover both.

## Settings graph

The browser traverses 16 native destinations: Settings, Privacy, Membership, Account, Notifications, Preferences, Support, About, Safety, Audience/blocked members, Device preferences, full Privacy/Terms/Cookies, Verification data/consent, and Account appeals.

All traversed destinations return 200, render the member shell, contain no `.fb-legacy` surface, and expose no internal links to public/legacy destinations (auth exits excepted). Legal text is shared with public pages; metadata and structured data remain on the public routes. Appeal rendering reuses the existing handler/challenge flow, with native chrome. Consent withdrawal uses the existing authenticated same-origin endpoint and explicitly distinguishes queued cleanup from completed cleanup.

Existing account confirmation/deletion, password/email update, blocked-member, device, notification, support and profile-editor checks remain in the suite. Billing is not configured and no purchase is offered as live.

## Google

Visible multicolor Google glyph on login and signup, wired to the existing `signInWithOAuth({provider:'google',...})` handler. Local browser interception verifies the actual provider authorize URL and `/auth/callback?next=/onboarding` redirect target. It does **not** verify the hosted provider configuration or complete a real Google sign-in.

## Release limits

No new database migration, production database writes, OAuth configuration changes, merge or direct deployment. Remote push is a separate operation requiring valid authorization; this document does not assert one occurred.
