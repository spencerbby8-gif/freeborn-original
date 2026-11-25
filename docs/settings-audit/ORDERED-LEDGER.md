# Settings — ordered control and backend ledger

## Evidence boundary

All entries below were navigated in a local production build, with production route handlers and local PostgreSQL. Supabase Auth, provider mail, ancillary feeds and external engines are substituted. This is not hosted signup, SMTP receipt, actual verification accuracy or physical-device proof. Tests run sequentially; the deletion case removes only an explicitly seeded test account. No production writes.

## Root menu order and recursive destinations

| Order | Control / linked controls | Backend / engine and finding | Evidence |
|---|---|---|---|
| 1 | Account → email, password, data export, deactivate, delete; audience and device links | `/api/account`, Auth email/password adapters; export includes communications; FB14 account deletion queues storage cleanup. Accessible native audience selectors; device persistence now reports storage refusal honestly. | Browser account, audience, device and destructive cases; actual provider send substituted. |
| 2 | Privacy & Safety → 4 privacy switches; Verification / Safety / Consent; Appeal; Terms / Privacy / Cookies | `/api/settings` persists owner-only privacy; verification data/consent routes handle withdrawal. Verification entry stays disabled on failed profile load. Appeal failed reads show error + Retry; non-suspended accounts cannot submit. | Browser privacy, safety, withdrawal, appeal and legal cases. No actual biometric submission. |
| 3 | Notifications → Likes / Messages / Matches + 3 activity-email switches | `/api/settings`, `/api/email/preferences`; in-app and email flags are independent; email defaults false. Feed failures remain errors, not empty-state camouflage. | Browser six switches/reload; SQL, worker and migration tests. |
| 4 | Discovery Preferences → age range, distance, gender, intention, interests/custom Add, Save | `/api/settings` → persisted owner preferences; `/api/profiles` honors preferences and bilateral privacy. Discovery screen/cards untouched. | Browser saves/reloads preferences; 31 real-handler/local-DB discovery checks plus privacy/filter contracts. Not every slider position enumerated. |
| 5 | Membership · coming later; Explore membership → plan selectors and legal links | Intentionally not purchasable: UI labels future plans and does not imply payment completion. No checkout invented. | Browser monthly/annual display selectors; no payment processor test. |
| 6 | Verification data & withdrawal → withdrawal confirmation/cancel/submit | Existing verification consent route and DB; local withdrawal removes evidence and badge. | Browser actual local withdrawal; Auth/Storage bridge substituted. No hosted storage-erasure claim. |
| 7 | Help & Support → message, optional reply-to, Send, ticket history/replies; operator inbox | `/api/support` atomically saves ticket + outbox; 10/hour durable quota; `/api/admin/support` allowlist and replies. `support@freeborndating.com` forwarding remains queued until configured and accepted. | Browser member submission/history/operator reply; integration authorization/quota/scheduler/webhook tests. Inbox receipt not proved. |
| 8 | About → Terms of Service / Privacy Policy / Cookie Policy; Back on each | In-app legal routes; Cookie Policy link corrected. Privacy adds retained story quotes, email provider/support processing and optional-email explanation. | Browser legal routes and Back; 320/1440 layout checks. |
| 9 | Log out | Supabase `auth.signOut`, redirects only after success; failure remains an error. | Browser with fixture Auth response; real hosted token/session revocation unverified. |

## Ordered browser outcomes (24 scenarios)

The root was traversed in order; destructive delete and logout were deferred so they could not invalidate the remaining audit. Tests separately enter safety/verification so a preceding step cannot hide a failure.

1. **PASSED** — Settings root: ordered menu, membership entry and four unchanged tabs
2. **PASSED** — Account: email accordion and submit invoke account handler; confirmation is provider-simulated
3. **PASSED** — Account: password accordion validates current password and sends update to auth adapter
4. **PASSED** — Account: download creates a real JSON export, including new support/preferences section
5. **PASSED** — Account: deactivate and delete confirmations can both be cancelled without deleting data
6. **PASSED** — Audience: each native choice persists; blocked-account Unblock invokes real SQL route
7. **PASSED** — Device: units and all three switches survive reload; motion reaches the frame
8. **PASSED** — Device storage refusal cannot produce a false saved confirmation
9. **PASSED** — Notifications: three in-app switches and three opt-in email switches persist independently
10. **PASSED** — Discovery preferences: intention, sliders, interests/custom interest and gender save actual SQL
11. **PASSED** — Membership: every plan selector works and availability cannot take payment
12. **PASSED** — Privacy: all four switches save and restore actual account boundaries
13. **PASSED** — Safety: all navigation destinations exist; verification entry opens consent modal without submitting identity media
14. **PASSED** — Verification data: keep/confirm withdrawal invoke the existing durable cleanup path
15. **PASSED** — Appeals: load error is explicit and Retry recovers; non-suspended submission is refused honestly
16. **PASSED** — Help: form creates a real local ticket/reference and reload shows persisted history
17. **PASSED** — Operator inbox: reply button persists a human response and member sees it after refresh
18. **PASSED** — About and every legal screen: links render full documents and Back returns correctly
19. **PASSED** — Welcome: completion notice appears once, guide links work and Start exploring marks it read
20. **PASSED** — Account: actual deactivate write hides only the test profile and preserves conversations
21. **PASSED** — Settings and Account logout controls both invoke signOut and leave the member area
22. **PASSED** — Delete forever: real local deletion removes only the test account, queues cleanup and shows pending not completed
23. **PASSED** — 320px settings, communications and legal layouts have no horizontal phone overflow
24. **PASSED** — 1440px settings, communications and legal layouts have no horizontal phone overflow

## Captured per-screen control inventory

Machine-readable evidence retains each visible control in DOM order, including label, tag, href and disabled state. This inventory is not a claim that every select permutation, external document link, arbitrary input boundary or external engine has exhaustive browser coverage.

### 01-settings — `/app/settings`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/profile |
| 2 | Account | /app/settings/account |
| 3 | Privacy & Safety | /app/privacy |
| 4 | Notifications | /app/settings/notifications |
| 5 | Discovery Preferences | /app/preferences |
| 6 | Membership · coming later | /app/premium |
| 7 | Explore membershipExplore the planned membership. Not available yet. | /app/premium |
| 8 | Verification data & withdrawal | /app/settings/verification |
| 9 | Help & Support | /app/settings/support |
| 10 | About | /app/settings/about |
| 11 | Log out | action / field |

### 02-account — `/app/settings/account`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Change email | action / field |
| 3 | email | action / field |
| 4 | Send confirmation | action / field |
| 5 | Change password | action / field |
| 6 | Request a password reset or setup link | /auth?mode=reset-password |
| 7 | password | action / field |
| 8 | password | action / field |
| 9 | Update password | action / field |
| 10 | Audience & blocked accounts | /app/settings/privacy |
| 11 | Device preferences | /app/settings/device |
| 12 | Help & Support | /app/settings/support |
| 13 | Download my data | action / field |
| 14 | Deactivate account | action / field |
| 15 | Delete my account permanently | action / field |
| 16 | Log out | action / field |
| 17 | Privacy Policy | /app/settings/legal/privacy |
| 18 | Terms | /app/settings/legal/terms |

### 03-audience — `/app/settings/privacy`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/privacy |
| 2 | Who can see you in Discover | action / field |
| 3 | Who can message you | action / field |

### 04-device — `/app/settings/device`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings/account |
| 2 | Distance units | action / field |
| 3 | sounds | action / field |
| 4 | animations | action / field |
| 5 | haptics | action / field |

### 05-notification-settings — `/app/settings/notifications`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Likes | action / field |
| 3 | Messages | action / field |
| 4 | Matches | action / field |
| 5 | Email matches | action / field |
| 6 | Email messages | action / field |
| 7 | Email likes | action / field |

### 06-discovery-preferences — `/app/preferences`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Something real | action / field |
| 3 | New friends | action / field |
| 4 | Not sure yet | action / field |
| 5 | Minimum age | action / field |
| 6 | Maximum age | action / field |
| 7 | Maximum distance | action / field |
| 8 | Hiking | action / field |
| 9 | Photography | action / field |
| 10 | Travel | action / field |
| 11 | Matcha | action / field |
| 12 | Ambient music | action / field |
| 13 | Yoga | action / field |
| 14 | Foodie | action / field |
| 15 | Art | action / field |
| 16 | Local audit interest | action / field |
| 17 | + Add more | action / field |
| 18 | Women | action / field |
| 19 | Men | action / field |
| 20 | Everyone | action / field |
| 21 | Save preferences | action / field |

### 07-membership — `/app/premium`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | 1 MonthNot live | action / field |
| 3 | Coming later3 MonthsNot live | action / field |
| 4 | 6 MonthsNot live | action / field |
| 5 | Check availability | action / field |

### 08-privacy-safety — `/app/privacy`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Safety centerBlock, report and review account protections. | /app/settings/safety |
| 3 | Show my distance | action / field |
| 4 | Show active status | action / field |
| 5 | Discoverable | action / field |
| 6 | Read receipts | action / field |
| 7 | Who can find & contact me | /app/settings/privacy |
| 8 | Story audience | /app/settings/stories |

### 09-safety-center — `/app/settings/safety`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/privacy |
| 2 | Identity verification | /app/verification |
| 3 | Verification data & consent | /app/settings/verification |
| 4 | Account appeals | /app/settings/appeal |
| 5 | Contact support | /app/settings/support |
| 6 | Privacy Policy | /app/settings/legal/privacy |

### 10-verification-entry — `/app/verification`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/profile |
| 2 | Start verification | action / field |
| 3 | Close verification | action / field |
| 4 | How your selfie is used | action / field |
| 5 | Read the full Privacy Policy | /app/settings/legal/privacy |
| 6 | Start the selfie check | action / field |
| 7 | Maybe later | action / field |

### 11-verification-consent — `/app/settings/verification`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Withdraw consent | action / field |
| 3 | Verification | /app/verification |
| 4 | Full privacy policy | /app/settings/legal/privacy |
| 5 | Get help | /app/settings/support |

### 12-appeals — `/app/settings/appeal`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings/safety |
| 2 | Your appeal | action / field |
| 3 | Submit appeal | action / field |

### 13-support — `/app/settings/support`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | What's going on? | action / field |
| 3 | email | action / field |
| 4 | Send message | disabled |
| 5 | How to use Freeborn | /app/settings/welcome |
| 6 | Email support directly | mailto:support@freeborndating.com |
| 7 | Refresh support history | action / field |

### 14-support-operator — `/app/settings/support/inbox`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings/support |
| 2 | Reply to a222de94 | action / field |

### 15-about — `/app/settings/about`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Terms | /app/settings/legal/terms |
| 3 | Privacy Policy | /app/settings/legal/privacy |
| 4 | Cookie Policy | /app/settings/legal/cookies |
| 5 | Safety center | /app/settings/safety |

### 16-terms — `/app/settings/legal/terms`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings/about |
| 2 | Privacy Policy | /app/settings/legal/privacy |
| 3 | Cookie Policy | /app/settings/legal/cookies |
| 4 | support@freeborndating.com | mailto:support@freeborndating.com |
| 5 | support@freeborndating.com | mailto:support@freeborndating.com |
| 6 | support@freeborndating.com | mailto:support@freeborndating.com |

### 17-privacy-policy — `/app/settings/legal/privacy`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings/about |
| 2 | support@freeborndating.com | mailto:support@freeborndating.com |
| 3 | support@freeborndating.com | mailto:support@freeborndating.com |
| 4 | /appeal | /app/settings/appeal |
| 5 | support@freeborndating.com | mailto:support@freeborndating.com |
| 6 | Cookie Policy | /app/settings/legal/cookies |
| 7 | support@freeborndating.com | mailto:support@freeborndating.com |
| 8 | support@freeborndating.com | mailto:support@freeborndating.com |

### 18-cookies — `/app/settings/legal/cookies`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings/about |
| 2 | support@freeborndating.com | mailto:support@freeborndating.com |
| 3 | Privacy Policy | /app/settings/legal/privacy |
| 4 | support@freeborndating.com | mailto:support@freeborndating.com |

### 19-welcome — `/app/settings/welcome`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Discovery Preferences | /app/preferences |
| 3 | Matches inside Notifications | /app/notifications?view=matches |
| 4 | Messages | /app/chat |
| 5 | privacy and safety | /app/privacy |
| 6 | ask for help | /app/settings/support |
| 7 | Start exploring | action / field |

### notification-settings-320 — `/app/settings/notifications`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Likes | action / field |
| 3 | Messages | action / field |
| 4 | Matches | action / field |
| 5 | Email matches | action / field |
| 6 | Email messages | action / field |
| 7 | Email likes | action / field |

### support-320 — `/app/settings/support`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | What's going on? | action / field |
| 3 | email | action / field |
| 4 | Send message | disabled |
| 5 | How to use Freeborn | /app/settings/welcome |
| 6 | Email support directly | mailto:support@freeborndating.com |
| 7 | Refresh support history | action / field |

### welcome-320 — `/app/settings/welcome`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Discovery Preferences | /app/preferences |
| 3 | Matches inside Notifications | /app/notifications?view=matches |
| 4 | Messages | /app/chat |
| 5 | privacy and safety | /app/privacy |
| 6 | ask for help | /app/settings/support |
| 7 | Start exploring | action / field |

### legal-320 — `/app/settings/legal/privacy`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings/about |
| 2 | support@freeborndating.com | mailto:support@freeborndating.com |
| 3 | support@freeborndating.com | mailto:support@freeborndating.com |
| 4 | /appeal | /app/settings/appeal |
| 5 | support@freeborndating.com | mailto:support@freeborndating.com |
| 6 | Cookie Policy | /app/settings/legal/cookies |
| 7 | support@freeborndating.com | mailto:support@freeborndating.com |
| 8 | support@freeborndating.com | mailto:support@freeborndating.com |

### notification-settings-1440 — `/app/settings/notifications`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Likes | action / field |
| 3 | Messages | action / field |
| 4 | Matches | action / field |
| 5 | Email matches | action / field |
| 6 | Email messages | action / field |
| 7 | Email likes | action / field |

### support-1440 — `/app/settings/support`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | What's going on? | action / field |
| 3 | email | action / field |
| 4 | Send message | disabled |
| 5 | How to use Freeborn | /app/settings/welcome |
| 6 | Email support directly | mailto:support@freeborndating.com |
| 7 | Refresh support history | action / field |

### welcome-1440 — `/app/settings/welcome`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings |
| 2 | Discovery Preferences | /app/preferences |
| 3 | Matches inside Notifications | /app/notifications?view=matches |
| 4 | Messages | /app/chat |
| 5 | privacy and safety | /app/privacy |
| 6 | ask for help | /app/settings/support |
| 7 | Start exploring | action / field |

### legal-1440 — `/app/settings/legal/privacy`

| # | Control | Destination |
|---|---|---|
| 1 | Back | /app/settings/about |
| 2 | support@freeborndating.com | mailto:support@freeborndating.com |
| 3 | support@freeborndating.com | mailto:support@freeborndating.com |
| 4 | /appeal | /app/settings/appeal |
| 5 | support@freeborndating.com | mailto:support@freeborndating.com |
| 6 | Cookie Policy | /app/settings/legal/cookies |
| 7 | support@freeborndating.com | mailto:support@freeborndating.com |
| 8 | support@freeborndating.com | mailto:support@freeborndating.com |

## Important outstanding checks

- Existing hosted test URL, two controlled inboxes, and approved access are still needed. No new Supabase branch was created.
- Actual Google OAuth/signup/confirmation/recovery/email-change, live SMTP receipt, hosted RLS/realtime and verification provider behavior are not established locally.
- Local Delete forever correctly says cleanup pending; queued jobs are not proof that every Storage object was erased.
- Full clean replay is blocked by the protected runner’s requirement for an explicitly acknowledged empty nonproduction hosted project with verified TLS. No production workaround or weakened guard was used.
- Local additive migration execution and manifest/hash verification passed; those are narrower claims.
