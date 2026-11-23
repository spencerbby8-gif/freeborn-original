# Post-merge discovery, chat, settings and call presentation review

## Publication boundary

Based on `main` at `bba01dc`, the confirmed merge of PR90. New branch: `feat/discovery-settings-polish`. This is a local implementation/test review, not evidence of a new production deployment or remote green CI. PR90 is already merged; these changes belong in a new PR. Publishing requires authenticated GitHub access.

## Requested changes

- Removed blocked-account shortcuts from the Privacy & Safety summary and Safety center. Block/report enforcement and block management are preserved; audience controls remain reachable from Privacy and block management remains in Account.
- Removed Help & Support from About, retaining the primary Settings entry.
- Added **Verification data & withdrawal** directly to Settings; withdrawal still needs explicit confirmation, and queued cleanup is not called completed.
- Matched the saved settings group/banner/group arrangement, with the additional requested withdrawal row. Membership remains explicitly unavailable rather than pretending subscriptions can be purchased.
- Restored the saved discovery reference: portrait card, fine border, no decorative stacked-card glow or forced image zoom, separate action row below the portrait, above the bottom tabs. Browser geometry asserts actions remain visible.
- Demonstrated women and men in fixture-backed review cards. No fake account or synthetic live member was inserted. Live discovery remains real eligible profile data, so the app cannot truthfully promise women exist in a particular filtered result set.
- Intention/lifestyle/interest chips now use the **currently displayed member's stored data** and change on swipe. Missing optional facts are omitted, not invented. These are informational chips; the separate filter button still opens the real filter panel.

## Discovery semantics

Everyone means no gender restriction, not permission to ignore another person's boundaries. All search requests continue to enforce authenticated membership, active/discoverable/ready profiles, no self, blocks in both directions, previous swipes, suppression, discovery audience, pause and incognito. Unknown audience rules and suppression lookup failures now fail closed.

The API already returns all matching results without a presentation-only card limit. The reset action now clears hidden photo-only restrictions as well as age/gender/distance/verified/intent choices. Saved photo choice is persisted when explicitly changed. The main preferences screen now uses an empty gender restriction for Everyone and truly saves 500km as **Anywhere**, rather than rounding 311 miles down to 499km. Main preference saves also refresh the in-memory discovery choices.

Supported adult age controls remain **18–99**. All ages refers to that supported adult range, not minors or unknown-age profiles. Other selected restrictions still apply. Previously swiped people are not silently recycled; existing deliberate reset-passes behavior is retained.

Verified-only is connected through authenticated settings save and the actual profiles query. Production-handler tests check real filtering with substituted adapters; local PostgreSQL tests exercise production handlers against stored privacy/filter fields. Neither is hosted RLS acceptance.

Resource loading now hides prior-query results while the new query is in flight and rejects stale request completions.

## Location and time

Without a consented GPS city for a nearby search, the eyebrow reads **Date like you mean it**. It never borrows a candidate's city.

**Find people in my area** requests browser GPS and sets a nearby search (40km if previously Anywhere). Consented coordinates are used in memory for search and the existing authenticated location-save route is called. City lookup uses the same reverse-geocoding provider already used by onboarding. No new browser-storage copy of coordinates is written.

With GPS, a resolved viewer city, and a finite nearby filter, the heading uses the **device's local system clock**:
- 05:00–11:59: Morning in [city]
- 12:00–16:59: Afternoon in [city]
- 17:00–04:59: Tonight in [city]

The clock refreshes each minute and when the page becomes visible. Permission revocation clears the GPS heading and fix. Geocoding failure leaves the generic heading rather than inventing a city. Location-save rejection is surfaced, not reported as saved.

A web page cannot directly read or certify the mobile carrier's clock, GPS hardware honesty, or a correctly configured system timezone. These limitations are not represented as verified.

## Truthful unvaccinated badge

A distinct leaf/hexagon badge appears only when the profile declares `unvaccinated` **and** its identity-verification flag is true. Identity verification is not medical verification.

The small explanation automatically appears on the **first eligible badge-bearing card per browser tab session**, with a dismiss action and timeout. Later cards do not auto-open it; the badge remains tappable for an explanation. Copy explicitly states:

> This member chose “Unvaccinated” and completed identity verification. Vaccination status is self-reported, not medically verified.

Withdrawing identity verification removes eligibility on the next fresh profile fetch. The 31-check local SQL suite verifies that stored declaration and verification changes are reflected in discovery payloads. It does not claim facial recognition proves health status.

## Chat and calls

- Member stylesheet loads from the root layout before route paint.
- The server passes the selected match into ChatView; it selects the thread directly rather than first rendering the list and then selecting in an effect.
- Thread history has a branded loading state, explicit retryable error, and a new empty-thread panel. The old opener panel is not flashed while messages load.
- Match changes key the thread correctly; Back clears the selected deep link.
- Voice/video and incoming-ring interfaces share the new ink/plum/gold call surface. Existing server-issued sessions, privacy/auth, microphone/camera tracks, signaling, decline/end, retry and cleanup logic remain intact. Menus close when a call is chosen.
- Notification-permission prompts no longer cover the discovery filter panel.

The call browser checks prove **presentation and control/session wiring** with fake media and substituted network services. The outgoing fixture exercises the unavailable-ring/failure path as well; it does not establish that a live call rang or connected. A two-account, two-device hosted test is still required for call delivery, media, TURN/NAT behavior and cleanup.

## Evidence

`evidence/discovery-settings/summary.json` and the adjacent JSON/image files contain the reproducible local evidence.

- Production build, lint and TypeScript: passed.
- Trust harness: **624/624**.
- Discovery/privacy contracts: **32**; presentation/clock/badge contracts: **20**.
- Production handlers + disposable local PostgreSQL: **31**.
- API contracts: **28**; media contracts: **37**; filter-storage contract passed.
- New browser scenarios: **22/22**, 0 browser errors, mobile and desktop.
- Setup/media browser scenarios: **38/38**, 0 browser errors.
- Compatibility browser scenarios: **44/44**, 0 browser errors.
- Landing browser scenarios: **35/35**, 0 browser errors.
- Environment isolation and migration completeness/immutability: passed. No migrations were edited.

Test maintenance: the old compatibility assertion required the later enclosed-action card variant; it was replaced with the saved-reference requirement (actions below portrait, above tabs). Fixture WebSocket joins are now answered rather than producing unrelated asynchronous call-trace writes during no-auto-send assertions. Media measurements resolve the current DOM atomically so expected optimistic-to-server message reconciliation cannot leave a detached element handle. Intrinsic-size, no-upscale and 1px-border assertions remain unchanged.

## Remaining acceptance

No hosted member data/settings were changed. No production deployment, merge, real account creation, hosted migration, hosted RLS audit or physical-device/biometric claim is made. Existing security backlog and previously pending hosted migration remain separate work. A fresh PR requires exact-head remote CI/CodeQL and independent review before merge.
