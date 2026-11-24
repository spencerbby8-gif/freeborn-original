# Member errors, existing-account signup, filter hint and SEO review

## Release status — not a production completion claim

- Base: merged PR93, main `00c6a65`; work branch `fix/member-errors-signup-seo`.
- Changes are local and tested. No new merge, deployment, live migration, member-row repair or search-engine submission has been performed.
- A real GitHub PR has not been opened: unauthenticated push preflight failed. A compare link would not be a PR.
- Production observations below came from read-only database metadata and anonymous public HTTP requests. No authenticated production browser session or user-specific request trace was available.
- Preserve the restored Discovery design, device-local time/city heading, native onboarding controls, own-profile preview and existing four bottom tabs. `src/components/prototype/frame.tsx` and its tab definitions are unchanged. New CSS is scoped to the filter hint.

## 1. Concrete failure causes and fixes

### Notifications — missing deployed database column

The production `notification_preferences` table lacks `dismissed_before`. Drizzle declares that column, Notifications GET selects the table, and POST clear writes it. A local PostgreSQL negative control drops the column and reproduces SQLSTATE **42703** through the real handler. Applying the already-committed additive migration restores GET and clear; applying it twice succeeds.

**Required release prerequisite:** review/apply exactly `supabase/migrations/20261121210000_notification_dismissal.sql`. It adds one nullable timestamp; existing owner/runtime policies apply unchanged. NULL preserves the existing feed. No notification/message rows are deleted, and clearing the feed does not mark private messages read.

The migration is already part of main's clean-replay manifest but was absent from the inspected live migration history. Committing SQL is not proof that production ran it. Merely deploying the new error handler will not fix this schema mismatch.

### Discovery/location — endpoint writes a forbidden source value

`POST /api/location` wrote `source: "browser"` on insert and conflict update. Both Drizzle and the inspected live CHECK constraint allow only `manual` or `gps`. The local negative control reproduces SQLSTATE **23514** with the old value. Both writes now use **`gps`**; the existing schema and safety/rate-limit checks are not weakened.

This is a concrete failing path consistent with an error above an otherwise loaded Discovery card. The screenshot does not identify its failed HTTP request, so this review does **not** claim a production trace has proved which action caused that exact historical incident. Actual local SQL tests also cover Pass, Like and mutual matching. Any remaining hosted error should be checked against the operation/correlation ID rather than guessed from the screen.

### Honest errors and safe diagnostics

Notifications, likes, Discovery queries and location handlers now retain real failure statuses and return readable operation-specific JSON errors. Known connection/schema/permission failures return 503; unknown failures remain 500. They do not fabricate an empty feed, an empty deck or a successful save.

Structured diagnostics include only operation, random request ID and a validated PostgreSQL code. They omit SQL, bindings, email, tokens, GPS and arbitrary upstream messages. Existing 401 responses remain 401. The profiles route's existing auth-outage 503 behavior is retained.

Read-only comparison of the 13 relevant table-column inventories found the missing dismissal column; the other expected names were present. This is not a blanket certification of every trigger, type, RLS policy or runtime environment. Legacy identity mirror anomalies were investigated without merging/reassigning identities; the existing recreated-email auth regression remains passing.

## 2. Existing-account signup

Supabase may return either an existing-user error or an obfuscated user object for a confirmed duplicate. The latter was previously treated as a new signup and entered the email-code screen. The provider documents its setting-dependent duplicate behavior. [2](https://supabase.com/docs/reference/javascript/auth-signup) Its empty-identities signal is also documented. [3](https://supabase.com/docs/reference/csharp/auth-signup)

The signup outcome classifier now handles both:

> An account already exists for this email. Log in instead, or reset your password.

The UI selects Sign in, keeps the email, clears the password and code state, and does not navigate to OTP/onboarding or write onboarding data. No public email-existence endpoint or admin user lookup was added. Legitimate new/unconfirmed identities still use confirmation; a real returned session follows the existing authenticated flow. Ambiguous provider responses do not pretend that an email was sent.

Browser tests intercept the actual auth requests to simulate both duplicate responses and exercise the component. They do **not** prove hosted Supabase settings, actual email delivery or inbox receipt. A controlled real-account/new-inbox acceptance test remains required after approved release.

## 3. Filter hint

A small dismissible first-visit hint is anchored to the **flame beside the profile-detail chips**. It is not attached to the upper notification heart or the bottom-card spark action. It identifies age, distance, values and lifestyle filters; tapping the original flame still opens Discovery filters immediately.

The hint supports an accessible description, keyboard Escape, explicit dismissal and a session-only seen flag with a storage-unavailable fallback. It does not store member identity or coordinates. Browser tests check placement, viewport bounds, dismissal/remount, filter opening and the unchanged count of four navigation tabs.

## 4. Verification performed

| Check | Result | Scope limitation |
|---|---|---|
| Default `npm run build` | PASS | Isolated fixture public auth configuration; not a hosted deployment |
| Separate fixture `npm run build -- --webpack` | PASS | Used because fixture node_modules symlink is outside Turbopack's root |
| Typecheck / lint / secret scan / diff whitespace | PASS | Local checkout; not remote CI |
| Clean migration contracts | PASS, 54 steps | Does not apply pending migrations to production |
| Trust harness | 624/624 PASS | Existing source/security contracts |
| New member runtime regression | 19 PASS | Real handlers + real local PostgreSQL; auth/IP/moderation substituted; rollback |
| Existing recreated-email auth regression | 8 PASS | Real local SQL, substituted auth; no identity merges |
| Existing experience DB regression | 31 PASS | Real local SQL; fixture auth and other named substitutions |
| Existing API contracts | 28 PASS | Substituted adapters |
| Discovery presentation | 22 PASS | Device-clock/member-chip contracts |
| Notification receipts | 17 PASS | Browser-local storage contracts, not hosted database |
| Evidence safety | 21 PASS | No networking |
| Auth/onboarding/filter-tip browser regression | 18 PASS, 22 captures | 393×852 and 1440×1000; intercepted synthetic sessions/APIs |
| Discovery/settings/call-chrome browser regression | 26 PASS, 52 captures | Synthetic sessions/APIs; not provider calls or physical devices |

Both browser suites recorded zero uncaught page errors. Numbers are not a claim of real hosted signup, message/call delivery, RLS acceptance or production member recovery.

Repeat locally after installing locked dependencies:

```sh
npm run typecheck
npm run lint
npm run check:secrets
npm run check:migrations
npm run test:harness
# The next command destructively prepares ONLY a disposable loopback test database.
npm run test:prepare-local
npm run test:member-runtime
npm run test:experience-db
FREEBORN_AUTH_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db npm run test:member-auth
node scripts/seo/crawl-health.mjs --output=crawl.json
python3 scripts/seo/deep-public-audit.py --output=public-audit.json
```

The new SQL regression is wired into CI **after** preparation of the disposable application schema. Browser scripts require a separate fixture-configured build; never point their fake sessions at real auth.

## 5. SEO: what is actually verified

**20 public endpoint checks passed:** robots.txt, sitemap.xml, **16 editorial pages**, and expected noindex metadata on `/auth` and `/app`. The exact editorial count is 16, not 17. A second, deeper anonymous SSR audit checked the same editorial inventory:

- HTTP 200; one self-canonical each; no conflicting noindex observed on the editorial pages.
- Titles/descriptions present, no exact duplicate titles/descriptions or complete main-text hashes in this inventory.
- One H1 per page in the test; this is an editorial check, not a Google indexing prerequisite.
- Every editorial URL reachable through the homepage's server-HTML internal-link graph.
- Server-rendered main copy and parseable JSON-LD; no JSON syntax failures. This is **not** Google's Rich Results Test or semantic eligibility certification.
- No `<img>` without an alt attribute in the sampled editorial markup; empty decorative alt is not treated as a failure.
- HTTP and www root requests end at the HTTPS apex. The deliberately missing test URL returns a genuine 404, not a 200 error shell.
- Three representative pages return the same main text/title/canonical to ordinary and spoofed Googlebot user agents. A spoofed user agent is **not a verified crawler visit or Google's renderer**.
- `https://freeborn-umber.vercel.app/` still serves HTTP 200; its canonical points to `https://freeborndating.com`. Consider a production-alias redirect, but it is not evidence that Google chose the wrong canonical.
- No city URLs were in the fetched sitemap. This does not prove zero qualifying populations: the sitemap also falls back to editorial URLs on a city-query failure.

These establish current crawl/content signals, not whether Google previously crawled these exact bytes, which canonical Google chose, indexing coverage, traffic, rankings or signups. Google explicitly says technical eligibility does not guarantee indexing. [5](https://developers.google.com/search/docs/essentials/technical)

### The six Search Console pages are still unresolved

The six URLs and reason labels have not been supplied. No Search Console report/API was accessed. Therefore nobody can truthfully say those six are fixed from this crawl alone. Search Console distinguishes genuine errors from expected exclusions; non-indexed does not automatically mean broken. [1](https://support.google.com/webmasters/answer/7440203?hl=en)

For each example, obtain the full URL, exclusion reason, last crawl, user-declared canonical, Google-selected canonical and live-test result. Use this decision table, not a blanket removal of privacy protections:

| Reported reason | Next action |
|---|---|
| Noindex / robots exclusion on auth, onboarding, private app or member preview | Usually intentional. Keep member data private; do not expose profiles for SEO. |
| Noindex / robots exclusion on an intended public editorial URL | Inspect the current HTTP header and served metadata, remove only the unintended restriction, then live-test. |
| Page with redirect / alternate with proper canonical | Often expected. Inspect the destination/preferred URL rather than trying to index every duplicate. |
| Duplicate; Google chose different canonical | Compare both URLs, redirects, internal links, sitemap and real content. A canonical tag is a signal, not a binding instruction. |
| 5xx / 403 / soft 404 on an editorial page | Match last-crawl time to deployment/edge logs, fix the specific response/rendering failure, and retest. |
| Crawled, currently not indexed | Review rendered content, duplication, relevance and usefulness. More markup or repeated submissions is not a guaranteed solution. |
| Discovered, currently not indexed | Check discovery, internal links, crawl availability and sitemap processing. It means found but not yet crawled, not proof of a meta-tag defect. |

Google's report documentation defines these statuses and the proper URL Inspection workflow. [1](https://support.google.com/webmasters/answer/7440203?hl=en)

### Corrections to earlier SEO assumptions

- `WebSite` markup does not unlock a sitelinks search box: Google retired that feature in 2024. The inaccurate source comment is corrected; site identity markup remains. [1](https://developers.google.com/search/blog/2024/10/sitelinks-search-box)
- FAQ schema is not a promised Google FAQ snippet. Google's 2026 changelog says that visual feature was discontinued. Visible FAQ content may remain useful; its markup is not an indexing/ranking fix. [1](https://developers.google.com/search/updates)
- AI Overviews/AI Mode do not require a special schema or a hidden optimization file; normal SEO and indexed/snippet-eligible content remain the basis. No AI inclusion or worldwide ranking has been established. [1](https://developers.google.com/search/docs/appearance/ai-features)
- A sitemap submission, IndexNow response, empty `site:` search or successful audit is not Search Console index-coverage evidence. No search submissions were made in this work. Google does not guarantee indexing even after eligibility checks. [5](https://developers.google.com/search/docs/essentials/technical)
- Google's Indexing API is not a general-purpose shortcut for dating landing pages; it is limited to the specified job/livestream page types. [2](https://developers.google.com/search/apis/indexing-api/v3/quickstart)

### Remaining SEO work, in priority order

1. **Resolve the actual six examples.** Supply the export/screenshots with full URLs and reasons, plus the sitemap's processing status. Inspect homepage, `/free-dating` and the important guides in the verified property; compare indexed vs live results and inspect security/manual-action reports. Do not mass-remove noindex or repeatedly submit unchanged URLs.
2. **Establish a truthful baseline.** Export Search Console page/query/country/device impressions, clicks, CTR and average position for the available periods. Define a small query set around the actual product (shared values, intentional dating, browser/no-download dating). None of that search demand or ranking data was available here.
3. **Measure mobile experience.** Obtain field Core Web Vitals/CrUX where sufficient traffic exists and separate lab diagnostics from field evidence. Suggested good-experience targets are LCP around 2.5s or faster, INP under 200ms and CLS under 0.1. No field performance score is claimed in this audit. [1](https://developers.google.com/search/docs/appearance/core-web-vitals)
4. **Review the old production alias.** With hosting approval, consider a permanent path/query-preserving redirect to the canonical apex; do not redirect every preview environment. Recheck Supabase OAuth/recovery origins before retiring a live entry point. Compare Google's selected canonical before diagnosing this as a coverage cause.
5. **Build distinctive usefulness and trust.** The public pages already have actual explanatory copy and an editorial label; there is no magic word-count target. Add original, accurate demonstrations and expert review where genuinely available, maintain sources, fix confusing product claims, and measure whether readers find the content useful. Do not invent experts, reviews, users, partnerships, press coverage or success rates.
6. **Earn relevant discovery.** Pursue real community/editorial relationships and consistent official business identity where appropriate; never manufacture mentions or buy spam links. Strong global visibility cannot be delivered by changing meta tags alone.
7. **Choose a real international policy.** Existing city pages have a membership threshold and a geographic allowlist, and the public content is primarily English. Worldwide local visibility is not implemented merely by opening robots.txt. Any expansion should follow actual product availability, local legal/operational readiness, useful local content and reviewed translations. Google recommends distinct language URLs and appropriate hreflang for actual translations, not fake locale tags. [1](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites) Do not mass-generate near-identical city funnels; doorway/scaled-content abuse is prohibited. [1](https://developers.google.com/search/docs/essentials/spam-policies)

**Bottom line:** technical public crawl checks pass, but six-page coverage diagnosis and search-growth evidence remain outstanding. Nobody can guarantee indexing, a timetable, worldwide dominance or signups.

## 6. Approval and release checklist

1. Review this diff, SQL prerequisite and synthetic evidence. Authorize GitHub push/PR creation; no authenticated push is available in the current session.
2. Separately approve applying **only** the existing notification dismissal migration to the correct production project. Use the approved migration workflow, preserve/reconcile its canonical migration history, and verify the column's type/nullability plus unchanged policies/grants afterward. Do not mark unapplied SQL as applied.
3. **Do not blindly run all pending migrations.** `20261121220000_chat_document_attachments.sql` is also absent live, and live `chat_media_kind_check` currently permits image/video/voice but not file. It is a separate feature prerequisite, not part of fixing the two reported errors. No attachment constraint was changed here.
4. After PR review and passing remote CI/preview checks, the owner approves merge and production promotion. Neither has happened.
5. Use a real signed-in test account to load/retry Notifications, clear its feed, confirm no private messages become read, save consented location and test Discovery actions. Do not inspect or mutate unrelated members for acceptance.
6. With controlled accounts/inboxes, test a confirmed duplicate signup and a new/unconfirmed signup through actual provider responses and email receipt. Synthetic passes alone are insufficient.
7. Recheck the live public crawl and the six exact Search Console examples. Request recrawl only where appropriate, then monitor actual coverage/search performance. Keep private surfaces private.

No production rollback is currently needed because no production change was made. Once the nullable column is approved/applied, leaving it in place is safer than dropping data on an application rollback; older code ignores an extra nullable column.
