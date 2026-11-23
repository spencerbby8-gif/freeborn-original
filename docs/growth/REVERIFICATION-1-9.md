# Builds 1–9 — source, browser and live-site reverification

## Correction: this is not “SEO domination completed”

**No completed SEO dominance, ranking, traffic or growth system has been established.** The local work is a set of useful editorial/product pages, a small questions tool, technical discovery integration, offline measurement tooling and release-readiness tooling. Real search demand, console ownership, indexing, query/page performance, completed signup outcomes, production/provider flows and a controlled release are separate unfinished tasks. Tests passing does not establish any of those outcomes.

This pass was explicitly requested by the owner before a GitHub push. Push permission is not merge/deployment/submission permission. No production writes, account creation, outreach or engine notifications were performed. No pasted credential was saved in files, commands, Git configuration or remote URLs.

## Per-build verdict

| Build | Source cross-check | Fresh local result | Actual live/external state |
|---|---|---|---|
| 1 · Values questions | `relationship-values.ts`, picker component and SSR page: 12 topics, up to five choices, original questions, explicit copy, no answers/storage/network collection | 24 contracts and 26 browser checks pass | `/guides/relationship-values-questions` returned **404** live. No demand, usage or signup result established. |
| 2 · Free access | Current landing FAQ, planned-membership UI, mutual-like/chat access/media handlers, block/privacy/lifecycle constraints; no permanent pricing or near-you guarantee | 30 source contracts and 40 browser checks pass | `/free-dating` returned **404** live. Real completed signup/chat/media/provider testing was not performed. |
| 3 · Browser guide | Actual browser app and passthrough service worker; fresh official Chrome Android and Apple **Mac** guidance, correctly scoped | Included in 219 editorial checks: SSR, metadata, FAQ/schema, no-JS, keyboard, viewport/a11y and links | Existing live URL returns 200 but its content is the older version. No physical iPhone/Android install/push/call certification. |
| 4 · Scam response | Fresh FTC romance/recovery pages and Report Fraud; current product Report versus Block behavior; US/UK jurisdiction limits and no recovery guarantee | Included in passing editorial suite | Existing live URL returns 200 but differs from local. No real report submitted and no moderation/recovery outcome claimed. |
| 5 · Comparison repair | Fresh Unjected homepage and Tinder overview; detailed unknown prices remain unknown; removed stale ratings/counts, fabricated trust markup and free-chat/browser exclusivity | Included in passing editorial suite and local crawl reachability | Existing live comparison still differs. Its live metadata still carries the old 2.4-star claim; this repair is **not released**. |
| 6 · Shared-values/profile guides | Original composition, distinct meeting versus writing tasks, fictional examples explicitly labeled; no member bios/testimonials or claimed keyword volume | Both guides pass editorial suite | Both new URLs returned **404** live. No actual demand, rankings or conversion evidence. |
| 7 · Long-distance/privacy/verification | Actual current controls/policies and badge-off source; optional COVID-only self-report, legacy wording caveat, identity is not medical proof | Three guides pass editorial suite | Long-distance live content differs; privacy and verification guide URLs returned **404**. No physical-device, biometric or provider certification. |
| 8 · Measurement | Re-read importer, actual CSV contract and missing-data behavior. Found and fixed period/truncated-row/output-safety problems; no tracker introduced | **67** growth contracts pass, including synthetic/negative cases | **NOT COMPLETE:** no authorized real Google/Bing exports or completed-signup aggregate baseline. Unknown is not zero. No format check authenticates a console or a signup event. |
| 9 · Controlled release | Re-read readiness code. Found and fixed duplicate-engine acceptance, mismatched/missing periods and source identities, malformed containers, stale CLI output and output/input collisions | Quality, editorial browser and growth evidence pass and share final source identity; fail-closed tests pass | **NOT COMPLETE:** readiness stays blocked on real measurement plus owner/external evidence. No release ID/live verification of this commit, indexing observation, day-7/day-28 outcomes, notification or outreach. |

## Actual errors and test failures found — not erased

1. **Measurement/release validation gaps.** Requiring two export objects did not require different engines. Source periods were not cross-checked, completion periods were absent from the report, truncated CSV values could be coerced to empty strings, and start-only/end-only periods were poorly handled. Those are now rejected/recorded correctly. Malformed evidence/approval containers fail closed. Report outputs cannot overwrite inputs or each other. Invalid CLI input removes prior output rather than leaving an older pass. New regression contracts exercise these cases.
2. **Fingerprint coverage was too narrow.** It covered application source plus selected scripts/configs, but omitted public assets, workflows and prototype tests. It now hashes Git-tracked plus non-ignored working-tree files, excluding documentation (`docs/`, `.md`) and environment secrets. This remains local identity, not a signature or runtime/database/CI attestation.
3. **Wrong-context older UI run: 24/26 failures.** The member-UI suite intentionally uses fake fixture credentials. Running it on the normal provider-configured build redirected to sign-in. This failed run is retained. A preflight now rejects that configuration immediately instead of waiting through misleading UI failures. Application authentication was not weakened.
4. **Real mobile notification obstruction: 1/26 failure in the proper fixture rerun.** A new banner overlaid the notification-history control. The mobile stack now sits below the header. The regression verifies `elementFromPoint` reaches the real control and immediately clicks it with a two-second timeout, without forced clicks or waiting for the banner to disappear. Final fixture run: **26/26 pass, zero page errors** at 393/1440px. This is fake-microphone/intercepted-service testing, not live calls/provider delivery.
5. **Fixture build setup issues are preserved.** An exploratory fixture-environment build ran in the original checkout; it was replaced by the final normal-environment production build. The separate fixture checkout initially hit Turbopack's symlink-root restriction; the isolated fixture build was rerun successfully with webpack. No fixture environment was committed or applied to production. The running review preview was restored to the original checkout's final normal build.
6. **Production does not contain the new work.** Six new routes are live 404s, not “finished live pages.” Existing article/policy/sitemap content also differs. Do not relabel a local build as a released system.
7. **GitHub write authentication is missing.** Public fetch/remote reads succeed. A credential-free push preflight fails with `could not read Username for 'https://github.com': terminal prompts disabled`. The GitHub connector lookup reported unsupported. No insecure credential workaround was added. The exact commit/push outcome is reported separately after the attempt; nothing here asserts a successful push.

## Fresh checks and scope

- Lint, TypeScript, full normal-environment production build, secrets-pattern scan and whitespace check pass through the fixed **10 command-group** runner.
- Trust harness **624/624**; discovery/privacy logic **32**; values contracts **24**; free-access contracts **30**; mocked submission/icon contracts **14**.
- Final editorial browser suite **219**; Build 1 browser **26**; Build 2 browser **40**. Tested Chromium at 320/393/1365px for articles, expanded automated WCAG-tag scans, keyboard/native FAQ/no-JavaScript reading, schema/visible-answer equality, public links/canonicals/sitemap, real signup-mode navigation **without submitting**. Zero page errors/data-changing editorial requests.
- Growth importer/readiness suite **67** synthetic/negative contracts; no actual traffic, signups or approvals are supplied by these tests.
- Additional earlier-unpushed-code checks: API adapters **28**, chat media **37**, presentation **20**, notification receipts **17**, engine-request **10**, filter-storage contract pass. These use local doubles/pure logic, not hosted RLS/provider acceptance.
- Final older member UI suite **26/26** after the actual mobile fix, using an isolated fixture-configured production build, intercepted HTTP/WebSocket services and fake microphone/camera. No hosted email/device/biometric/RLS certification.
- Final quality/browser/growth evidence shares source identity `0d68e4b7282db00e7f226ccd8199403abe98f4d965b89b600f105603fe0eaf7d`. Documentation is intentionally outside this source hash; do not describe it as all-repository or signed verification.
- Evidence under `evidence/reverification/` is a selected copy of actual output. Full logs/screenshots, including failed attempts, are in the session delivery pack. Historical packs are historical, not updated results.

## Read-only production comparison

`node scripts/seo/compare-public-live.mjs --output=/path/to/report.json` compares only anonymous GETs against a local production build on port 3002 and `https://freeborndating.com`. No account/private-member endpoints are read by this comparison.

All **16 allowlisted local public pages**, robots and sitemap returned 200. Production returned 404 for:

- `/free-dating`
- `/guides/relationship-values-questions`
- `/guides/shared-values-dating`
- `/guides/intentional-dating-profile`
- `/guides/dating-privacy-checklist`
- `/guides/dating-verification-explained`

The 18-resource comparison records six absent routes, nine differing normalized resources and three with the same normalized article/main text. **Matching main text is not full metadata/deployment parity.** For example, the homepage main text matches but live title/description differ: live description still mentions an optional unvaccinated badge; local source uses optional self-reported preferences and keeps the health badge off. Live sitemap has 10 URLs; local sitemap has 16. This is direct evidence of unreleased differences, not an indexing/ranking measurement.

## External first-party rechecks

Freshly fetched again: Tinder overview, Unjected homepage, both FTC scam/recovery articles (recovery across both chunks), Report Fraud homepage, Chrome Android web-app help and Apple Mac web-app help. Evidence remains bounded to what those pages say; no competitor accounts/prices/member counts/provider safety tests were invented. Source ledger contains URLs and precise limits.

## Remaining real work, not a finished-growth label

1. Secure GitHub write authentication and verified branch push; review hosted CI. A push is not an approved merge/deployment.
2. Obtain authorized Google/Bing exports, actual completed-signup definitions/aggregates, real provenance and privacy/retention review. Validate demand and query-to-page fit, not just page count.
3. Complete actual provider/legal, physical-device and production-flow gates with genuine evidence and permissions.
4. Obtain explicit release approval, then use the normal review/CI/deployment workflow and verify the actual released commit publicly. Separately authorize any engine notifications.
5. Observe actual indexing/query/page/click and completed outcomes after release. Evaluate equivalent periods at day 7/day 28; no traffic/rank guarantees or fabricated forecasts.
6. Decide useful revisions, consolidation, distribution and future research from real evidence. This nine-build content/tool package is not the full scope of organic growth and does not guarantee competitive search dominance.
