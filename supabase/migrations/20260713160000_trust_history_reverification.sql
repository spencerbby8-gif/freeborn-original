-- Phase 6: Trust history, internal trust scores, and periodic reverification rules.

alter table public.user_profiles
  add column if not exists last_verified_at timestamptz,
  add column if not exists last_reverified_at timestamptz,
  add column if not exists periodic_reverification_due_at timestamptz;

create table if not exists public.user_trust_history (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  verification_attempts integer not null default 0,
  verification_successes integer not null default 0,
  verification_failures integer not null default 0,
  mismatch_history_count integer not null default 0,
  last_verified_at timestamptz,
  last_reverified_at timestamptz,
  periodic_reverification_due_at timestamptz,
  trust_score numeric not null default 50,
  cooldown_state boolean not null default false,
  cooldown_until timestamptz,
  prior_safety_flags_count integer not null default 0,
  duplicate_detection_risk boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger user_trust_history_touch_updated_at
before update on public.user_trust_history
for each row execute function public.touch_updated_at();

alter table public.user_trust_history enable row level security;

revoke all on public.user_trust_history from anon, authenticated;
grant select, insert, update on public.user_trust_history to authenticated;

drop policy if exists "Users manage own private trust history" on public.user_trust_history;
create policy "Users manage own private trust history"
on public.user_trust_history for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.verification_audit_logs
  add column if not exists trust_score numeric not null default 50,
  add column if not exists duplicate_risk boolean not null default false;
