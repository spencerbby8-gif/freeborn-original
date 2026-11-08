-- Notification preferences and blocked users

-- Notification preferences
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  match_alerts boolean not null default true,
  message_alerts boolean not null default true,
  like_alerts boolean not null default true,
  profile_activity boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger notification_preferences_touch_updated_at
before update on public.notification_preferences
for each row execute function public.touch_updated_at();

alter table public.notification_preferences enable row level security;

create policy "Users manage own notification preferences"
on public.notification_preferences for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Ensure notification_preferences row exists for new profiles
create or replace function public.ensure_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists user_profiles_ensure_notification_preferences on public.user_profiles;
create trigger user_profiles_ensure_notification_preferences
after insert on public.user_profiles
for each row execute function public.ensure_notification_preferences();

-- Backfill notification_preferences for existing users
insert into public.notification_preferences (user_id)
select id from public.user_profiles
on conflict (user_id) do nothing;

-- Blocked users
create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.user_profiles(id) on delete cascade,
  blocked_id uuid not null references public.user_profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint blocked_users_pair_unique unique (blocker_id, blocked_id),
  constraint blocked_users_no_self check (blocker_id <> blocked_id)
);

create index if not exists blocked_users_blocker_idx on public.blocked_users (blocker_id);
create index if not exists blocked_users_blocked_idx on public.blocked_users (blocked_id);

alter table public.blocked_users enable row level security;

create policy "Users manage own blocks"
on public.blocked_users for all
using (auth.uid() = blocker_id)
with check (auth.uid() = blocker_id);

-- App preferences stored in user_profiles
alter table public.user_profiles
  add column if not exists haptic_feedback boolean not null default true,
  add column if not exists card_animations boolean not null default true,
  add column if not exists notification_sounds boolean not null default true;
