-- Local mirror used by the application auth bridge; user_profiles remains keyed to auth.users.
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now())
);
