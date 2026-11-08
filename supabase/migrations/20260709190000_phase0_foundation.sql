create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  handle text unique,
  onboarding_stage text not null default 'account_created',
  profile_status text not null default 'draft',
  first_name text,
  last_name text,
  birth_date date,
  city text,
  region text,
  country_code char(2),
  relationship_goal text,
  values text[] not null default '{}',
  bio text,
  is_verified boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  onboarding_completed_at timestamptz,
  constraint user_profiles_handle_format check (
    handle is null or handle ~ '^[a-z0-9_]{3,24}$'
  ),
  constraint user_profiles_country_code_format check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  constraint user_profiles_profile_status_check check (
    profile_status in ('draft', 'active', 'paused', 'hidden')
  )
);

create table if not exists public.user_private_settings (
  user_id uuid primary key references public.user_profiles (id) on delete cascade,
  discovery_paused boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists user_profiles_email_idx on public.user_profiles (email);
create index if not exists user_profiles_stage_idx on public.user_profiles (onboarding_stage);
create index if not exists user_profiles_status_idx on public.user_profiles (profile_status);
create index if not exists user_profiles_verified_idx on public.user_profiles (is_verified);

create trigger user_profiles_touch_updated_at
before update on public.user_profiles
for each row
execute function public.touch_updated_at();

create trigger user_private_settings_touch_updated_at
before update on public.user_private_settings
for each row
execute function public.touch_updated_at();

alter table public.user_profiles enable row level security;
alter table public.user_private_settings enable row level security;

create policy "Users can view their own profile"
on public.user_profiles
for select
using (auth.uid() = id);

create policy "Users can insert their own profile"
on public.user_profiles
for insert
with check (auth.uid() = id);

create policy "Users can update their own profile"
on public.user_profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can view their own private settings"
on public.user_private_settings
for select
using (auth.uid() = user_id);

create policy "Users can insert their own private settings"
on public.user_private_settings
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own private settings"
on public.user_private_settings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;

  insert into public.user_private_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();
