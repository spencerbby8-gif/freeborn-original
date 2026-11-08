alter table public.user_profiles
  add column if not exists auth_providers text[] not null default '{}'::text[];

create index if not exists user_profiles_auth_providers_idx
  on public.user_profiles using gin (auth_providers);

create or replace function public.extract_auth_providers(metadata jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array(
      select jsonb_array_elements_text(
        case
          when jsonb_typeof(metadata -> 'providers') = 'array' then metadata -> 'providers'
          when metadata ? 'provider' then jsonb_build_array(metadata ->> 'provider')
          else '[]'::jsonb
        end
      )
    ),
    '{}'::text[]
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    is_verified,
    auth_providers
  )
  values (
    new.id,
    new.email,
    new.email_confirmed_at is not null,
    public.extract_auth_providers(new.raw_app_meta_data)
  )
  on conflict (id) do update
    set email = excluded.email,
        is_verified = excluded.is_verified,
        auth_providers = excluded.auth_providers,
        updated_at = timezone('utc', now());

  insert into public.user_private_settings (user_id, last_active_at)
  values (new.id, timezone('utc', now()))
  on conflict (user_id) do update
    set last_active_at = coalesce(public.user_private_settings.last_active_at, excluded.last_active_at),
        updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, email_confirmed_at, raw_app_meta_data on auth.users
for each row
execute procedure public.handle_new_user();
