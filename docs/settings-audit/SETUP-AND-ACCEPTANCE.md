# Configuration and acceptance runbook — not production authorization

## Current boundary

Code, reviewed Auth templates and actual additive SQL are implemented locally. Local tests use explicit fixture identities and local SQL. They do not establish hosted signup/RLS, live emails, real support mailbox receipt or physical calls. The owner selected the **existing test environment**; its URL/control inboxes are still needed. Do not create a new hosted branch or use production as a substitute. No production settings, DNS, mail, migration, merge or deployment has been changed.

## Approved isolated environment setup (pending access/approval)

1. Identify the existing nonproduction Supabase project and Vercel preview and verify separation from production. Confirm whether pushing the review branch creates a preview; no production promotion is authorized. Keep credentials in protected server environment variables, never commit them.
2. Compare migration history and run the reviewed preflight queries. Back up and rehearse restoration. In a genuinely empty, explicitly approved nonproduction project, use the protected `db:clean-replay` runner with verified CA/TLS, exact project acknowledgment and `--reset`. It refuses the known production project and any Auth users or Storage objects. Do not weaken those guards to get a green result.
3. Apply additive SQL only after explicit database authorization: notification-dismissal migration first if missing, then Stories/calls/chat and communications migrations in manifest order. `src/db/schema.ts` mirrors columns; SQL is authoritative for triggers, grants, Auth relationships and RLS. **Never `drizzle push` into hosted Auth to reconcile local fixture relationships.**
4. Verify all new tables have enabled+forced RLS and zero browser-role access, and checked server handlers run under least-privilege `freeborn_runtime`, not a bypass/service database login. Verify the restricted verified-recipient helper and operator allowlist. Application ownership checks remain required even with server RLS grants.
5. Verify/create the actual support mailbox `support@freeborndating.com` with its owner. The operator inbox route is `/app/settings/support/inbox`; restrict `FREEBORN_ADMIN_EMAILS` to approved operator addresses. Do not add ordinary test members unless explicitly testing operator permissions, and remove temporary test operators afterward.
6. Configure Resend using a verified sending domain/subdomain. Set server-only `RESEND_API_KEY`, `FREEBORN_EMAIL_FROM` (plain verified address), and `RESEND_WEBHOOK_SECRET`. Confirm provider region, retention and agreement before making stronger privacy claims. COLDTRUTHS TECHNOLOGIES is an unregistered solo startup; do not claim incorporated-company verification or a signed DPA.
7. Preserve existing mail DNS; verify SPF/DKIM/DMARC alignment and TLS. Do not add multiple SPF records or use a personal Gmail From identity. Public MX records do not demonstrate mailbox existence or sender authorization.
8. Configure a secret of at least 24 random characters in `CRON_SECRET`. An external scheduler calls GET or POST `/api/internal/email-dispatch` with `Authorization: Bearer <secret>` over HTTPS. Recommended interval: once/minute for a small initial deployment, monitor backlog; each invocation processes at most 5 jobs, so capacity must be reviewed as traffic grows. No actual scheduler is provisioned by this branch. Do not put the secret in the URL.
9. Configure the Resend webhook to HTTPS `/api/email/webhook` for the handled sent/delivered/bounced/complained/failed events. Copy the signing secret, not the API key. Test valid signed payloads, invalid signatures, duplicates and out-of-order events in isolation. Never treat the test signing secret as live configuration.
10. Auth mail remains Supabase SMTP-owned and separate from the application worker. Review current Auth configuration before applying `supabase/email-templates/reviewed-auth-config.json`; do not overwrite SMTP secrets or unrelated settings. Set correct Site URL, preview/prod redirect allowlists, Confirm email and custom SMTP. Review the 9 template types and 4 security flags; exercise actual OTP, recovery and email-change screens before approving. No remote template update was executed here.
11. Schedule existing restricted story-expiry cleanup separately and monitor it. Read-time expiry is enforced, but physical purge is a separate operation. Do not expire retained private story quotes as though they were originals. Keep FB14 storage-erasure retries and FB15 retention monitoring enabled; queued deletion is not completed deletion.

## Real acceptance still required

Use two owner-controlled test inboxes in the approved isolated environment, with profiles excluded from Discovery before completing setup. Do not contact or match real members.

- Google OAuth signup → final onboarding Continue → welcome directions and exactly one welcome, no duplicate on retry/sign-in. Collect redacted inbox headers/provider IDs without storing access tokens or OTPs.
- Email/password signup (including a Gmail address) → actual confirmation OTP → onboarding → welcome. Confirm initial count 2 with Confirm email on; test duplicate-account login guidance, password recovery, password-change/security and email-change notices.
- Confirm activity emails start off. Opt in individually, trigger only test-account match/message/like events, check delays/coalescing and suppression after read/block/unmatch. Unsubscribe via GET confirmation and provider one-click POST; confirm it changes only optional flags.
- Submit support, record durable ticket ID and queued/accepted/delivered stages. Verify the actual support mailbox receives the request; reply via operator inbox and check member history + notification/mail. Test unauthorized operator access and separate member ownership.
- Validate delivery webhook receipt and suppression using provider-supported test recipients, not by generating spam complaints against real inboxes. Verify queue backlog/failed/expired jobs alert the operator. No monitoring service is provisioned yet.
- Repeat every Settings root and linked-page action from `ORDERED-LEDGER.md` under real Auth and hosted roles; include failures/retry, export, withdraw consent, deactivate and delete ONLY these isolated test accounts. Confirm actual Storage jobs finish before claiming erased.
- Walk Stories/audiences/viewers/private exact-image replies, original expiry/deletion, block/unmatch revocation, Messages pencil persistence and Matches inside Notifications. Test two physical devices for voice/video/end attribution/front-back switching/TURN; fixture camera tests cannot replace this.
- Verify four tabs, untouched Discovery/card presentation, native selects and 320px/mobile layout. Do not redesign Discovery during backend testing.

## Reproduce local checks

Use Node 24, PostgreSQL and installed dependencies. Exact disposable DB names/loopback guards are deliberate.

1. `npm run test:settings-prepare` destructively resets ONLY loopback `member_experience_test`, generates a baseline and applies actual feature/FB14 SQL. It uses local Auth/Storage mirrors and is not a clean hosted migration-chain replay.
2. Run sequentially: `npm run test:member-experience` then `npm run test:settings-audit`. They mutate/reseed the shared disposable database.
3. Clone that local database into `member_migration_test` and `notification_migration_test`; run `npm run test:member-migration` and `npm run test:notification-migration`. Each script hardcodes its own disposable clone. These measure actual additive migration effects, preservation and role denials; they are NOT full baseline replay.
4. Build with `NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.co` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture-anon`, then `node scripts/settings-audit/run-browser.mjs` (port 3000 must be free). It starts/stops a local production server and runs member browser acceptance followed by Settings acceptance. Playwright Chromium must be installed. Fixtures substitute hosted Auth/provider/ancillary feeds explicitly.
5. `npm run typecheck`, `npm run lint`, `npm run test:harness`, `npm run test:prototype-api`, discovery/privacy/filter/presentation, notification-receipt and chat-media contracts, `npm run check:env`, `npm run check:migrations`, `npm run check:secrets`, `npm audit --omit=dev --audit-level=moderate`.
6. CI adds an isolated communications job with the same fixture preparation, SQL/migration checks and browser evidence uploads. CI execution on GitHub is not yet observed; local orchestration needs port 3000 free. Existing main CI protections remain intact.

Evidence defaults to ignored `scripts/{member-experience,settings-audit}/.evidence/`. Override `FREEBORN_MEMBER_EVIDENCE_DIR` / `FREEBORN_SETTINGS_EVIDENCE_DIR`. Never commit actual inbox content, credentials, exported member data or production screenshots as test fixtures.

## Rollback and operations

Before any separately authorized rollout: rehearse app rollback with additive tables retained; do not automatically drop member messages, support history or retained quotes. Disable the scheduler/new feature entry points through a reviewed change if needed. Investigate failed jobs and delivery suppression; do not blindly resend expired/uncertain jobs. Review support mailbox data retention and provider logs independently from application account deletion. Deployment, production DB writes and merge remain explicit owner decisions, not implied by a GitHub branch push.
