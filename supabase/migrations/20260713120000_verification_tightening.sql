-- Phase 4 Tightening: Unique verification challenges, rate limits, and private audit logs.

create table if not exists public.verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  pose_id text not null,
  gesture text not null,
  head_direction text not null,
  expression_cue text not null,
  challenge_token text not null unique,
  challenge_payload jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '15 minutes'),
  constraint verification_challenges_status_check check (status in ('active','consumed','expired'))
);

create index if not exists verification_challenges_user_token_idx
  on public.verification_challenges (user_id, challenge_token, status);

alter table public.verification_challenges enable row level security;

revoke all on public.verification_challenges from anon, authenticated;
grant select, insert, update on public.verification_challenges to authenticated;

drop policy if exists "Users manage own verification challenges" on public.verification_challenges;
create policy "Users manage own verification challenges"
on public.verification_challenges for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.verification_rate_limits (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  failed_attempts_window integer not null default 0,
  total_failed_attempts integer not null default 0,
  cooldown_until timestamptz,
  last_attempt_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger verification_rate_limits_touch_updated_at
before update on public.verification_rate_limits
for each row execute function public.touch_updated_at();

alter table public.verification_rate_limits enable row level security;

revoke all on public.verification_rate_limits from anon, authenticated;
grant select, insert, update on public.verification_rate_limits to authenticated;

drop policy if exists "Users manage own verification rate limits" on public.verification_rate_limits;
create policy "Users manage own verification rate limits"
on public.verification_rate_limits for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.verification_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  attempt_id uuid references public.verification_selfie_checks(id) on delete set null,
  challenge_id text,
  challenge_assigned jsonb not null default '{}'::jsonb,
  gemini_analysis jsonb not null default '{}'::jsonb,
  backend_decision text not null,
  internal_risk_score numeric not null default 0,
  failure_reasons text[] not null default '{}',
  retry_count integer not null default 0,
  in_cooldown boolean not null default false,
  cooldown_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists verification_audit_logs_user_idx
  on public.verification_audit_logs (user_id, created_at desc);

alter table public.verification_audit_logs enable row level security;

revoke all on public.verification_audit_logs from anon, authenticated;
grant select, insert on public.verification_audit_logs to authenticated;

drop policy if exists "Users can insert own verification audit logs" on public.verification_audit_logs;
create policy "Users can insert own verification audit logs"
on public.verification_audit_logs for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Only service role or admins view verification audit logs" on public.verification_audit_logs;
create policy "Only service role or admins view verification audit logs"
on public.verification_audit_logs for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.user_profiles
    where id = auth.uid() and profile_status = 'admin'
  )
);

alter table public.verification_selfie_checks
  add column if not exists challenge_token text,
  add column if not exists risk_score numeric;
