# Bing screenshot follow-up — review and evidence

## Release status
**Fixed and verified locally; not deployed, pushed, merged, or submitted to a search engine.**

The evidence compares anonymous live production BEFORE against a real locally built Next.js server AFTER using fixture public Supabase settings. Browser member checks use substituted API responses. Neither proves hosted authentication, production RLS, Bing rendering, actual indexing, ranking or new signups.

## Findings from all nine screenshots
- Homepage Live URL: eligible, no reported SEO/GEO issues. This is not the Bing Index tab.
- Free-dating Bing Index: **Discovered but not crawled**, not crawled-but-not-indexed. Live URL: eligible, one meta-description warning.
- Guide Bing Index: **Discovered but not crawled**. Live URL: eligible, no SEO/GEO issue. Its full URL is truncated, so its exact slug is not inferred.
- Description help recommends **25–160 characters**. The actual live free-dating description is **173 characters**, reproducing that warning. This is not proof of why Bing has not selected it for crawling.
- JSON-LD and OpenGraph are two different markup formats, not two missing components. Organization legal name and WebSite product name serve different roles; no legal-name rewrite was made.
- Apparent OpenGraph `Â·` / entity corruption in the screenshot is **not reproduced**. Live HTTP is UTF-8 and decoded title is `Freeborn · Intentional Dating & Shared Values`. Raw `&amp;` in an HTML attribute is correct escaping. Parser negative controls detect actual double escaping.
- Discovery dates are transcribed from the screenshots as 24 Nov 2026; no elapsed waiting time or crawl timetable is inferred.

`screenshot-observations.json` lists each input filename, SHA-256 and observation; raw user screenshots are not republished in the source package.

## Code changes
- Deliberately rewrote 11 overly long descriptions, not automatic truncation or keyword stuffing. Five already-conforming descriptions remain unchanged.
- Shared curated copy keeps changed page metadata, OpenGraph and WebPage JSON-LD in agreement. Shared guide descriptions also appear in guide cards/introductions; guide article bodies and legal policy clauses were not rewritten.
- Added source contracts, parser negative controls, a read-only HTTP audit, Chromium metadata checks and a blocking CI step for offline contracts.
- No CSP weakening, blanket cache changes, rendering-mode changes, removal of private noindex/auth protection, bottom-tab edits, or speculative encoding replacement.

## Measured before / after
**Live baseline:** 16 public pages, 11 description-range findings. **Local after:** same 16 public pages, zero findings in the explicit HTTP checklist. This is bounded coverage, not a claim of perfect SEO.

| Public path | Live before | Local after |
|---|---:|---:|
| `/free-dating` | 173 | 140 |
| `/privacy` | 167 | 136 |
| `/terms` | 173 | 136 |
| `/cookies` | 171 | 135 |
| `/alternatives` | 177 | 137 |
| `/guides` | 178 | 142 |
| `/guides/meet-without-apps` | 170 | 138 |
| `/guides/long-distance` | 169 | 147 |
| `/guides/scam-spotting` | 181 | 144 |
| `/guides/intentional-dating-profile` | 183 | 148 |
| `/guides/dating-privacy-checklist` | 174 | 152 |

## Fresh verification
- Node 24.22.3; dependency installation, ESLint, TypeScript and normal Next.js production build: PASS.
- 24 metadata source contracts + 13 parser/policy tests: PASS. Includes exact original 173-character description failing, boundary values, missing/duplicate descriptions, Unicode, legitimate entity decoding and actual double escaping.
- 624 existing trust-harness assertions, 28 local API contracts, 22 presentation contracts, 21 evidence-safety contracts: PASS.
- Migration contract validator and secret scan: PASS. No migration applied.
- Actual local Chromium: all 16 public pages PASS, 0 uncaught page errors, no horizontal overflow at 393px. Three viewport captures included. Browser external networking blocked.
- Existing signup/onboarding/filter browser suite: 18 checks PASS across mobile and desktop, 22 captures, 0 uncaught page errors. Substituted APIs, not live member acceptance.
- HTTP audit: public 200 responses, self-canonicals, UTF-8, server-rendered content, title/description uniqueness, crawlable homepage link graph, sitemap presence, robots allowance, parseable JSON-LD, OpenGraph metadata and changed-description consistency checked. Three simulated Bingbot requests match normal metadata; these are NOT verified Bing crawler visits.
- `/auth` and `/app` retain observed noindex; anonymous `/api/profiles` and `/api/notifications` return 401 locally and on production. No member data read.
- Public host probes: HTTP apex and HTTPS www return 308 to HTTPS apex; HTTPS apex returns 200. Legacy Vercel alias still returns 200, not an established wrong-canonical finding; canonical consolidation can be reviewed separately with hosting ownership.
- Live social image: HTTP 200, PNG, actual 1200×630 dimensions.

## What remains unresolved / next approval
1. Review the patch and approve release. Production still has the old descriptions; no success claim is made for production.
2. After deployment, rerun the HTTP audit against production, then recheck Bing Live URL for free-dating and the exact guide URL. If authorised, submit the sitemap/changed URLs through appropriate webmaster tools/IndexNow. Submission, crawling and indexing are separate outcomes.
3. Bing account-side crawl history, restrictions, server logs from verified Bingbot requests and selection decisions are not available from anonymous HTML. Investigate persistent discovered-only status there; do not assume the description warning is its root cause.
4. Sitemap dashboard count 10 versus 16 live URLs remains unexplained without the exact dashboard property, sitemap URL and last-read details. Six Google Search Console exclusions still require the exact URLs and exclusion reasons.
5. Previously prepared member fixes are carried forward unchanged. Production notification migration `20261121210000_notification_dismissal.sql` still needs explicit approval; separate chat-document migration is not automatically authorised. Hosted member flows/RLS require their own release checks.
6. No guaranteed indexing time, ranking improvement or worldwide member growth is asserted.

## Reproduce
From the source checkout with Node 24:

```sh
npm ci
npm run test:bing-metadata
npm run lint
npm run typecheck
npm run test:harness
python3 scripts/seo/bing-metadata-audit.py --output=/absolute/path/live-audit.json
# Audit exits 1 while production still has the known description warnings.
```

For local build use fixture public Supabase values and the existing production build/start commands, on port 3003. Then:

```sh
python3 scripts/seo/bing-metadata-audit.py --origin=http://127.0.0.1:3003 --output=/absolute/path/local-audit.json
FREEBORN_UI_OUTPUT=/absolute/path/browser-evidence node scripts/seo/metadata-browser.cjs
```

Only canonical production and explicit loopback test origins are allowed by the new HTTP/browser tools. They never sign in or submit URLs. Outputs include UTC measurement timestamps; screenshot dates are separate inputs.
