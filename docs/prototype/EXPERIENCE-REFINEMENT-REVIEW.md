# Experience refinement review

Scope: local refinement on `feat/prototype-to-production`, continuing draft PR #90. No deployment, merge, hosted database mutation or hosted acceptance is represented by this report.

## Implemented

- Onboarding Continue controls occupy the usable width and remain centered across all seven steps.
- Chat uses the reference-style attachment sheet, image/video staging and viewer, explicit record → stop → listen → send voice sheet, and a separate microphone button. Failed uploads retain the draft. Closing a recorder does not send it. Message actions/reactions use the new chrome.
- Discovery photos open the new photo viewer; chat member identity opens the member profile. Profile actions wire report, block and confirmed unmatch.
- Notifications use the reference list/category pattern and honor preferences. Failed clears preserve the feed and show an error; blocked members and inactive-match events are excluded by the production handler.
- Shared language, religion, work, education and other catalogs expanded. Existing values remain selectable. Edit-profile saves show a visible Saved indicator before returning; failed saves preserve fields and stay on the page.
- Discovery filters pass actual criteria into the production handler, including work and education. Originless distance searches do not invent distances; audience/visibility, blocking and other privacy restrictions are enforced in the query/handler path.
- Landing and policy copy revised for the current service, including moderation evidence, optional profile details and actual availability. This is not legal certification.

## Evidence

`evidence/experience-refinement/` contains machine-readable browser results, screenshots and logs.

- General browser suite: 44 checks passed; 74 captures; zero browser errors. Includes work/education filter persistence, saved-return behavior, failed saves, notification failure recovery and safety action payloads.
- Chat/verification browser suite: 26 checks passed; 40 captures; zero browser errors.
- Trust/regression harness: 624/624 assertions passed.
- Media contracts: 26 passed.
- API contracts: 28 passed, including real edit-profile/onboarding handler imports with substituted adapters.
- Discovery/privacy adapter contracts: 27 passed.
- Production handlers against local PostgreSQL: 29 passed, transaction rolled back. Covers actual filter queries, privacy, notification switches, block/unblock, unmatch evidence retention, and durable reports during a controlled triage-engine outage.
- Lint, TypeScript, migration checks, production build and secret scan passed. Route audit reached 87 source files and none of seven banned legacy views, including the old voice-note and photo-lightbox modules.
- Visual comparison: 37 reference pairs, none missing, zero pixel-identical. Pixel difference is not a layout acceptance score.

Setup/media browser suite: 34 checks passed; 64 captures; zero browser errors. The strengthened test records actual fake-device microphone bytes, authorizes upload and retrieval, starts playback, observes advancing playback time, pauses, and verifies 1.5× playback speed. This caught and fixed bubble pointer capture stealing player taps; the final rerun passed at both widths.

## Honest limits and remaining acceptance

This is **not a claim of exact reproduction**. The reference-comparison report documents remaining differences: real/sparse data, honest unavailable states, discovery/profile crop and control spacing, and the separately requested microphone control. New media screens extend a reference that did not specify every production state.

Browser tests intercept APIs and use fake camera/microphone devices and a loopback realtime fixture. Generated video and microphone recording are real browser media bytes, but this does not prove physical-device behavior, biometric quality, inbox delivery, provider OAuth acceptance, antivirus scanning, push delivery, hosted RLS or hosted storage permissions. The local database harness substitutes authentication, suppressed-ID lookup, realtime delivery and the controlled moderation outage.

Document attachments require the existing migration `supabase/migrations/20261121220000_chat_document_attachments.sql` on the hosted database; it has not been applied remotely here. Existing hosted chat-media constraints previously admitted only image/video/voice. Browser notification feed verification is not OS push-delivery verification.

No previously supplied credential was reused. These changes are local until explicitly pushed to the existing draft PR. No production deployment was made.
