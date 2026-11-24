# Measurement and controlled release — Builds 8–9

## Current scope and honest status

The tools in `scripts/growth/` run locally and offline. They do not connect to Google/Bing, install analytics, collect signup events, deploy, submit URLs, create a PR or send outreach. The supplied no-data report is intentionally **unavailable**, not a zero-traffic baseline. A passing synthetic test is not actual acquisition evidence.

Content Builds 3–7 can be reviewed locally. Build 8's actual baseline and Build 9's actual approved release/observation remain blocked on external evidence and permission. No local script grants permission to publish.

## Build 8: data contract

First obtain authorized, period-matched aggregate exports from the actual Google Search Console and Bing Webmaster Tools properties. Record the property, exact filters, timezone, period, export date, owner who exported, and any row limits in a private operator ledger. Do not put account identifiers, tokens or personal member information in this repository. This importer does not authenticate the exporter/property or independently verify provenance.

Use a bounded CSV with a header and counts. Native aliases include:

- Google query export: `Top queries,Clicks,Impressions,CTR,Position`.
- Google page export: `Top pages,Clicks,Impressions,CTR,Position`.
- Bing keyword export: `Keyword,Clicks,Impressions,CTR,Average position` (plural Keywords and Query also supported).
- Normalized: `query,page,date,clicks,impressions,country,device,ctr,position`; not every dimension is required. Clicks/impressions and at least query or page are required.

Only the aliases in `measure.py` are accepted. A different native export must be inspected and normalized deliberately, not silently guessed. Do not combine query totals and page totals into one export or add overlapping dimensions/periods. Missing query cannot be called nonbrand; missing page cannot be attributed to a page. Query-only exports cannot establish that traffic reached the new guides. The name/domain-variant classification is a heuristic, not perfect semantic brand recognition. No raw queries, country/device values or individual records are copied to output. Raw inputs can still contain sensitive search text; use only permitted aggregate data, keep inputs private, and delete temporary copies under an approved retention policy.

Search counts cover exported rows, not necessarily property totals: privacy filtering, omitted rows, export limits and lag matter. CTR is recomputed from supplied counts; no average position is invented. This is not bot/human certification or causal attribution.

Completed signup aggregates require **exactly**:

```csv
date,event,channel,page,count
```

No example production count is supplied. `event` must be `signup_completed`, defined by the operator as a server-confirmed completed account/profile milestone. Document the exact milestone and deduplication window before exporting. A click, auth-form view, OTP request, signup start or onboarding start is **not** a completed signup. The CSV's event label alone cannot prove the underlying implementation; review the source separately.

Allowed channels: `organic_unknown`, `referral`, `direct`, `unknown`. Search signups are not labeled nonbrand without a defensible authorized attribution method; unknown remains unknown. Page may be empty when unavailable, otherwise it must be an allowlisted canonical editorial path. Query strings, fragments, private/member/API routes and arbitrary domains are rejected. Do not include email, user/account IDs, IPs, health/verification declarations, location coordinates, messages, bios, selections or session identifiers. No tracking payloads are introduced by this build.

Counts must be nonnegative integers. Duplicate dimension rows, ambiguous aliases, malformed dates, extra fields and clicks above impressions are rejected. Inputs are limited to 10 MB/100,000 rows each. Local reports include source-file SHA256 identity, not a signature or provenance guarantee. Reports remain `readyToClaimGrowth: false`, including genuine imports: interpreting results still requires human review.

### Running measurement

From the repository root, Python 3, no additional Python packages:

```sh
# Real current state: missing exports, not made-up zeros
python scripts/growth/measure.py --output=/path/to/measurement.json --html=/path/to/measurement.html

# Only after obtaining permitted real aggregates; paths below are operator-supplied
python scripts/growth/measure.py --gsc=/private/google.csv --bing=/private/bing.csv \
  --completions=/private/completions.csv --start=YYYY-MM-DD --end=YYYY-MM-DD \
  --output=/path/to/measurement.json --html=/path/to/measurement.html
```

Use `--synthetic` for demonstration data. Synthetic reports cannot clear the release measurement gate. The reviewer requires exactly one Google export, one Bing export and completion aggregates with identical valid start/end periods and source-file identities; duplicate-engine exports do not qualify. Both dates must be supplied together. Malformed/truncated CSV rows are rejected. Report outputs cannot overwrite input CSV/evidence files or one another, and invalid CLI inputs clear older output reports rather than leaving a stale pass. Compare equivalent reporting periods only after lag settles; do not compute signup conversion from unrelated search-click and completion totals. No real collection/retention/provider choice is approved by this document. Any future instrumentation needs an explicit privacy/security review first.

## Build 9: fail-closed manual review

```sh
# Node 24 and project dependencies required. Fixed local lint/type/build/contracts checks.
python scripts/growth/validate-quality.py --output-dir=/path/to/quality
python scripts/growth/contracts.py --output=/path/to/growth-contracts.json
EDITORIAL_EVIDENCE_DIR=/path/to/evidence node scripts/seo/editorial-browser.cjs

python scripts/growth/release-review.py \
  --quality=/path/to/quality/quality.json \
  --browser=/path/to/evidence/editorial-browser-results.json \
  --contracts=/path/to/growth-contracts.json --measurement=/path/to/measurement.json \
  --path=/guides/meet-without-apps --path=/guides/scam-spotting \
  --output=/path/to/release-readiness.json
```

The browser suite expects a local **production build** on port 3002, not a live external site; start with `npm run start -- --hostname 0.0.0.0 --port 3002` after building. No account form is submitted. Older Build 1/2 browser regressions have separate evidence-directory environment variables (`VALUES_EVIDENCE_DIR`, `FREE_DATING_EVIDENCE_DIR`).

Exit 2 from `release-review.py` means blocked or invalid input, not a deployment failure. Exit 0 means only `ready_for_manual_release_review`; `released` remains false, `networkCalls` remains zero and no notification is sent. Selected notification paths must be public allowlisted editorial paths. A notification receipt would not prove indexing, ranking or traffic. Google is not an IndexNow participant.

A real owner may separately supply `--approval=/private/approval.json` containing `releaseApproved: true`, a named `reviewer`, current timezone-aware ISO `approvedAt` (within seven days), and `sourceFingerprint` from `fingerprint.py`. Each of the following `gates` must contain `attested: true` and an actual nonempty `evidenceRef`:

1. `providerLegalReviewed`
2. `physicalDevicesValidated`
3. `productionFlowsValidated`
4. `measurementPrivacyReviewed`
5. `consoleOwnershipAndExportsReviewed`

No approval template prefilled with true values is included. A human attestation is explicitly **not independently verified**. Do not manufacture approval/evidence references or treat the tool as legal, device, backend, RLS or biometric certification. The source fingerprint now hashes Git-tracked plus non-ignored working-tree files, excluding documentation (`docs/` and `.md`) and environment secrets. It includes public assets, workflows, all test scripts and build configs. It is still only local file identity, not a cryptographic attestation of the runtime, database, CI origin or deployment. Keep logs/immutable hashes with the release record; local artifacts can be altered by anyone with filesystem access.

### Actual release and observation checklist — NOT performed

1. Review the exact diff and external gates; get explicit release approval and agree on preview/production scope. Existing no-publish instructions remain in force.
2. Run hosted CI and approved real-account/provider tests in the correct environment. Record actual device/browser versions and two-device call/media results where relevant. Do not substitute emulation or fake camera for physical-device/biometric evidence.
3. If authorized, create/review/merge/deploy through the project's normal workflow, recording actual commit and deployment IDs. No direct production healer/database writes.
4. Read-only verify the actual deployed content, HTTP statuses, canonicals, robots, sitemap, private exclusions, signup path and no unsupported health badge. A local build does not establish this.
5. Only if separately authorized, notify selected changed public URLs through supported methods. No repeated requests to force rankings; no dating use of Google's jobs/livestream Indexing API. Do not submit private/profile/health directories.
6. Observe real console discovery/indexing/query/page data. Indexing and ranking are different; HTTP 200 or a submission receipt proves neither. No fabricated audience density.
7. At day 7 and day 28 **after actual release**, compare comparable periods and write what is known, unavailable, or contradicted. Prioritize useful page fixes and activation problems over expanding page count. A seven-day zero with actual data is different from missing data.
8. Permission-based outreach requires its own approval and actual useful context. No bulk spam, purchased traffic, unsolicited automated messages or fake reviews.
