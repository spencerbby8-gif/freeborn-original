# Freeborn — policy, alerts, PWA and search audit

Review date: 21 November 2026. Local branch: `feat/discovery-settings-polish`.

## Release status

**Local implementation and evidence only. No push, new PR, merge, deployment, production database mutation, new production account or real search-engine submission was performed.** Production remains on `bba01dcf718fca4ed3c26686ed9c75e88753e938`, not this working branch. The supplied GitHub credential was not used or saved.

This is a substantial implementation pass, **not certification that every Freeborn subsystem is operational or that every policy statement has been independently verified**. Remaining release gates are listed below.

## 1. Agreed health-status policy

The owner selected **COVID-19 vaccines only** and **keep the health badge off**.

- Optional declarations remain available for classification and discovery filtering. The filtering, audience, block and suppression rules were not relaxed.
- Neither self-report nor face verification grants an unvaccinated badge. The discovery eligibility function returns false for every combination. Both current and legacy badge/tip components render nothing. The profile editor's decorative unvaccinated chip was removed.
- Onboarding and the profile editor explain COVID-19 scope and self-report. The landing FAQ and legal copy explicitly state that no health badge is currently issued. The blue selfie/profile verification badge remains distinct.
- Existing declarations predate the clarification and have **not** been retroactively certified as COVID-specific. Policies disclose that limitation. No production data was rewritten. A future structured re-confirmation/versioned-consent migration would be needed to prove which members accepted the new wording.
- No medical-record upload system, antibody test, document-review queue or supposed proof of “never vaccinated” has been invented. Identity and absent records do not establish a lifetime negative claim.

Evidence: `src/lib/discovery-presentation.ts`, retired badge components, onboarding `steps-b.tsx`, profile editor, landing FAQ and legal documents. Eight badge-state combinations are included in 20 presentation contracts; browser fixtures include identity-approved self-reported unvaccinated women and men with no health badge.

## 2. Notifications: actual defects fixed

Previously, the alert center silently marked all historical events seen on mount, emitted zero unread, and used only events fresh in the current poll for its counters. That allowed a real new-event count to disappear on the next poll. The current Discover notification control also had no rendered alert count.

Implemented:

- Persistent, account-scoped **browser-local** delivered/read event receipts; polling and remounting no longer acknowledge unseen history.
- Event revisions include timestamps, so another unread message in the same conversation is not swallowed by a stable thread ID. Verification state changes also have distinct receipt identities.
- A bell and count on Discover; existing Likes/Messages counts remain connected. New events can show visible banners with a polite live region. Historical events count but do not replay a burst of sounds on initial load.
- Viewing the feed acknowledges feed events; visiting Likes acknowledges likes. Feed acknowledgement does not write a private message read receipt. Server message-unread counts are no longer cleared merely because the Messages tab was opened.
- Clear-all still uses the authenticated server dismissal endpoint and triggers a counter refresh. It does not delete private messages.
- Browser alerts use the real flame icon, not a verification-pose photograph.
- The notification settings screen no longer offers an unwired “Profile activity” switch. Like, match and message preference switches remain real authenticated writes. The stored legacy profile-activity preference remains backward-compatible but is not represented as a working alert source.

Limits: polling is approximately every eight seconds while the page runs, subject to browser suspension/network availability. Sounds require browser permission/user interaction. **Closed-app Web Push is not implemented.** Feed receipts are bounded to 2,000 event identities per receipt set, remain on this browser, and do not synchronize across devices; clearing site data resets them. Message-read state is separate and server-backed. No live two-member notification delivery or physical-device OS alert has been certified.

## 3. Policies aligned with observable functionality

Legal copy version 1.3 corrects or narrows claims concerning:

- Health declarations, absent health badges and the separate automated blue verification seal.
- Date-of-birth checks: validating a date/minimum age cannot establish the truth of the supplied age.
- Scoped JSON export: it excludes verification selfies/media binaries and is not an exhaustive operational-record archive. Access requests for omitted personal data remain a contact process.
- Deletion/retention: pending cleanup and provider backups are not immediate erasure from every system.
- Review: uncertain cases may remain pending; human review is not automatic or guaranteed within a fixed time.
- Selfie retention and cleanup limitations, configured call connectivity providers, browser storage receipts and the absence of closed-app push/offline caching.
- Health-field withdrawal is through profile editing; verification withdrawal has its own settings route.

**Not legal advice or a legal-compliance certification.** Business identity, processor agreements, provider retention, data-subject request handling, cross-border transfer safeguards and claims of no advertising/sale require operator records and appropriate legal review. The existing policy discloses serious AI-provider/relay agreement concerns and an HTTP IP-reputation lookup. Those concerns have not been solved by rewriting text and must not be represented as remediated.

## 4. Connected project and live public evidence

Read-only connectors identify Supabase **Freeborn / `ihwtpwlszegrjgakqsxx`**, us-east-1, reporting auth/database/realtime/storage healthy. RLS is enabled on the six inspected member tables. That is not a hosted authorization test. The realtime service response did not demonstrate an active replication/client connection.

Vercel project `prj_3Y6fEI3YedWsffXGHXWPwesu7BOL` has production deployment `dpl_8s7zrxW1aXvRzzc9wBuwAg5ibdaz`, READY/PROMOTED on main `bba01dc`. Both apex and www domains are verified; www redirects to `freeborndating.com` with 308.

Anonymous HTTP evidence confirms the homepage, terms/privacy/safety, guides and alternatives return 200 with canonical public URLs and indexable metadata. `/auth` and `/app` carry noindex. Robots and sitemap are available. **These observations concern the existing production deployment, not deployment of this patch.**

## 5. Search reach: implementation, not ranking promises

The code already had server-rendered public pages, self-canonicals, robots exclusions for private member surfaces, an editorial sitemap, a qualifying-city gate, guides, alternatives content and an IndexNow key. Adding thousands of bot names or billions of keyword combinations would not create index coverage.

This pass:

- Broadens the homepage title to “Intentional Dating & Shared Values,” retaining legitimate health-autonomy content without making the entire product a medical-status badge.
- Uses honest editorial last-modified dates for pages actually changed in this pass.
- Makes IndexNow submission **explicit and change-based**: `--submit --path=/terms` is required. A default invocation cannot resend the whole inventory. Private/unknown paths are rejected, duplicates removed, and requests time out. Dry runs and tests do not send anything. Receipt is expressly not crawling/indexing/ranking proof.
- Adds `scripts/seo/crawl-health.mjs`: read-only checks for public status/title/canonical/noindex/sitemap consistency, private-route noindex and robots privacy exclusions.
- Adds a daily 08:23 UTC GitHub Actions health workflow, manual dispatch and 30-day evidence artifacts. **It is only local code until published to the default branch; no scheduled run, alert subscription or nonstop external monitoring is active from this work.** Workflow failures can be observed through GitHub Actions; no Slack/email delivery was configured here.

The current production public crawl-health run passed. No keyword rankings, traffic increase, engine indexing count or fresh verified crawler visit has been established. Search Console and Bing ownership/index reports were not available through connected tools. A Bing verification meta tag in source is not proof of a verified console property.

### Engine coverage and primary-source research

| Surface | Legitimate route | What remains unverified |
|---|---|---|
| Google | Public crawlability, canonical URLs, sitemap and verified Search Console reports/URL inspection | Ownership, sitemap submission status, coverage, manual actions and performance |
| Bing | Public crawlability, Bing Webmaster Tools, sitemap, changed-URL IndexNow | Console verification, submission receipt and indexed URLs |
| DuckDuckGo | Its documentation says traditional links largely come from Bing, alongside its own crawler/indexes | No automatic ranking/index guarantee from Bing work |
| Brave | A real public URL re-fetch form was fetched at `search.brave.com/submit-url`; do not invent a webmaster API | No submission or index coverage confirmed |
| Yandex | Exact-host ownership, canonicalization, sitemap and IndexNow | Property verification and regional coverage |
| Naver | Search Advisor ownership, crawlability, sitemap and IndexNow | Ownership and Korean-market relevance/localized content |
| Seznam | Standard links, sitemap, submission form/IndexNow | No actual submission or Czech index status checked |
| Baidu | Search Resource Platform and selective crawl/index processing | Account verification, current submission access and useful Chinese localization |
| Apple search surfaces | Applebot crawlability/robots/metadata; Applebot-Extended is a separate training control | No guaranteed Siri/Spotlight inclusion |
| Other/regional engines | Standards-based crawlable useful public content; investigate real operator interfaces per market | Do not claim a universal submission API or every-engine coverage |

The current city-page gate requires at least five qualifying non-QA members and has an explicit region allowlist (US, Europe and selected Asian markets). It is **not global city coverage**; Nigeria and other regions are excluded by inherited policy. That scope was not silently overridden or populated with fictitious members. Global expansion requires an owner-approved market policy and genuinely useful localized content, not city doorway pages.

Primary pages fetched during this review:

- https://developers.google.com/search/docs/essentials/technical — technical eligibility, not guaranteed inclusion.
- https://developers.google.com/search/docs/essentials/spam-policies — keyword stuffing, doorway and scaled-content abuse.
- https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a — useful content, crawl signals, sitemap and change notifications.
- https://www.indexnow.org/documentation — 200/202 are receipts, not indexing proof.
- https://www.indexnow.org/searchengines.json — current participant registry, not a promise of ranking across all engines.
- https://duckduckgo.com/duckduckgo-help-pages/results/sources
- https://search.brave.com/submit-url
- https://webmaster.yandex.com/site/optimization/seo-guide/?section=INDEXING
- https://searchadvisor.naver.com/guide/seo-basic-intro
- https://o-seznam.cz/napoveda/vyhledavani/nejcastejsi-dotazy/
- https://ziyuan.baidu.com/wiki/640 — older official sitemap guidance; current console access still needs checking.
- https://support.apple.com/en-us/119829
- https://www.cdc.gov/iis/contacts-locate-records/index.html — records are jurisdiction/provider based; no universal CDC vaccination history.

Forum research was secondary: search snippets surfaced conflicting Brave submission advice, resolved by fetching the actual Brave form. A Reddit indexing-delay thread returned HTTP 403 on full fetch; its full discussion was not reviewed. Forum anecdotes do not establish crawl timing, ranking guarantees or a medical evidence standard.

## 6. Flame assets and legacy/wiring inventory

The PWA 192/512 PNGs, maskable 512 icon, Apple touch icon and favicon now derive from the exact landing `BrandMark` flame paths/gradients. The maskable icon keeps the mark inside its safe zone. SVG/PNG source matching and dimensions are tested. OS-installed icons can remain cached; a local asset change is not evidence of a production home-screen update.

The route inventory covers 25 member page files. Current routes use reference-native screens or the native-styled chat/editor/verification integrations. Legacy component files still exist and were not indiscriminately deleted. Browser checks exercise settings/legal wrapping, notifications, chat/media/calls, viewer controls, onboarding and landing; they are not a proof that every possible state on every device has been visually reviewed.

AI wiring exists through `callEngine` in moderation/identity/verification and the operator-gated health endpoint. Its previous “single-engine degradation” explanation contradicted its no-badge fail-closed path and was corrected. Synthetic probe success is not described as real identity verification.

**Production engine blocker:** Supabase contains one recorded engine-health check, dated **3 November 2026 19:17:55 UTC**: database true, engine 1 fail, engine 2 fail. This is historical, not a current outage verdict. No fresh authenticated production check was possible with the current session. Do not claim either engine is now functioning. A new operator probe, provider agreement/configuration review and consented functional acceptance remain necessary.

## 7. Evidence and tests for this pass

- Production build, lint and TypeScript: pass on Node 24.
- Browser suites against the final local production build: **143 checks, zero page errors**: discovery/settings/alerts 26, media/onboarding 38, compatibility 44, landing 35.
- Notification receipt contracts: **17** pass.
- Presentation/badge contracts: **20** pass.
- Discovery/filter/privacy logic with substituted adapters: **32** pass.
- IndexNow/icon contracts: **14** pass; every submission mocked/no real engine write.
- Trust/security harness: **624/624** pass.
- Live public crawl-health check: pass; separate from index coverage.

One concurrent compatibility run stopped at a 7-second font-ready screenshot timeout, before producing a result file. Screenshot-only timeouts were increased to 20 seconds; behavior/assertion timeouts and geometry requirements were unchanged. The subsequent full run passed 44/44. Logs and result JSONs distinguish the final successful run; this is not hidden as product acceptance.

Evidence directory: `/home/user/freeborn-audit/policy-discovery/`. It contains connector summary, live HTTP audit, crawl-health JSON, route inventory, result JSONs, screenshots and logs. Local fixtures/fake media never prove hosted RLS, email delivery, hardware biometrics, a connected two-device call or real medical status.

## Remaining gates before release

1. Fresh authenticated operator engine-health check and resolution of any current provider failures; verify provider contracts/retention before processing sensitive images.
2. Owner-confirmed Search Console/Bing property access or redacted exports: ownership, sitemap status, representative URL inspections, coverage/manual-action reports and baseline search performance. Optional Yandex/Naver/Baidu/Seznam access for selected markets.
3. Decide whether to expand the inherited regional city-page policy. Do not equate public English pages with globally localized availability.
4. Real two-account/two-device notifications, calls and hosted authorization acceptance; OS/PWA installation checks after an authorized preview/deploy.
5. Operator/legal verification of remaining organizational/processor/retention claims. A policy text audit cannot supply missing agreements or guarantee compliance.
6. Product decision if cross-device feed-read synchronization or closed-app push is required; neither is represented as delivered.

**Do not open a new PR or deploy on the basis of this report alone.** Review these local changes and resolve the external evidence gates first, in line with the owner's instruction.
