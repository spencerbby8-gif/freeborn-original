-- Phase 5 Identity Consistency Layer: Tracking identity consistency between private verification selfies and public profile photos.

alter table public.user_profiles
  add column if not exists identity_consistency_status text not null default 'ready',
  add column if not exists last_consistency_checked_at timestamptz;

alter table public.verification_selfie_checks
  add column if not exists identity_consistency_result jsonb not null default '{}'::jsonb;

alter table public.verification_audit_logs
  add column if not exists event_type text not null default 'SELFIE_VERIFICATION',
  add column if not exists compared_photos text[] not null default '{}',
  add column if not exists consistency_confidence numeric not null default 0,
  add column if not exists reverify_required boolean not null default false;

create index if not exists verification_audit_logs_event_type_idx
  on public.verification_audit_logs (user_id, event_type, created_at desc);
