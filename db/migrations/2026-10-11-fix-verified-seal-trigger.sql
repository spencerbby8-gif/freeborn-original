-- ============================================================================
-- FIX: the verified seal must come ONLY from a passed identity verification
-- ============================================================================
-- Found by the 2026-10-11 production E2E of the identity match gate (PR #11):
-- public.handle_new_user() — the trigger on auth.users INSERT/UPDATE — derived
-- user_profiles.is_verified from `new.email_confirmed_at is not null`.
--
-- Consequence: every member who confirmed their email was silently marked
-- verified. The verified badge, the moderation AI's verified-member
-- protection, and the identity match gate all ran on a seal nobody earned —
-- while the one member who actually passed live verification was reset to
-- unverified whenever their auth row was updated (their email was
-- unconfirmed, so the trigger kept writing false).
--
-- The fix, in two parts:
--   1. the trigger no longer touches is_verified at all (email confirmation
--      proves an inbox, not an identity);
--   2. every seal is re-derived from the system's own records: verified means
--      "has an APPROVED verification_requests row". Members who lose the seal
--      can re-verify through the normal flow in under a minute.
--
-- Apply with the project owner connection (transaction pooler).
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.user_profiles (
    id,
    email,
    auth_providers
  )
  values (
    new.id,
    new.email,
    public.extract_auth_providers(new.raw_app_meta_data)
  )
  on conflict (id) do update
    set email = excluded.email,
        auth_providers = excluded.auth_providers,
        updated_at = timezone('utc', now());

  insert into public.user_private_settings (user_id, last_active_at)
  values (new.id, timezone('utc', now()))
  on conflict (user_id) do update
    set last_active_at = coalesce(public.user_private_settings.last_active_at, excluded.last_active_at),
        updated_at = timezone('utc', now());

  return new;
end;
$function$;

-- Re-derive every seal from an actually-approved identity verification.
update public.user_profiles up
set is_verified = exists (
      select 1
      from public.verification_requests vr
      where vr.account_id = up.id
        and vr.status = 'approved'
    ),
    updated_at = timezone('utc', now());
