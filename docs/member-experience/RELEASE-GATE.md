# Member experience — implementation and release gate

**Status: implemented locally; NOT approved for production.**

Branch: `feat/member-stories-calls-chat`

Base: `8e7dea489d996e66b54598fd6561efc04f678c7c`

No merge, production deployment, production migration, hosted signup, verification bypass, or real-member interaction was performed for this work. Git transfer status is tracked separately in `docs/settings-audit/GIT-HANDOVER.md`. Local fixtures are not hosted acceptance accounts.

## Implemented

- Conversation-header handset and video actions reuse existing calling flows. Durable call-end actor prevents a peer's abort being described as your action; closing a finished overlay cannot overwrite that actor. Camera switching replaces the outgoing video track and preserves the old stream on failure. Accessible mirror explanation distinguishes local preview from the outgoing camera.
- Stories in Messages, without a fifth bottom tab: active-match-only access, bilateral blocks/unmatch enforcement, all/exclude/only audience modes, multiple images, segmented previous/next viewing, per-story viewers, private replies with the exact original picture. Originals expire after 24 hours. Disclosed private image quotes survive expiry/deletion and remain subject to private conversation access controls. Upload receipts retain daily-limit accounting after deletion.
- Matches inside Notifications; legacy `/app/matches` redirects there. Clearing alerts does not remove matches. A new match is not presented as an unread chat message.
- Messages pencil manages private nickname, pin, archive/hide and conversation folders. These are per-member preferences, not changes to the peer's account or their messages.
- Notifications failures remain real error states, with a request identifier; they are not disguised as an empty inbox.

Discovery screen/cards and the four-tab frame were preserved. Existing discovery backend preference/privacy contracts were rerun; no hosted discovery acceptance claim is made.

## Evidence and its limits

| Check | Result | What this proves |
| --- | --- | --- |
| Trust harness | 624/624 pass | Existing repository contract suite; raw-button ceiling preserved rather than relaxed |
| New route/SQL integration | 28 pass | Real feature handlers with local PostgreSQL; auth/notice adapters substituted |
| Interactive browser | 13 pass | Two fixture browser contexts navigate production-built UI and real feature handlers bridged to local SQL |
| Feature migration | 7 pass | Actual additive SQL executes in a disposable local PostgreSQL clone; existing message count preserved; measured catalog delta; forced RLS and denied browser-role access/purge invocation |
| Full ESLint, typecheck, production build | Pass | Local static/build validation with fixture Supabase build environment |
| Migration manifest check | Pass | 56 registered steps; historical migration files not edited |

Screenshots were reviewed for story viewing, exact-image chat replies, Matches and privacy layouts. Browser layout checks cover 320px and 1440px. Fake camera input does **not** establish real-device media quality, physical front/back switching, TURN connectivity or realtime reliability.

Local evidence is under `/home/user/freeborn-audit/member-experience/`; execution logs are under `/home/user/freeborn-audit/core-readiness/`. Evidence files explicitly identify substituted auth. These absolute workspace paths are evidence locations, not application dependencies.

### Notifications diagnosis

Read-only metadata found `notification_preferences.dismissed_before` absent in the inspected hosted database while the application selects that mapped column. A local reproduction raises PostgreSQL `42703`, returns a non-empty-error HTTP failure with request ID, and recovers after the column is restored. This is a concrete schema mismatch consistent with the reported failure, **not an authenticated production trace proving the sole cause**.

Existing migration `supabase/migrations/20261121210000_notification_dismissal.sql` adds that column. It was not applied to production by this work.

### Database caveats

The additive feature migration is `supabase/migrations/20261121230000_member_stories_calls_chat.sql`. Measured local additions: 6 tables, 32 columns, 9 indexes, 7 check constraints. Including the subsequent communications migration, manifest expectations are 54 tables / 517 columns / 147 indexes / 95 checks. A complete clean-start replay on hosted Supabase remains unverified; these checks are not a replacement for it.

The local baseline mirror uses an accounts relationship where the hosted database uses `auth.users`; never use `drizzle push` against production to reconcile it. New feature tables have enabled and forced RLS with no direct anon/authenticated grants; access is through checked server handlers. This was tested locally, not through hosted Supabase roles/JWTs. The expiry purge function exists and was exercised locally; a restricted scheduled invocation and monitoring are still required. Application reads enforce expiry even before physical cleanup.

## Remaining release blockers

1. Obtain the URL/access for the owner-selected existing isolated test environment and its preview deployment; do not create a new branch without approval. Do not silently reuse/migrate production. Resolve the hosted migration-state warning and replay the complete migration chain in isolation.
2. Run `scripts/member-experience/preflight.sql`, verify least-privilege runtime grants and hosted RLS, and configure restricted expiry cleanup plus monitoring.
3. Create two owner-controlled test accounts using approved email addresses; perform actual signup and confirmation. A read-only count found zero profiles with an obvious QA/test/walkthrough/acceptance/preview name prefix, but this does not prove that no safe test accounts exist. Do not inspect arbitrary members to find credentials or bypass verification.
4. Keep both accounts out of Discovery before completing profiles or matching them. Arrange their test-only match using the approved isolated environment, never a real member.
5. Complete a real authenticated walkthrough: Notifications/Matches/chat, private management persistence, all three story audiences, exact-image reply and viewer list, expiry, block and unmatch revocation, error recovery and mobile usability.
6. Test voice and video on two physical devices: caller abort before acceptance, recipient decline, either peer ends live call, disconnected/reconnected signalling, microphone/speaker, front/back switching and mirror explanation. Check restrictive-network TURN behavior and existing working call/match flows.
7. Review the migration order, cleanup schedule, privacy disclosures and rollback plan; obtain explicit approval before any merge, production migration or promotion.

## Reproducing local checks

Use Node 24 and installed dependencies. The integration/browser harness refuses remote database hosts and requires the explicitly named disposable `member_experience_test` database. The migration harness drops/recreates **feature data only in its hard-coded loopback `member_migration_test` database**; never adapt it to production.

1. Prepare the disposable local baseline and actual feature SQL with `npm run test:settings-prepare` (review the exact-loopback destructive fixture guard first).
2. Create separate disposable local clones named `member_migration_test` and `notification_migration_test` from the prepared database.
3. Run `npm run test:member-experience` and `npm run test:member-migration` sequentially.
4. Build/start a local production server on port 3000 with fixture Supabase URL `https://fixture.supabase.co` and fixture anon key, then run `npm run test:member-experience-ui`.
5. Run `npm run typecheck`, `npm run lint`, `npm run test:harness`, `npm run check:migrations`, and the existing discovery/privacy, notification-receipt and chat-media contracts.

Generated results default to ignored `scripts/member-experience/.evidence/`. Override `FREEBORN_MEMBER_EVIDENCE_DIR` to retain them elsewhere. Tests mutate their disposable databases; do not run them concurrently against the same database. They do not test real signup, confirmation or hosted auth.

## Rollback principles

Before any approved rollout, back up and verify restoration in isolation. Prefer rolling application code back while retaining additive tables and existing messages. Do not automatically drop feature tables or retained private quotes. Disable new posting via reviewed rollout controls if needed; never destroy member data as an emergency UI rollback. A production runbook and explicit migration approval remain mandatory.
