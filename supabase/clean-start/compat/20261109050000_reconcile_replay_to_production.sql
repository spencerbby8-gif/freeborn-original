-- Clean-start reconstruction reconciliation (replay-only; never run against Production).
--
-- The reviewed clean replay rebuilds the schema from recovered legacy migrations plus
-- reconstruction compat steps. A full catalog fingerprint against Production
-- (ihwtpwlszegrjgakqsxx) proved the reconstruction converges byte-for-byte on 8 of 10
-- catalog categories, but it drifted on a handful of column attributes, one performance
-- index, and two CHECK constraints that Production carries natively. Production is the
-- source of truth; this step closes that residual gap so a clean replay reproduces
-- Production's exact catalog. It runs immediately before the final verify_clean_replay
-- gate, which asserts the reconciled counts (126 public indexes, 81 public checks).
--
-- Every statement is guarded, so the step is idempotent and safe to re-apply.
--
-- Evidence: evidence/schema-reproduction-proof-20261109.md — validated on scratch replay
-- tqiyuqbyypidwvaawrgj (columns md5 a0ff915f41fdda1065a71f7bf2da0a45 MATCH, indexes 126
-- md5 dd0fa887f35f1e8831f73f739d9f14c8 MATCH after these nine fixes).

-- 1. CHECK reports_triage_check — Production definition, absent from the reconstruction.
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'reports' and c.conname = 'reports_triage_check'
  ) then
    alter table public.reports
      add constraint reports_triage_check
      check (triage = any (array['complete'::text, 'pending'::text]));
  end if;
end $$;

-- 2. CHECK vsrj_object_captured — Production definition, absent from the reconstruction.
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'verification_selfie_retention_jobs'
      and c.conname = 'vsrj_object_captured'
  ) then
    alter table public.verification_selfie_retention_jobs
      add constraint vsrj_object_captured
      check ((storage_path is null) or (storage_object_id is not null));
  end if;
end $$;

-- 3. Performance index reports_origin_status_idx — Production carries it.
create index if not exists reports_origin_status_idx
  on public.reports using btree (origin, status);

-- 4. user_profiles.vaccination_status is nullable in Production.
alter table public.user_profiles alter column vaccination_status drop not null;

-- 5. verification_selfie_checks.storage_path is nullable in Production.
alter table public.verification_selfie_checks alter column storage_path drop not null;

-- 6. mixer_venues.consent_recorded_at default normalizes to now() in Production.
alter table public.mixer_venues alter column consent_recorded_at set default now();

-- 7. moderation_actions.created_at default normalizes to now() in Production.
alter table public.moderation_actions alter column created_at set default now();

-- 8. account_deletion_requests unique index carries Production's name.
do $$
begin
  if to_regclass('public.account_deletion_requests_status_token_unique') is not null
     and to_regclass('public.account_deletion_requests_token_unique') is null then
    alter index public.account_deletion_requests_status_token_unique
      rename to account_deletion_requests_token_unique;
  end if;
end $$;

-- 9. human_challenges unique index carries Production's name.
do $$
begin
  if to_regclass('public.human_challenges_nonce_unique') is not null
     and to_regclass('public.human_challenges_nonce_key') is null then
    alter index public.human_challenges_nonce_unique
      rename to human_challenges_nonce_key;
  end if;
end $$;
