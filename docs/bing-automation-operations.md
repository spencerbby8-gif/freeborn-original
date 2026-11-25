# Bing evidence and search automation — review package

## Scope and deployment status

Prepared against canonical main `8e7dea489d996e66b54598fd6561efc04f678c7c`, independently matched to the latest READY production deployment returned for Vercel project `freeborn`. Vercel records that commit as the merge of PR #95. This work does NOT merge, push, redeploy, change production variables, alter a database or enable schedules in the hosted repository.

The new workflows are local proposals, gated OFF unless owner variables are explicitly set to `true`. Full hosted GitHub Actions execution, cache persistence, scheduled delivery and notifications remain untested. YAML parsing is not an actual Actions run. No application source or four bottom tabs changed.

## Confirmed authenticated Bing observations

- `GetUserSites`: canonical `https://freeborndating.com/`, `IsVerified: true`.
- `GetFeeds`: `https://freeborndating.com/sitemap.xml`, `Status: Success`, `UrlCount: 16`. The API's LastCrawled value decodes to `2026-11-25T04:36:16Z`. The old screenshot's 10-versus-live-16 discrepancy is resolved in this API response; no sitemap resubmission was needed.
- `GetCrawlIssues` and `GetBlockedUrls`: empty lists. These are scoped API observations, not proof that all possible Bing policy/quality/security issues are absent.
- `GetCrawlStats`: returned dates November 18–24, 2026; `CrawledPages: 5` on November 19 and zero on other returned days; every returned row says `InIndex: 0`. These historical counters are not a complete current URL-level inspection.
- `GetRankAndTrafficStats`: returned November 17–23 rows have zero impressions and clicks; `GetPageStats`: empty. Not evidence of traffic growth.
- `GetUrlInfo` for seven samples: unset .NET minimum dates, `HttpStatus: 0`, `DocumentSize: 0`. `IsPage: true` does NOT mean indexed. Zero HTTP status is not a real network status code or proof the production page failed. This legacy API response provides no specific modern exclusion reason.
- `GetUrlSubmissionQuota`: DailyQuota 99, MonthlyQuota 599 at observation time. Not a target to consume and not an indexing SLA.
- Crawl boost unavailable; no boost or crawl-rate changes made.

Recorded response/network clocks are preserved in evidence; they are not an indexing promise.

## Actual diagnostic fetch, clearly distinguished from indexing

Exactly one `FetchUrl` POST requested an on-demand homepage diagnostic. HTTP 200 with `d: null` acknowledged it. Follow-up `GetFetchedUrls` returned `Fetched: true`, `Expired: false`; `GetFetchedUrlDetails` returned `Status: Completed`, and its document reports `Last-DownLoad-Http-Code: 200`, `Document-Length: 58487`, `Truncation: 0`.

This is Bing's authenticated diagnostic fetch, stronger than our simulated Bingbot user agent. It does NOT prove normal scheduled Bingbot crawling, inclusion in the search index, DuckDuckGo coverage, or ranking. No additional IndexNow batch or general SubmitUrl batch was sent this turn.

## Existing setup vs new proposal

Production already has a public key, manual explicit-path `indexnow-submit.mjs`, sitemap, public crawlability, and a daily read-only `public-crawl-health.yml` definition. A repository workflow definition alone does not prove its schedule has run. There was no automatic IndexNow trigger in the checked canonical workflow files. Vercel's returned project record showed an empty cron definitions list; this does not rule out unrelated external services.

### New public change notifier

- `scripts/seo/search-notify.py`: Python standard library; no package install required.
- Uses exact editorial `INDEXABLE_PATHS`, currently 16. Does not submit member profiles, cities based on member counts, chats, auth/app/api routes, tracking URLs or arbitrary URLs.
- Fetches canonical production only, refuses redirects, validates robots permission, sitemap membership, HTTP 200, content type, canonical and indexing directives, substantial server-rendered main text and title.
- Fingerprints title, description, main visible text and main links. Ignores build/runtime scripts, CSS classes and non-content shell changes. It is not a complete visual/semantic diff: structured-data-only, image/alt-only and other changes outside this fingerprint require the existing explicit-path operator process after actual change review.
- Requires explicit first baseline. Baseline sends NOTHING. Scheduled missing/corrupt state blocks rather than silently resending the website or forgetting history.
- Uses the existing separate PUBLIC IndexNow key, verifying local and live file match. It does not depend on the temporary Bing account API credential.
- Sends one participating endpoint only, and only meaningful added/changed public fingerprints. Successful 200/202 advances fingerprints, while retaining the receipt vs key-validation distinction. It never claims indexing.
- Saves a pending marker BEFORE network submission. Timeouts, interruption and ambiguous server failures block blind retries. Explicit 400/403/422/429 rejection retains old accepted hashes, reports failure, and leaves retries to a later run/operator; there is no tight retry loop. Requests have a 30-second timeout.
- Removed inventory entries require manual review; the script does not infer deletion from temporary failures or submit removals automatically. For genuine approved redirects/deletions, use a separately reviewed protocol notification. No fake lastmod edits or content generation.
- `.github/workflows/search-notifications.yml`: hourly observation on default/main branch when explicitly enabled. Earliest detection is the next actual successful run, not guaranteed instant. GitHub scheduling can be delayed or disabled on inactive public repositories.
- Concurrency serializes workflow runs; do not run a second notifier outside this state/lock boundary. Hash state uses Actions cache plus a 90-day artifact backup. Cache is NOT permanent storage: eviction causes safe blocking and requires recovery/review. For higher durability, migrate state to an approved durable store in a separately reviewed change.

### New read-only Bing monitor

- `scripts/seo/bing-monitor.py` reads six documented API methods, never submits or changes settings. API errors, missing sitemap success, reported zero index counters and reported crawl issues/blocks surface through a failing workflow plus report artifact.
- `.github/workflows/bing-diagnostics.yml`: weekly/owner-manual runs, OFF by default. Set `BING_MONITOR_ENABLED=true` and add a NEW durable `BING_WEBMASTER_API_KEY` repository secret privately if the owner wants ongoing diagnostics.
- The temporary credential supplied in chat was used in memory only, NOT saved in source, reports, workflows, Git config or hosted environment variables. Revocation stops future use of that credential. IndexNow change notifications use their separate existing key and can continue without this API key.

## Activation (requires owner approval and repository write access)

1. Review/apply the supplied patch to current canonical main in a branch; if main has advanced, review the diff rather than replacing the source tree. Run tests and repository CI, then owner approves merge under standing release policy. The downloadable patch is NOT an opened PR.
2. Keep changes initially OFF: do not set the enable variables during review. The notification scripts have unit tests and live read-only evidence, but no new hosted notifier has run.
3. After approved merge, set repository Actions variable `SEARCH_AUTOMATION_ENABLED=true`. Run **Public search change notifications** manually on main with **initialize_baseline=true** exactly once, after reviewing prior submission receipts. This records current live pages, not historical re-submission. Verify run artifacts and that `submitted` is zero.
4. On the next real approved editorial content update, check the run actually detects the deployed change and receives 200/202, then compare later Bing crawling/indexing separately. Do not manufacture website edits merely to exercise a submission.
5. Optionally add a fresh durable Bing API secret privately, enable `BING_MONITOR_ENABLED=true`, and run its diagnostic workflow. A zero-index warning is an honest alert, not a broken credential. Never paste a secret into a workflow file, NEXT_PUBLIC variable, frontend bundle or public issue.
6. Ensure repository Actions failure notifications are enabled in the owner's GitHub notification settings. A failed job is not proof an email was delivered. Review the artifact; do not suppress the warning just to get a green check.

## Recovery and shutdown

- Disable `SEARCH_AUTOMATION_ENABLED` to stop notifier runs; disable `BING_MONITOR_ENABLED` to stop diagnostics. Existing application pages are unaffected.
- On cache loss, download the latest successful state artifact and recover it through an approved workflow change. Alternatively initialize a fresh baseline manually ONLY after comparing prior/current hashes and receipts; this can miss intervening changes, so review before doing so.
- On pending/uncertain submission, inspect the saved pending URLs/hashes, receipt and Bing IndexNow UI. If delivery is confirmed, manually advance accepted hashes from pending and remove pending; if it is confirmed rejected, clear pending without advancing. If uncertain, keep blocked. Never blindly delete pending state and resubmit.
- The workflow cache uses new run/attempt keys. A recovery dispatch must restore the reconciled state into the same cache namespace. Do not commit runtime state to the public app or change cache version merely to bypass a pending marker.
- No tool can keep a site 'forever indexed'. Ongoing content quality, security, uptime, real inbound links and engine selection still matter. This package makes notification and diagnostics testable, not rankings guaranteed.

## Verification performed

27 unit tests pass, including mocked 200/202, rate-limit rejection, ambiguous failure persistence, no-repeat, noindex/canonical checks, private-input rejection, and credential-safe error handling. A production baseline read all 16 editorial pages and sent nothing; a second production dry run detected no changed fingerprints and sent nothing. Existing public crawl-health audit passed with zero failures. Python compilation, workflow YAML structure parsing, and `git diff --check` passed. Full app build and hosted workflow integration have not been rerun for these Python/workflow-only additions.

Official references:
- https://www.bing.com/indexnow/getstarted
- https://www.indexnow.org/documentation
- https://www.indexnow.org/faq
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi?view=bing-webmaster-dotnet
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.fetchurl?view=bing-webmaster-dotnet
- https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getfetchedurldetails?view=bing-webmaster-dotnet
