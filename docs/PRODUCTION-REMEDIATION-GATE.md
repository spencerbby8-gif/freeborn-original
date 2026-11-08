# Production remediation gate — prepared, not executed

This is the exact change sequence required after explicit owner approval. It is not a claim that Production has been repaired. No credential values belong in this document.

## Current boundary

- Production application health remains failing until a fresh external check proves otherwise.
- Production Supabase management access is not available to the connected remediation account.
- The isolated Preview uses project `paskturljojjopxhnrik`; it must never receive Production pooler, Auth-admin, engine, operator, TURN, FB-14, or FB-15 credentials.
- PRs #23, #31, and #32 must remain open and unmerged unless the owner separately changes that instruction. FB-15 Production cron remains paused.

## Approval-gated change and affected systems

### 1. Authorized read-only Production inventory

**Affects:** Production Supabase metadata, Vercel metadata, GitHub Actions configuration, and any other known database consumer. No writes.

- Restore read access for an authorized auditor.
- Export `supabase_migrations.schema_migrations`, the complete catalog, RLS/policies/grants, Storage metadata, Auth provider settings, and scheduled-job definitions.
- Inventory every consumer of the existing pooler credential, including CI and legacy applications. The inspected `freeborn-web` Vercel project currently has zero environment variables; do not infer other consumers from that alone.
- Compare the Production catalog with the reviewed clean Preview. Classify every difference as recovered history, intentional Production state, or a forward-fix requirement.

### 2. Append-only Production forward migration

**Affects:** Production schema only after separate migration approval.

- Include the reviewed `supabase/migrations/20261108000000_fix_profile_update_noop.sql` forward repair: the former trigger returned `OLD` for non-legacy-JWT updates, silently discarding ordinary member and runtime profile writes. Confirm ordinary writes persist and privileged member fields remain denied.
- Prepare any additional timestamped migration containing only reviewed differences. Never run `supabase/clean-start/`, never reset `public`, never truncate migration history, and never rewrite or reapply applied migrations.
- Record object-level impact, rollback implications, required locks, and expected row counts.
- Test that exact forward migration against a disposable copy of the authorized Production catalog, then run positive/negative application acceptance.

### 3. Coordinated credential and verified-TLS repair

**Affects:** Production Vercel `SUPABASE_TRANSACTION_POOLER` and `DATABASE_CA_CERT`, plus every inventoried credential consumer.

- Rotate or replace the invalid Production database credential only after all consumers are known.
- Move the application to the reviewed purpose-built runtime role after proving every required server-owned function against the Production-derived test copy.
- Store the new DSN only as a sensitive Production-only Vercel variable. Store the official Supabase CA separately. Do not put CA or passwords in source or logs.
- Update other authorized consumers atomically where possible. Do not copy these values into Preview or Development.

### 4. Reviewed deployment and external acceptance

**Affects:** Vercel Production deployment only after explicit deployment/promotion approval.

- Deploy the exact reviewed commit whose static, migration, and hosted Preview gates passed. Record the full commit SHA and immutable deployment ID.
- Do not deploy a diagnostic build. Do not promote merely because Vercel reports READY.
- Require externally observed `/api/health` HTTP 200, successful real `SELECT 1`, authorized synthetic read/write cleanup, Auth/onboarding/profile/photo/match/message/media/Realtime/deletion acceptance, and negative authorization checks.
- Verify operator-gated AI health with an authorized operator session and sanitized status/latency/model evidence. Do not expose prompts, images, credentials, or provider error bodies.

### 5. Provider controls and scheduling remain separate approvals

**Affects:** Production Auth and abuse controls; no scheduling change is authorized here.

- Align provider password policy with the application's 12-character rule, enable provider HIBP where supported, and configure CAPTCHA/Turnstile server+client values together. Test direct-provider and application positive/negative paths.
- Keep FB-15 Production cron paused. Reactivation requires a separate owner decision after a read-only eligibility/backlog review and worker verification.

## Prepared rollback boundary

A database credential rotation or migration can affect every consumer and may acquire locks. No automatic rollback, credential rotation, Production migration, deployment, or promotion is authorized by this runbook. Any such action requires its own explicit approval and an inventory-specific rollback plan.
