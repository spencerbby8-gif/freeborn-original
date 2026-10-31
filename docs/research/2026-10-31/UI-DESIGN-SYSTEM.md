# Freeborn UI / design system — measured state, 2026-10-31

Scope of this record: the control layer (buttons, chips, icon targets, state blocks) and the
stylesheet that now carries their behaviour. Not a style guide: it records what was measured, what
was changed, and what is deliberately still open. Companion to
`docs/research/2026-10-31/PRODUCTION-MIGRATIONS-2026-10-31.md` (that file's `SHA256SUMS` covers the
migration record, not this one).

## 1. The audit, by extraction not by grep

Every `<button>` in `src/` was extracted with its `className` and accessible name (a script over the
JSX, not a line count — a line count cannot tell a photo-reorder control from a call to action).

| measured at `da6abd4` | value |
| --- | --- |
| raw `<button>` occurrences in `src/` | **194** at `da6abd4`; **191** in this tree (the −5 is `settings-view.tsx`, the +2 are the new primitives; the count also includes one prose mention inside `button.tsx`'s doc comment, which is why it is a ceiling and not a census) |
| uses of the shared `<Button>` | **5** |
| files in the UI kit | 2 (`button.tsx`, `photo-image.tsx`) |
| button vocabularies in parallel | 3 — `.fb-btn*`, `.btn-ember`/`.btn-ghost`/`.btn-shine`/`.magic-button`, inline Tailwind |
| control heights declared per component | `min-height`: 40 (×2), 44 (×4), 48 (×4), 52 (×5), 56 (×2), 65, 88 (×2) · fixed `h-`: 32 `h-8` (×6), 36 `h-9` (×10), 40 `h-10` (×14), 44 `h-11` (×6), 48 `h-12` (×6), 64 `h-16` (×6) — so 16 controls in `src/components/app/` are pinned BELOW the 44px floor by a fixed height |
| `:focus-visible` rules on the legacy families | **0** (only `.fb-cta`, lines 1233–1236) |
| `:disabled` rules on the legacy families | **0** (only `.fb-cta`, lines 1237–1241) |

The debt was therefore behavioural before it was cosmetic: a disabled "Delete my account" rendered
identical to an enabled one, and focus rings were whatever the UA chose. The most destructive control
in the app also sat on `bg-red-500 text-white`, off-palette and **3.76:1** — under AA.

## 2. What changed

1. **Behaviour moved to where the vocabularies already meet** (`src/app/globals.css`,
   `LEGACY CONTROL UNIFICATION`). The legacy selectors now carry the focus ring (same declaration as
   `.fb-cta`), the disabled state (`opacity .55` + `cursor: not-allowed`), the touch floor, the
   `(hover:hover) and (pointer:fine)` gate, and reduced-motion guards. All 191 sites gain it with no
   markup change, so a later per-screen sweep can be about composition rather than reset.
2. **The floor raises; it does not reskin.** `.fb-btn` keeps its 48px (appending
   `min-height: var(--control-h-md)` to it would have *shrunk* the most-seen CTA in the app to 44px —
   equal specificity, later in the file). `.fb-btn-sm` goes 40px → 44px by shedding horizontal
   padding instead of height.
3. **Primitives** (`src/components/ui/`): `IconButton` (`aria-label` required by the type), `Chip`
   (`aria-pressed` required), `states.tsx` (`Skeleton`, `LoadingState` `role=status`,
   `EmptyState`, `ErrorState` `role=alert`). Sizes come from tokens; the two controls allowed to paint
   small (`.fb-icon-btn--xs` 28px, `.fb-chip--sm` 32px) reach 44px through a positioned `::before`.
4. **`variant="brand"`** names the ember gradient inside the shared contract instead of silently
   recolouring ~100 member CTAs to pearl. Label is ink: `#fff7f2` on the pale end of
   `--gradient-ember-warm` measures ~3.3:1.
5. **First surface migrated** (`settings-view.tsx`): account deletion and deactivation now route
   through `danger`/`quiet` with `loading`; five raw Tailwind reds became `var(--color-danger)`.
   Raw `<button>` there: 24 → 19, and the reversible "Deactivate" opener stays on the tinted pill on
   purpose — solid red is reserved for the irreversible action.

## 3. Two bugs this pass found in its own tooling

- **`inset` on a static pseudo-element does nothing.** The `--xs` hit-area rule looked correct in the
  file and computed to `auto`. Found only by reading `getComputedStyle(el, "::before")` in Chromium.
  It also revealed that `inset` resolves against the **padding box**, so a 1px border made the target
  42px, not 44px — hence the `- 1px` in the rule.
- **`--blink-settings=primaryPointerType=2` does not force a fine pointer in this headless build.**
  Measured: the *default* context reports `(hover:hover) and (pointer:fine)` **true**; the flagged one
  **false** — the inverse of what `visual-check.mjs` assumed when it labelled
  `gateCorrectlyClosed`/`gateCorrectlyOpen`. Those verdicts are gone; the script now prints each
  context's real `matchMedia` result beside what painted, and `design-check.mjs` asserts.

## 4. Measured result — `node scripts/qa/design-check.mjs`, 32/32

Chromium at 390px, against the CSS Next emitted (`public/qa/`, built by `scripts/qa/build.mjs`, which
now refuses to package a stylesheet older than `src/app/globals.css`).

| control | computed height | ring | disabled |
| --- | --- | --- | --- |
| `.fb-cta` md | 44px | 2px solid, 3px offset | opacity .55 |
| `.fb-btn` (legacy) | 48px (kept) | 2px solid, 3px offset | opacity .55 + not-allowed |
| `.fb-btn-sm` | 44px (was 40) | 2px solid, 3px offset | opacity .55 |
| `.btn-ember` | 44px; lifts −2px on fine only; `none` on Pixel 7 and under reduced motion | 2px solid | opacity .55 |
| `.btn-ghost` | 46px | 2px solid | opacity .55 |
| `.magic-button` | 60px (floor does not shrink it) | 2px solid | opacity .55 |
| `.fb-icon-btn` / `--xs` | 44px / paints 28px, 44px to the pointer | 2px solid | not focusable |
| `.fb-chip` / `--sm` | 44px / paints 32px, 44px to the pointer | 2px solid | — |
| danger label contrast | **6.69:1** (ink on `--color-danger`) | replaces **3.76:1** (`bg-red-500` + white) | — |

Also asserted: no horizontal overflow at 390px, `aria-pressed` flip repaints the chip, and no page
errors beyond the two deliberately missing images that drive the `PhotoImage` retry/failure states.

Gates: `npm run test:harness` 491/491 · `tsc --noEmit` clean · `eslint .` clean · `next build` clean ·
`npm run check:secrets` clean · `node scripts/qa/design-check.mjs` 32/32.

## 5. Deliberately open

- The remaining ~188 member-facing raw `<button>` sites (191 occurrences minus the UI kit's own
  primitives and the doc-comment mention). The harness now pins `count <= 191` per run and 19 for `settings-view.tsx`, so
  the number can only go down; nothing may add a raw `<button>` to a migrated surface.
- Next surfaces by member exposure: `app/profile/page.tsx` (31 raw), `verify-modal.tsx` (14),
  `chat-view.tsx` (24), `home-deck` (10), `voice-note` (10), `filter-panel` (6).
- `LoadingState`/`EmptyState`/`ErrorState` exist and are rendered in the QA kit; screens still carry
  their own wording and get migrated one at a time, with copy reviewed per screen rather than bulk.
- Photo-reorder, deck, and lightbox controls stay raw **by decision** — they are not pill CTAs and
  migrating them would be a layout change dressed as a refactor.
- Screenshots are in `scripts/qa/.shots/` (gitignored, local): `fine-hover.png`, `coarse-phone.png`.
