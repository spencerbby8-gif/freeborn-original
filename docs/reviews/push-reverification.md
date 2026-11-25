# Pre-push cross-check: member fixes and Bing metadata

## Scope and approval boundaries

Reviewed against fetched `origin/main` at `00c6a65482fbae0ed2ad901a25c8fbcc4bd1532a`.
The two previously unpushed commits were `ceb0823` (member/signup/GPS/error handling/filter hint) and `0f4fa1b` (Bing description repairs). This review adds a corrected regression contract and this evidence summary.

Push is to the review branch `fix/member-errors-signup-seo`; no merge or production promotion is authorised by this review. No production database migration or search-engine submission was executed. Historical reports saying “not pushed” describe their earlier snapshots; use GitHub branch/PR state for delivery status after this review.

The separate old prototype checkout was found to contain 135 dirty/untracked entries on an older branch. It is preserved untouched, not overlaid on current main. Blindly pushing it would include stale rewrites and deletions, not just the approved pending fixes. No files from that dirty checkout were silently discarded.

## Additional defect caught by this recheck

`test:discovery-privacy` still expected the suppression service failure to escape the handler as a rejected promise. The new safe API boundary deliberately returns HTTP 500 for that unclassified internal failure. The revised contract asserts HTTP 500, no profiles, a generic error with no upstream message, and a correlation ID. An added recovery assertion confirms normal discovery resumes after the injected failure is removed. This does not weaken the fail-closed privacy rule or change production behaviour.

## Fresh verification results

All listed PASS results were rerun for this review, not copied from an earlier delivery:

- Node 24.22.3; TypeScript, ESLint, production Next.js build: PASS.
- Secret scan, environment-isolation guard, migration validator: PASS.
- Runtime dependency advisory audit: **0 vulnerabilities reported**.
- Trust harness: **624/624** assertions PASS.
- Local PostgreSQL member runtime suite: **19** checks PASS, including missing-column `42703` and invalid location-source `23514` negative controls; migration replayed twice locally and test transaction rolled back.
- Member-auth suite: **8** checks PASS, including recreated-email negative control; substituted auth, local SQL only.
- Discovery actual-handler/local-SQL suite: **31** checks PASS; transaction rolled back.
- Discovery privacy contracts: **35** checks PASS after the corrected contract, including failure and recovery.
- Prototype API, chat/media, filter storage, device-clock/presentation, notification receipt, engine request, database TLS, TURN and evidence-safety contracts: PASS.
- Metadata contracts: **24 source assertions + 13 Python tests** PASS.
- IndexNow/icon contracts: **14** PASS, all submission calls mocked; no actual IndexNow submission.
- Local deletion queue: **27** PASS. Local retention: **165** PASS. Profile write-trigger suite: PASS.
- Local generated HTTP audit: **16** public pages, **0** findings in its bounded checklist. Includes actual response metadata, canonicals, public sitemap/link reachability, changed-description consistency, private noindex and anonymous member API 401 checks. Simulated Bingbot is not verified crawler evidence.
- Chromium sequential reruns: **16 public pages**, **18 signup/onboarding checks**, **26 discovery/settings checks**, all PASS; **0 uncaught page errors**. Member flows use intercepted fixture APIs, not hosted provider/RLS or physical-device verification.
- Initial concurrent browser attempts did contain failures/timeouts and one missing-main assertion. They were retained in the evidence folder, not relabelled as passes. Subsequent isolated sequential runs pass. The underlying cause of the concurrent instability is not established.
- A broader pose suite was also started; its initial 180-second invocation was interrupted before completion. Main mode passed, but that partial invocation is **not** an all-modes pass. A separate longer-running verification is recorded independently; consult its final log/CI rather than treating this document as a complete pose acceptance result.

## Unchanged constraints and remaining work

- Four-bottom-tab implementation `src/components/prototype/frame.tsx` is byte-identical to main. No rendering/security-header workaround was added to claim SEO success.
- Eleven descriptions shortened; five already-conforming descriptions preserved. `/free-dating`: **173 to 140 characters** locally. Meta, OpenGraph and WebPage descriptions align for the changed pages.
- Fresh live production audit still reports those **11 description-range warnings**. Branch publication is not deployment and must not be described as a live fix.
- Bing screenshots establish **Discovered but not crawled**, not the root cause of selection. IndexNow receipt is not crawl/index/ranking proof.
- Existing live IndexNow key hosting was verified separately; no key rotation or actual notifications were performed here.
- Notification migration `20261121210000_notification_dismissal.sql` is already tracked in main, not a missing unpushed file. Its production application remains separately approval-gated. The separate chat-document migration is not implicitly authorised.
- No private member records were read during the anonymous live recheck. Hosted auth, email, RLS and production member acceptance remain release checks.
- Six GSC exclusion URLs/reasons and the Bing sitemap dashboard count discrepancy remain unresolved without account-side evidence.

## Evidence location

Fresh detailed logs, initial failures, isolated successful reruns and HTTP JSON outputs are in the delivery evidence folder `freeborn-audit/push-reverification/`. Credentials are excluded; Git authentication must remain process-local, without token-bearing remote URLs, config entries or files.
