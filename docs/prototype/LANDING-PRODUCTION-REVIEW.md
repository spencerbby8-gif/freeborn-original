# Landing cleanup and PR #90 review

## What changed

The public landing page now has a single visual system and a short sequence: hero, disclosed sample profiles, three steps, safety/privacy, FAQ and a final signup link. The original brand and requested couple artwork remain.

- Removed the scrolling slogan marquee, duplicated standard/trust-ledger sections, repeated feature lists, decorative glows and extra competing CTAs.
- Replaced abstract marketing phrases and internal product-defense language with short, concrete dating copy. Removed the unsupported implication that other members are already waiting for the visitor.
- Replaced fixed-height, absolutely positioned app discovery cards with static sample cards whose text remains in normal document flow. There are no pretend like/message controls on sample accounts. Mobile shows one example rather than three repeated full-height cards; desktop shows three. Generated portraits remain disclosed.
- Added the missing `#why-freeborn` destination and corrected the footer anchor. The sticky header occupies layout space; section anchors clear it. Mobile menu exposes state, closes on selection/outside click/Escape and returns focus on Escape.
- Isolated landing CSS from authenticated prototype/card styles and removed the obsolete hero override stack.
- Removed the public page from the global fullscreen loading boundary. Branded route loaders remain in app, auth and onboarding. Public content and the signup link now render without JavaScript; nonce-dependent structured data has its own Suspense boundary. CSP has not been weakened.
- Fixed automated accessibility findings: low-contrast footer text and an inline sign-in link lacking an underline.

## Measurements and evidence

Baseline at 393px: 14,043px page height; document width 402px against a 393px viewport; a missing navigation anchor. Baseline at 320px: 15,694px tall and 329px wide. The cleaned 393px page is approximately 4,960px tall, about 65% shorter. Exact height can vary with font/browser rendering.

Local acceptance covers 320, 360, 393, 768, 1024 and 1440px widths: no horizontal overflow or off-screen text, header/hero/CTA boundaries, sample clipping, real anchors, FAQ interactions and matching FAQ structured data. It also checks mobile menu behavior and core content with JavaScript disabled.

- 35 public landing browser checks passed with zero browser errors.
- 44 general app browser checks passed with zero browser errors, including filter reopen behavior.
- 36 setup/media browser checks passed with zero browser errors, including intrinsic photo sizing, compact voice playback and actual fake-device recording/video bytes.
- Trust harness: 624/624 assertions passed on the isolated rerun. An earlier concurrent run failed the unchanged proof-of-work timing budget (623/624); no threshold was relaxed.
- Media contracts: 26 passed. Discovery/privacy contracts: 27 passed. API contracts: 28 passed.
- Filter storage contract passed: no browser-storage writes, legacy plaintext removed, in-memory choices preserved and isolated from caller mutation.
- Lint, TypeScript, production build, environment isolation and migration checks passed. Evidence logs and final automated accessibility results are stored alongside this report.
- axe-core WCAG 2/2.1 A/AA automated scan: zero violations at 393px and 1440px (26 and 25 passed rules respectively). Manual review remains necessary.
- All eight sampled public/auth link destinations returned HTTP 200 locally.

Screenshots, browser JSON, accessibility output and logs live in `evidence/landing-cleanup/`. Public-page checks use the actual local production page without API interception; app tests use fixture APIs/fake media and do not establish hosted RLS, provider delivery or physical-device acceptance. Automated accessibility testing is not a full accessibility certification.

## PR #90: conflict-free is not merge-ready

Read-only GitHub API review of remote head `454ffef7008f516dd20ff7d37aec6bcbeeb9ba4e` returned:

- PR open, still a draft, not merged.
- `mergeable: true`: Git reports no merge conflicts.
- `mergeable_state: unstable`.
- `verify`: completed successfully on the latest review.
- CodeQL analysis job completed successfully, but the separate CodeQL alert gate failed with five new high-severity findings. A successful analyzer job is not a clean security result.
- Vercel and Netlify preview statuses succeeded; Supabase Preview was skipped. These statuses describe the existing remote head, not this unpushed cleanup.

The five reported code paths have local corrective changes, without suppressing/disabling CodeQL:

1. Replace insecure fuzz/nonce randomness in the test harness with Node crypto.
2. Escape all regex metacharacters, including backslashes, in the harness selector assertion.
3. Parse the endpoint in the harness assertion and verify HTTPS/exact hostname/path rather than accepting a URL substring.
4. Replace FileReader-derived media-preview text with opaque object URLs; reclaim preview/probe URLs when removed or unmounted. Sending retains the original File.
5. Stop persisting the sensitive discovery-filter object to plaintext localStorage. Main settings continue through the authenticated settings API; additional search filters now last only in the current page runtime. Old `freeborn.filters` data is deleted when discovery/filter storage is accessed, and the UI/cookie policy explains the new behavior.

These are prepared fixes, not proof that GitHub CodeQL is green. A fresh remote scan must confirm them after push. Security/privacy contract checks were added to CI; existing gates remain enabled.

## Delivery boundary

GitHub connector access is unsupported here. Public read-only API inspection works, but a credential-free push dry run failed because no usable Git authentication exists. The previously exposed token was not reused. The cleanup is committed locally on the existing feature branch; PR #90 remains at the older remote head until repository authentication is restored and this commit is pushed. No merge, production deployment, hosted migration or hosted data mutation was performed.

Recommendation: **do not merge yet**. Push this cleanup with fresh repository authentication, wait for the CodeQL alert gate and all required checks to pass, review the diff, and explicitly take the PR out of draft before considering a merge. Branch-protection/required-review settings were not verified with elevated permissions.
