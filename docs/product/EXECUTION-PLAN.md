# Freeborn — agreed direction and next gate

## User decision
Preserve the entire preceding product proposal exactly. Prioritize getting Freeborn working and completed before any further search submissions. Move toward Common Ground → Real Plans after checking the existing systems and resolving core blockers.

## Canonical vision
The verbatim proposal is saved separately as `freeborn-product-vision-exact.md`. Do not silently rewrite that original. Future revisions belong in separate documents.

## First gate: core product readiness
Record PASS / FAIL / NOT TESTED with evidence for:
1. Signup, confirmation, duplicate-account guidance, login, recovery and onboarding.
2. Discovery, preferences, location/time, real empty states versus errors, and own-profile preview.
3. Mutual likes, match creation, two-way chat, persistence and access control.
4. Notifications: actual supported delivery, read state and permissions; no unsupported closed-app guarantees.
5. Block, report, unmatch, account deletion, profile/media access restrictions and verification-data handling.
6. Deployment/CI/database alignment, migrations and realtime delivery.

Use two consenting test accounts in an isolated test environment where possible. Never message real members for testing. No production migrations, merges or promotions without explicit approval. Preserve existing four bottom tabs and earlier UI constraints.

## Read-only observations in this turn
- GitHub Actions run 45587639418 completed SUCCESS for commit 973cf1069338d23b5556d65fb4f1161ce93a86d6. Evidence: freeborn-audit/core-readiness/ci-readonly-status.json. This closes the previously unknown full-CI outcome, not production user-journey verification.
- Vercel latest listed production deployment dpl_5ayMhTiKE8kiV8fb9HJWnYwhNUmm is READY / PROMOTED, main commit 8e7dea489d996e66b54598fd6561efc04f678c7c (PR95).
- Supabase Freeborn project ihwtpwlszegrjgakqsxx is ACTIVE_HEALTHY. Health API reports auth, db, realtime, rest and storage healthy.
- Important caveat: realtime info also reports db_connected=false and replication_connected=false. Do not infer either working member-event delivery or a confirmed outage from the overall healthy flag. Verify with an authenticated controlled two-account test and configuration inspection.
- Infrastructure health and successful fixture CI do not prove the actual signup → discovery → match → chat journey works.
- No production writes, merges, migrations, deployments, notifications or search submissions performed in this turn.

## Build after the gate
Small pilot: optional everyday-values prompts; mutual Common Ground question in chat; consent-based date-plan card (format, budget, times and public place; accept/change/decline). No automatic booking or external sharing, home-address/live-location requirement, fake compatibility percentage or impersonated AI messaging. Keep four bottom tabs unchanged.

## Evaluate
Two-way conversations, mutually accepted plans, optional feedback about whether plans helped, and safety outcomes. Accepted plans are not proof that dates occurred. No dominance or ranking guarantees.
