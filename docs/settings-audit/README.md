# Settings, welcome, email and support — review checkpoint

**Implemented and reverified locally. Not production-ready or hosted-accepted.**

## Delivered

- Final onboarding Continue opens a first-completion welcome with practical directions; one durable notice and one queued welcome email, not repeated on retry/sign-in.
- Service/status emails, opt-in activity emails, durable outbox/worker, signed delivery webhooks, bounce/complaint suppression and unsubscribe. Google OAuth does not auto-subscribe members to activity mail.
- Help & Support saves tickets and queues forwarding to **support@freeborndating.com**; member history, allowlisted operator inbox and private replies are wired. Queued is not sent, accepted is not delivered, delivered is not human review.
- Ordered Settings audit through linked account, privacy/safety, preferences, membership information, verification/withdrawal, support, About/legal and logout paths. Accessible native-select labels, honest local-storage failures, appeal Retry, verification load guard and cookie link fixed.
- Story-quote retention and email/support provider processing disclosed. Existing calls/matches retained; Discovery component/cards and four-tab frame unchanged.
- Nine reviewed Supabase Auth email templates and four security-notification flags, saved but **not applied remotely**.

## Latest local results

| Check | Result |
|---|---:|
| Settings browser scenarios | 24 PASS |
| Member Stories/calls/chat browser scenarios | 13 PASS |
| Combined CI browser orchestration | 37 PASS |
| Communications production-handler / local SQL integration | 45 PASS |
| Member-feature production-handler / local SQL integration | 28 PASS |
| Discovery real-handler / local SQL regressions | 31 PASS |
| Stories/calls/chat actual additive migration | 7 PASS |
| Communications actual additive migration | 7 PASS |
| Existing trust harness | 624/624 PASS |
| Updated substituted API contracts | 29 PASS |
| Full typecheck / lint / production build | PASS |
| Runtime dependency audit | 0 vulnerabilities reported |
| Environment isolation / migration manifest / secret scan | PASS |
| Existing discovery/privacy/filter/presentation, notification receipts, media, engine/TLS/TURN, evidence safety, Bing metadata and submission contracts | PASS locally |

The browser result uses real local SQL/handlers but fixture Auth/provider/ancillary resources. Fake media is not physical voice/video acceptance. The new GitHub CI job was validated locally, not observed running remotely. The production build uses public fixture configuration, not a deployed application.

Migration static manifest: **56 steps; 54 tables, 517 columns, 147 indexes, 95 checks**. Communications measured delta: 4 tables / 36 columns / 8 indexes / 6 checks. **Full clean-chain hosted replay remains unrun.** Actual additive migration execution is narrower than that. Local account deletion removed only the seeded test identity and queued cleanup; it did not prove physical hosted Storage erasure.

## Read next

1. [Ordered control/backend ledger](ORDERED-LEDGER.md) — scenario outcomes and captured per-screen DOM-order controls, including explicit coverage boundaries.
2. [Email lifecycle and counts](EMAIL-LIFECYCLE.md) — normal initial total: **1 email with Google OAuth; 2 with email/password plus Confirm email**, conditional on configuration and successful delivery. Eight member-facing application event families plus support forwarding; nine Auth template types.
3. [Setup and real acceptance](SETUP-AND-ACCEPTANCE.md) — provider/domain/scheduler/webhook/Auth setup, exact disposable local reproduction, remaining release checks and rollback constraints.
4. [Git handover](GIT-HANDOVER.md) — authentication blocker and transfer boundary.
5. [Saved-plan re-verification](PLAN-REVERIFICATION.md) — completed versus partly tested versus future work.
6. [Evidence index](LOCAL-EVIDENCE-INDEX.json) — scenario results and SHA-256 manifest for local artifacts. Full synthetic screenshots/results/logs live in `/home/user/freeborn-audit/{settings-audit,member-experience,core-readiness}/`; not a hosted walkthrough.

## Still blocked / not claimed

- GitHub transfer/CI: consult the current GitHub branch and check results; local evidence cannot itself prove a successful push or remotely passing CI. No merge is authorized.
- Existing isolated test URL/access and two controlled inboxes absent; no actual Google/email signup or confirmation walkthrough.
- Resend sender, DKIM/alignment, API/signing credentials, Auth SMTP/templates and scheduler are not configured by this work. Actual support inbox receipt and real welcome/activity delivery are unproved.
- Hosted full clean replay, hosted RLS/realtime, provider verification behavior and two-physical-device calls remain required.
- No new Supabase branch, production writes/migration, merge, deployment or indexing submissions were performed.
