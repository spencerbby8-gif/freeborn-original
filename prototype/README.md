# Freeborn — reference-matched prototype (static, not the app)

This directory holds the **static reference build** produced while rebuilding the
Freeborn app screens to match the approved design reference (the 15-screen grid).
It is plain HTML/CSS/JS — **not** wired to the Next.js app, the Supabase backend,
or any real account. It exists so the redesign is reviewable next to the reference.

`static-mock-landing/` is the same exercise for the landing-page hero comp
(“Designed for real connections.”). The **real** hero rebuild for the site lives in
`src/components/landing/hero.tsx` and landed on this branch — the mock is kept here
only as the visual reference it was built against.

## Layout

- `index.html`, `styles.css`, `app.js` — the 15-screen interactive prototype (hash routes `#/welcome` … `#/privacy`).
- `assets/` — AI-generated portraits and scenery used by the mock (Aria et al. are synthetic; no account exists for anyone in them).
- `screenshots/` — Chromium screenshots of every screen (`16-*`/`17-*` show interaction proofs).
- `evidence/compare-sheet-{1,2,3}.png` — side-by-side reference vs build, per screen.
- `AUDIT.md` — per-screen audit: what matches, what was fixed, and the honest list of remaining deltas.
- `shots.mjs`, `test.mjs` — screenshot driver and interaction suite (21/21 PASS at time of writing).
- `contact-sheet.png` — all 15 screens on one page.

## Ground rules carried over from the reference

- The phone status bar, 9:41 clock, signal/battery icons, Dynamic Island and home
  indicator are **excluded** by product decision; the screens carry no phone chrome.
- Photos are AI-generated illustrative portraits, never real members.
- Copy matches the reference verbatim, including quirks.

## Running it

Any static file server works, e.g. `npx serve prototype` — or open `prototype/index.html` directly in a browser.

## Relationship to the platform

`src/` is the production application (freeborndating.com). Nothing in `prototype/` is
imported by the app, ships with it, or affects its build. It is documentation as code.

## Serving it on the PR preview

`public/prototype/` carries a generated copy of just the runnable app
(`index.html`, `styles.css`, `app.js`, `assets/`) so Vercel **preview** deployments
serve it at `/prototype` — that is what the redesigned-15-screens review link
uses. Regenerate it with `node prototype/sync-public.mjs`; never hand-edit the
duplicate. Next serves the file at `/prototype` (no trailing slash), so the
script injects `<base href="/prototype/">` to keep the mock's relative URLs
working. `src/middleware.ts` answers a plain **404 on production** for
`/prototype/*`; local builds (where `VERCEL_ENV` is unset) keep it visible.
