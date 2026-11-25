# Freeborn email and notification lifecycle

## How many emails should a new member receive?

These are the **intended configured flows**, not observed inbox deliveries. The authentication method matters; a Gmail address alone does not mean Google OAuth.

| Path | Signup confirmation | After final onboarding Continue | Normal initial total |
|---|---:|---:|---:|
| Continue with Google (OAuth) | 0 Freeborn confirmation emails | 1 welcome email + 1 durable in-app welcome | **1 email** |
| Email/password, including `@gmail.com`, with Confirm email enabled | 1 requested confirmation/OTP email | 1 welcome email + 1 durable in-app welcome | **2 emails** |
| Email/password with Confirm email disabled | 0 | 1 welcome email + 1 durable in-app welcome | **1 email**, but not the recommended verified-email signup configuration |
| Signup started, onboarding not completed | Conditional confirmation only | 0 welcomes | 0 or 1 |
| Existing member signs in again or retries final Continue | No automatic confirmation or new welcome | 0 additional welcomes | **0 automatic emails** |

Google may send its own account/security messages independently; they are not Freeborn's signup emails. Resending a requested code can add messages. Linking an identity, changing credentials or requesting recovery also creates separate events. Consequently there is no honest fixed lifetime email count.

The welcome is emitted by the first `onboarding_completed_at` null→non-null transition, with a unique event key. Completion retry does not reset account visibility, re-complete onboarding or send another welcome. Historical completed profiles are not backfilled. Final onboarding navigation opens `/app/settings/welcome`; Start exploring marks the notice read and leads to Discover. Directions cover saved preferences, mutual matches, Messages/calls, Stories, privacy/support and money-scam safety.

**Default activity emails: OFF for both signup methods.** Google sign-in is not consent to activity mail. In-app match/message/like preferences are independent of email switches. Welcome, requested support and account-status/security messages are separate from optional activity alerts. No marketing drip, inactive-member chase, birthday mail or repeated daily welcome was introduced.

## Implemented application event families

**9 queued event kinds:** 8 member-facing kinds and 1 support-owner forwarding kind. Five member-facing kinds are service/status messages and three are optional activity messages.

| Event | Recipient / count | In-app | Timing and safeguards |
|---|---|---|---|
| `welcome` | Member: at most 1/account | Durable notice + directions page | First successful onboarding completion; verified recipient only |
| `match` | Each participant: at most 1/new active match | Existing match feed, real Matches section | Opt-in; rechecks active match and bilateral blocks before send |
| `message` | Recipient: at most 1/conversation/UTC hour | Existing unread conversation, not fabricated match unread | Opt-in; 10-minute delay, rechecks referenced message unread and match active. Coalescing anchors to the first event; not a complete unread-message digest |
| `like` | Recipient: at most 1/UTC day | Existing Likes notification | Opt-in; 1-hour delay; current like, active actor and bilateral block check. Coalescing is a nudge, not a complete daily digest |
| `verification` | Member: 1/distinct approved/rejected decision event | Durable status notice | Does not claim provider accuracy, badge safety or pending checks completed |
| `appeal` | Resolved member: 1/distinct status/verdict event | Durable status notice | Only when verdict exists and an associated profile can be resolved |
| `support_ack` | Member: 1/saved ticket | Ticket history | Reference and saved status; no promised response time |
| `support_reply` | Member: 1/operator reply | Durable notice + ticket thread | Allowlisted operator reply; private reply text stays in signed-in history |
| `support_ticket` | `support@freeborndating.com`: 1/saved ticket | Restricted operator inbox | Includes request and supplied reply-to; forwarding acceptance/receipt tracked separately |

Email subjects and bodies for activity/status updates avoid private message text and profile details. Support forwarding necessarily contains the submitted request and may contain sensitive text: the form now warns against passwords/sign-in codes. No provider tracking of opens or reads is implemented.

## Supabase-owned Auth mail (not duplicated by the application worker)

Nine reviewed templates are included under `supabase/email-templates/`:

1. Signup confirmation: OTP `.Token` to match the existing signup verification screen.
2. Requested magic-link/OTP sign-in: `.Token`.
3. Requested password recovery: `.ConfirmationURL`.
4. Requested email change: `.ConfirmationURL`; secure change may involve both old/new addresses depending on hosted settings.
5. Requested reauthentication: `.Token`.
6. Password-changed security notification.
7. Email-changed security notification.
8. Sign-in identity-linked security notification.
9. Sign-in identity-unlinked security notification.

Four security notification enable flags accompany the templates. **This file is a reviewed configuration payload, not proof of remote application.** Hosted Confirm email, secure email change, SMTP, redirect allowlist and all security flags remain to be inspected in the approved test environment. Initial Google identity creation versus later identity linking must be checked there; do not assume a linked-identity notification is a mandatory initial signup email.

Invites, phone-change and MFA-factor notifications are not newly enabled: there is no corresponding newly implemented member journey here. If those journeys are introduced, review their templates and security notifications then. Confirmation email is conditional on Confirm email. Reset/change confirmation links are deliberately not replaced with code-only bodies.

## Reliability and delivery semantics

- Durable SQL outbox is committed with the originating event; queue insertion failure is not silently reported as successful delivery.
- Worker claims use `FOR UPDATE SKIP LOCKED`, max 8 attempts, 5-minute retry/recovery and a 20-hour retry cutoff (inside Resend's 24-hour idempotency window).
- Sending key: `freeborn:<outbox UUID>`. HTTP acceptance stores provider ID; it is **not delivery**.
- Signed Svix webhook validates the exact raw body before parsing. Replays/out-of-order events are handled monotonically; bounce/complaint are sticky and suppress future member sends.
- Queue states and delivery states are distinct. `accepted` means API acceptance; `delivered` means recipient server acceptance, not inbox placement, reading or human support review.
- No configured sender means worker returns 503/configured=false; tickets still remain durably queued. Stale uncertain sends are failed rather than blindly resent outside deduplication protection. An operator must investigate; no automatic replay that can duplicate a message.
- Optional mail contains visible unsubscribe text, List-Unsubscribe and List-Unsubscribe-Post headers. GET opens a confirmation form so scanners do not change preferences; POST stops all three activity types without sign-in. It does not disable essential account/requested support messages.

## Research sources and decisions

- [Supabase Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates): authentication vs optional project-enabled security notifications; confirmation conditional on Confirm email; supported token/link/provider template variables.
- [Google sender guidelines](https://support.google.com/mail/answer/81126?hl=en): all senders need SPF or DKIM, PTR/TLS and low spam rates; recommend SPF+DKIM+DMARC. Bulk senders (>5,000/day to personal Gmail) additionally need both SPF and DKIM, DMARC/alignment and one-click unsubscribe for subscribed/marketing mail. Do not impersonate a Gmail From address.
- [Google sender FAQ](https://support.google.com/mail/answer/14229414?hl=en): subscribed/marketing unsubscribe and requested transactional mail are distinct; honor one-click unsubscribe within 48 hours. This implementation updates preferences immediately on successful POST.
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys): 24-hour retention and maximum 256-character keys; motivates bounded 20-hour application retry window.
- [Resend webhook event meanings](https://resend.com/docs/webhooks/event-types): acceptance, delivery, bounce and complaint are not interchangeable evidence.

## Public DNS observation — not delivery evidence

A read-only DNS lookup found two MX records and existing SPF/DMARC records for `freeborndating.com`. This establishes neither `support@freeborndating.com` mailbox existence nor a verified Resend sender, correct DKIM alignment or receipt. Do not replace the existing SPF with another SPF record; combine authorized senders or use the provider-approved sending subdomain. Obtain provider-specific DKIM selectors before checking them. No DNS was changed.
