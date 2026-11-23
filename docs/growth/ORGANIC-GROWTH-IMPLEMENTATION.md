# Organic discovery: first useful public tool (review only)

This local addition follows a qualitative FMHY → tools / forum / competitor research pass. It is not deployed and is not a forecast of first-week traffic.

## Added

- `/guides/relationship-values-questions`: twelve original relationship-conversation topics; choose up to five; explicit copy; no answers, score, storage, uploads or external AI integration.
- Server-rendered full questions, progressively enhanced interactive picker, clipboard fallback and ephemeral state.
- Link from guide hub and homepage footer; canonical/Open Graph/WebPage/Breadcrumb metadata; public sitemap allowlist entry.
- Logic contracts and mobile/desktop browser checks. New primary controls use current gold tokens; the anchor CTA explicitly sets its dark foreground because the existing unlayered anchor reset overrides utility color.
- Existing harness lastmod check now validates each editorial entry rather than assuming exactly ten, retaining the prior minimum and sitemap invariants.

## Validate

With Node 24 and installed dependencies:

```sh
node scripts/seo/values-conversation-contracts.mjs
npm run typecheck
npm run lint
npm run build
npm run test:harness
npm run check:secrets
```

Run the production build bound to port 3002 before the browser suite:

```sh
npm run start -- --hostname 0.0.0.0 --port 3002
VALUES_EVIDENCE_DIR=/path/to/evidence node scripts/seo/values-conversation-browser.cjs
```

Browser evidence defaults to the session research pack; set VALUES_EVIDENCE_DIR outside that workspace. Clipboard is mocked for explicit-action/error testing. Axe is injected using the existing CSP nonce; no security policy bypass is required. Physical devices, real clipboard permissions, live signup/media, provider health and actual search performance are not certified by this suite.

## Local findings that constrain next work

- Anonymous live editorial crawl: `/alternatives` has no inbound links from the other nine approved editorial URLs. It should receive a factual copy refresh before amplification.
- Live homepage metadata still mentions an optional badge, while the intended local release keeps the badge off. Do not mistake local source edits for production changes.
- Official Tinder help confirms free chat and web access. Neither feature is exclusive to Freeborn.
- Existing “meet without apps” guide means no app-store download; distinguish that from offline-meeting intent.
- No measured keyword volumes, difficulty, verified console baseline or conversion data obtained. Do not publish invented estimates.

The accompanying session pack includes the full source ledger, research report, 24-row intent map (including consolidation/holds, not 24 launch pages), three review-only content drafts and a first-week plan. Publication, submissions and external distribution require their own approval. Keep all existing privacy exclusions, market gates, COVID-only self-report scope and badge-off policy unchanged.
