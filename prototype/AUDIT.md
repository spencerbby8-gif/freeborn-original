# FREEBORN — Reference-to-build audit (2026-11-21, pass 3)

Method: re-read all 15 reference crops (`/home/user/ref-crops/*.png`, 3× grid cells of the master grid)
side by side against fresh Chromium screenshots of the build; fixed every delta found; re-screenshotted;
re-ran the interaction suite. Chrome (status bar, 9:41, signal/battery, Dynamic Island, home indicator) is
**excluded by your instruction** — the reference shows it, the build deliberately does not.

## Fixes applied this pass
1. Removed `.island` (Dynamic Island), `.statusbar` (9:41 + signal/Wi-Fi/battery), `.home-indicator` from markup + CSS. All 15 screens.
2. Flame glyph was a vertical squiggle — replaced with a proper flame path everywhere (welcome logo, desktop rail, discover spark button, profile-detail spark button, discover "natural health" chip).
3. Likes header icon: 5-point gold star → white 4-point sparkle (matches reference).
4. Likes list hearts: fill opacity .18 → .92 — hearts now read filled rose like the reference.
5. "Age range" / "Distance" section labels: muted gray → reference coral (all section labels now coral).
6. My profile quote corrected to reference copy: “Curious mind, kind heart, always up for a new adventure.” (was “…kind, loyal heart…”).
7. Tab bar: added the reference's small gold underline dash beneath the active tab label; trimmed the extra 22px bottom padding that existed only to clear the (now removed) home indicator; chat input bar padding likewise trimmed.
8. Corner clearance below the rounded screen edge: `.scroll` gets 18px top padding; full-bleed hero screens opt out (`.flush`) and their absolute nav buttons were moved down (back/more on profile-detail top:4→18px, eye on my-profile top:6→16px, chat header 18px, chat body offset 63→76px). On-device, no control now sits under the corner radius.
9. Verification face-glow: contained within the frame (no more clipped hard edge).
10. Interaction suite re-verified after all changes: **21/21 PASS, 15/15 routes deep-link, NO_PAGE_ERRORS / NO_CONSOLE_ERRORS**.

## Screen-by-screen vs reference (as of this pass)
| # | Screen | Match status |
|---|--------|--------------|
| 01 | Welcome | MATCH — logo flame, serif headline, sub-copy, Sign in/Create account segmented control, example.com/password fields, Continue, fineprint |
| 02 | Onboarding | MATCH — Step 2 of 7, 7-segment progress (2 filled coral), gold Skip, gold-check selection, exact copy, Continue pinned |
| 03 | Discover | MATCH (was: broken flame icon) — eyebrow, serif headline, rose "why" chips + flame chip, NEW HERE, verified badge, action row (X / Say hello / spark) |
| 04 | Profile detail | MATCH (was: broken flame icon) — photo hero, verified name, Looking for card + neon heart, 2×2 tiles (olive/Leo-gold/globe), About me/passions, action row |
| 05 | Likes | MATCH (was: gold star + outline hearts) — "People who like you" + rose 12 badge, All/New 3/Nearby/Similar, filled-rose hearts in maroon circles, blue verified badges |
| 06 | Messages | MATCH — search field, + Your story + gold-ring stories, thread rows, rose unread pills (2/1), Lena gold dot, exact snippets & timestamps |
| 07 | My profile | MATCH (was: wrong quote) — full-bleed hero, eye button, stat cards (152/24/8), photo strip + add tile, gold menu rows (About/Interests/Preferences/Verification/Settings) |
| 08 | Notifications | MATCH — NEW label, 5 filter chips fit, typed icon circles (rose/green/purple/gold), 6 rows incl. no-photo rows for views/system |
| 09 | Settings | MATCH — grouped divided rows, gold icons, crown-in-gold-square upgrade banner, maroon Log out |
| 10 | Preferences | MATCH (was: gray labels) — all section labels coral, cream-selected pills/chips, "+ Add more" dashed coral chip, dual-range age 24–32, distance 25 mi, Save preferences |
| 11 | Premium | MATCH — crown ring, serif headline, 7 gold-check features in reference column order, Most popular badge on 3-Months plan, Upgrade Now gradient pill |
| 12 | Matches | MATCH — NEW MATCHES eyebrow + cream 8, 4 portrait match tiles, Tessa match row with quote + Say hello, tab dash under Likes |
| 13 | Chat | MATCH — bare back chevron, photo avatar + verified, "Active now", TODAY, dark/cream gradient bubbles, typing dots, input dock, note: input bar bottom padding reduced after chrome removal |
| 14 | Verification | MATCH — shield ring, serif head, stadium frame with soft glow, 3 gold checks, Start verification, fineprint |
| 15 | Privacy & Safety | MATCH — Safety center banner, divided toggle group (3 on / read receipts off), maroon blocked-accounts button, tab dash under Profile |

## Remaining differences (honest list, none hidden)
1. **Photos are AI-generated stock-style portraits**, not the reference's exact photos (all 8 Aria/sample faces + hero + chips are synthetic; reference artwork is not licensed to us). Layout, type, color, copy and structure are matched; the faces cannot be.
2. **Age-range slider semantics**: the reference mock draws a single decorative thumb per slider; the build ships a *functional dual-thumb* control (24–32) because a one-thumb control cannot set both values. Visual fill differs slightly from the mock; behavior is real.
3. **Typography**: reference serif ≈ Georgia (build uses Georgia/serif stack); exact font files/metrics unknown — spacing differences of a few px may exist.
4. **Colors** were sampled visually from the grid (no Figma source); hex values are close estimates, not ground truth.
5. **Scroll behavior**: some screens (My profile, Discover card area) exceed the viewport on this iPhone height and scroll — same as the reference, whose content also runs past the fold.
6. **Interactions are prototype-grade** (JS state, toasts, deep links, chat auto-reply) — not native iOS; there is no haptics/system-share integration.
7. **Reference phone chrome intentionally absent** (your exclusion), including on the reference-side comparison columns of `evidence/compare-sheet-*.png`, which therefore cannot be pixel-aligned vertically with the build.

## Evidence
- `contact-sheet.png` — all 15 screens, one view.
- `evidence/compare-sheet-{1,2,3}.png` — per-screen side-by-sides: reference crop vs build.
- `screenshots/01..15-*.png` — full-res individual screens; `16-chat-live-reply.png`, `17-spark-toast.png` — interaction proofs.
- `node test.mjs` → 21/21 PASS (routes, deck pass/reset, chat send + auto-reply, filters, toggles, premium selection, toasts).
- `node shots.mjs` → NO_CONSOLE_ERRORS.
