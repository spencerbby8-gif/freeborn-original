-- P0 security core: FB-01, FB-03, FB-05.
-- Safe to apply once. Preflight on 2026-11-01: underage_rows=0, no URL photo paths,
-- and no active matches without mutual likes.

begin;

-- FB-05: database backstop for the 18+ product.
alter table public.user_profiles
  add constraint user_profiles_min_age_check
  check (birth_date is null or birth_date <= (current_date - interval '18 years'));

-- FB-03: profile photo references may be bucket-relative objects or the
-- published chat-media profile-photo route, never arbitrary URL schemes.
alter table public.profile_photos
  add constraint profile_photos_storage_path_safe
  check (
    length(storage_path) <= 512
    and storage_path !~* '^[a-z][a-z0-9+.-]*:'
    and storage_path not like '//%'
    and storage_path not like '%\%'
  );

-- Preserve public photo visibility without granting broad profile reads.
create or replace function public.profile_is_public(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = p_id
      and profile_status = 'active'
      and discoverable = true
      and onboarding_stage in ('profile_setup', 'ready')
  );
$$;
revoke all on function public.profile_is_public(uuid) from public;
grant execute on function public.profile_is_public(uuid) to authenticated, service_role;

-- FB-01: direct client reads are own-row only. Public discovery remains in the
-- service-backed API; photo visibility uses the narrow definer predicate above.
drop policy if exists "Discoverable profiles are visible" on public.user_profiles;

drop policy if exists "Discoverable members' photos are visible" on public.profile_photos;
create policy "Discoverable members' photos are visible"
on public.profile_photos for select to authenticated
using (auth.uid() = user_id or public.profile_is_public(user_id));

-- FB-01: members may edit profile content, not grant themselves trust state.
create or replace function public.enforce_user_profiles_member_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '');
begin
  if jwt_role <> 'authenticated' then
    if tg_op = 'INSERT' then return new; else return old; end if;
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

drop trigger if exists user_profiles_member_write_guard on public.user_profiles;
create trigger user_profiles_member_write_guard
before insert or update on public.user_profiles
for each row execute function public.enforce_user_profiles_member_writes();

-- Column-level UPDATE allowlist. is_verified remains writable only for
-- self-revocation; the trigger forbids false -> true.
revoke update on public.user_profiles from authenticated;
grant update (
  display_name, first_name, last_name, handle, birth_date, gender, show_gender,
  city, region, country_code, bio, occupation, education, education_level,
  language, religion, marital_status, has_kids, wants_kids, drinking, smoking,
  height_cm, height_cm_profile, interests, values, lifestyle_preferences,
  deal_breakers, relationship_goal, relationship_goals, prompt_answers,
  age_min_preference, age_max_preference, max_distance_km,
  message_privacy, discover_privacy, vaccination_status,
  discoverable, profile_status, onboarding_stage, onboarding_step,
  onboarding_completed_at, photo_count, is_verified,
  card_animations, haptic_feedback, notification_sounds, last_active_at
) on public.user_profiles to authenticated;

-- Photo writes stay owner-scoped; storage_path is constrained above.
revoke insert, update on public.profile_photos from authenticated;
grant insert (user_id, storage_path, position, is_primary, width, height)
  on public.profile_photos to authenticated;
grant update (position, is_primary, width, height)
  on public.profile_photos to authenticated;

commit;
