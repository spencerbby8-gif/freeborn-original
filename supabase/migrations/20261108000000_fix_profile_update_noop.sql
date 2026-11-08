-- Forward-only repair for the P0 member-write trigger.
-- Returning OLD from a BEFORE UPDATE trigger silently discards the update.
-- Current PostgREST exposes request.jwt.claims; direct server connections have
-- no member JWT. Both cases must preserve legitimate writes without allowing
-- members to forge server-owned verification state.

create or replace function public.enforce_user_profiles_member_writes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  legacy_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  jwt_role text := coalesce(claims ->> 'role', legacy_role, '');
  server_context boolean := session_user not in ('authenticator', 'anon', 'authenticated')
    or jwt_role in ('service_role', 'supabase_admin', 'postgres');
begin
  -- A privileged server writer must receive NEW. Returning OLD here made every
  -- runtime UPDATE a silent no-op. PostgREST member/unknown contexts still go
  -- through the member checks below; missing claims never become a bypass.
  if server_context then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_verified or new.verified_photo
      or new.last_verified_at is not null
      or new.last_reverified_at is not null
      or new.periodic_reverification_due_at is not null
      or new.identity_consistency_status <> 'ready'
      or new.last_consistency_checked_at is not null then
      raise exception 'privileged verification fields are server-only' using errcode = '42501';
    end if;
    if new.birth_date is not null and new.birth_date > (current_date - interval '18 years') then
      raise exception 'Freeborn requires members to be 18 or older' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'profile identity is immutable' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'email changes must use the authenticated account flow' using errcode = '42501';
  end if;
  if new.is_verified and not old.is_verified then
    raise exception 'verification can only be granted by the server' using errcode = '42501';
  end if;
  if new.verified_photo is distinct from old.verified_photo
    or new.last_verified_at is distinct from old.last_verified_at
    or new.last_reverified_at is distinct from old.last_reverified_at
    or new.periodic_reverification_due_at is distinct from old.periodic_reverification_due_at
    or new.identity_consistency_status is distinct from old.identity_consistency_status
    or new.last_consistency_checked_at is distinct from old.last_consistency_checked_at then
    raise exception 'privileged verification fields are server-only' using errcode = '42501';
  end if;
  if new.birth_date is distinct from old.birth_date
    and new.birth_date is not null
    and new.birth_date > (current_date - interval '18 years') then
    raise exception 'Freeborn requires members to be 18 or older' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_user_profiles_member_writes() from public, anon, authenticated;
grant execute on function public.enforce_user_profiles_member_writes() to service_role;
