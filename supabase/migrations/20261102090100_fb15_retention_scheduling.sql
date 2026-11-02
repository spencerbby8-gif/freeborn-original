-- FB-15 scheduling: pg_cron + pg_net + Vault. Additive and idempotent.
-- The cron command contains no secret value. The shared caller secret is not a
-- Supabase API key and is never placed in Vercel or returned to a browser.

begin;

create schema if not exists extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fb15_project_url') then
    perform vault.create_secret(
      'https://ihwtpwlszegrjgakqsxx.supabase.co',
      'fb15_project_url',
      'FB-15 selfie retention worker project URL'
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'fb15_retention_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'fb15_retention_secret',
      'FB-15 cron shared secret; not a Supabase API key'
    );
  end if;
end;
$$;

create or replace function public.fb15_verify_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'fb15_retention_secret' and decrypted_secret = p_secret
  );
$$;

revoke all on function public.fb15_verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.fb15_verify_cron_secret(text) to service_role;

create or replace function public.fb15_trigger_retention()
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
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'fb15_project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'fb15_retention_secret';
  if v_url is null or v_secret is null then
    raise exception 'FB-15 scheduling secrets are missing';
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/fb15-selfie-retention',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-fb15-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.fb15_trigger_retention() from public, anon, authenticated;
grant execute on function public.fb15_trigger_retention() to postgres, service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fb15-selfie-retention') then
    perform cron.unschedule('fb15-selfie-retention');
  end if;
  perform cron.schedule(
    'fb15-selfie-retention',
    '* * * * *',
    $job$select public.fb15_trigger_retention()$job$
  );
end;
$$;

commit;
