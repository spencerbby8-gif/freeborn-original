-- FB-14 scheduling: pg_cron + pg_net + Vault.
-- Additive and idempotent. The cron job contains no secret value; it calls a
-- pinned SECURITY DEFINER function that reads Vault at run time. The shared
-- caller secret is NOT the Supabase service-role/secret key.

begin;

create schema if not exists extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

revoke all on schema cron from public, anon, authenticated;
grant usage on schema cron to postgres;
grant all on schema cron to postgres;

revoke all on schema net from public, anon, authenticated;
grant usage on schema net to postgres, service_role;
grant all on all tables in schema net to postgres, service_role;
grant execute on all functions in schema net to postgres, service_role;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fb14_project_url') then
    perform vault.create_secret(
      'https://ihwtpwlszegrjgakqsxx.supabase.co',
      'fb14_project_url',
      'FB-14 cleanup worker project URL'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'fb14_cleanup_secret') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'fb14_cleanup_secret',
      'FB-14 cron shared secret; not a Supabase API key'
    );
  end if;
end;
$$;

create or replace function public.fb14_verify_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'fb14_cleanup_secret'
      and decrypted_secret = p_secret
  );
$$;

revoke all on function public.fb14_verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.fb14_verify_cron_secret(text) to service_role;

create or replace function public.fb14_trigger_storage_cleanup()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'fb14_project_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'fb14_cleanup_secret';

  if v_url is null or v_secret is null then
    raise exception 'FB-14 scheduling secrets are missing';
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/fb14-storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-fb14-cron-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.fb14_trigger_storage_cleanup() from public, anon, authenticated;
grant execute on function public.fb14_trigger_storage_cleanup() to postgres, service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fb14-storage-cleanup') then
    perform cron.unschedule('fb14-storage-cleanup');
  end if;
  perform cron.schedule(
    'fb14-storage-cleanup',
    '* * * * *',
    $job$select public.fb14_trigger_storage_cleanup()$job$
  );
end;
$$;

commit;
