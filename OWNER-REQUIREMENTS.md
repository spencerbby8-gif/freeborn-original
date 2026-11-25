# Member experience work — owner requirements and findings

## Scope requested
- Existing matches, voice calls and video calls reportedly work. Preserve them.
- Fix call-end copy so a remote abort is never attributed to the member who did not abort.
- Explain local video mirror control with an accessible tip. Add front/rear camera switching with real track replacement and graceful unsupported-device handling.
- Surface actual voice/video call icons at the top right of the conversation header beside peer identity; wire to existing call flows.
- Stories visible only to active matches, honoring block/unmatch and story visibility preferences. Audience modes: all eligible matches, exclude selected, only selected. Multiple posts per author, segmented viewing, author viewer list, reply/quote identifying the exact story image, 24-hour expiration. Design consistent with Freeborn; no fifth bottom tab.
- Notifications screenshot shows a load failure; diagnose real backend error, not hide it as empty feed.
- Confirmed by owner: Matches inside Notifications, with click-through to real conversation; preserve direct chat entry and distinguish new-match alerts from unread messages.
- Pencil in Messages should manage conversations, not ambiguously open Matches. Requested private nicknames, hiding/archive, and other justified management actions. Do not rename the other person's actual account or delete the peer's chat.
- Live controlled-account walkthrough: sign up, navigate and click actual controls, evaluate usability and improve problems. Do not substitute screenshots or mocked tests for authenticated hosted verification. Do not contact real members.
- Discovery backend must respect member discovery settings and other users' privacy. DO NOT EDIT DISCOVERY SCREEN OR DISCOVERY CARDS. Preserve four bottom tabs.
- Existing Common Ground → Real Plans proposal remains preserved verbatim at docs/product/COMMON-GROUND-REAL-PLANS-EXACT.md (workspace original: /home/user/freeborn-product-vision-exact.md); this immediate work strengthens its prerequisites.
- No production merge, deployment, database migration or promotion without explicit approval.

## Initial evidence (read-only)
Fresh public clone at /home/user/freeborn-member-experience; main commit 8e7dea489d996e66b54598fd6561efc04f678c7c (PR95). Previous clone lost tracked application files in snapshot; do not use that incomplete source for edits.

Production Supabase metadata query inspected only table/column names, not member content. `public.notification_preferences` has user_id, match_alerts, message_alerts, like_alerts, profile_activity, created_at, updated_at — no dismissed_before. Current schema.ts maps dismissedBefore to dismissed_before and GET /api/notifications does an unrestricted .select() from this table. This is a concrete schema mismatch that would cause undefined-column 42703 when reaching that query, consistent with the screenshot's error. Raw failing authenticated HTTP request / server log not yet captured, so do not claim this is the only possible cause.

Existing unapplied migration: supabase/migrations/20261121210000_notification_dismissal.sql adds nullable dismissed_before timestamptz. No production migration applied by this assistant. Inspect preview migration state and replay safely before requesting production approval.

No story-specific table appeared in the metadata name search. Stories are new work, not just UI activation.

Call code already attempts local/remote attribution. Investigate actual state/signal ordering rather than merely replacing a label: call-overlay.tsx endCall is local, handleSignal(hangup) is remote; server call session has ended_at but no ended_by in inspected columns. Loss of broadcast / polling paths require evidence and tests.

## Decisions and remaining approval
1. Confirmed: Matches inside Notifications.
2. Confirmed: retain exact quoted story images in private chat after expiry, with disclosure.
3. Still needed: approved isolated hosted test environment and controlled email accounts for real signup/email confirmation; never invent ownership of an email address or skip verification in production.

## Current status
Local implementation and test status are documented in docs/member-experience/RELEASE-GATE.md. No production write, real Supabase signup, merge, submission or deployment performed.
