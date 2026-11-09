-- ============================================================================
-- RES-INCOGNITO-RLS — metadata vector (the RLS half)
-- Applied to Production ihwtpwlszegrjgakqsxx on 2026-11-09 (ledger version
-- 20261109202434, name incognito_profile_photo_rls). Owner-authorized.
-- Full design rationale: evidence/owner-package-20261109/01-incognito-rls-design.md
-- ============================================================================
--
-- WHY
--   public.profile_photos had a SELECT policy for `authenticated`:
--       "Discoverable members' photos are visible"
--       USING (auth.uid() = user_id OR profile_is_public(user_id))
--   profile_is_public(p_id) checks ONLY profile_status='active' AND
--   discoverable=true AND onboarding_stage IN ('profile_setup','ready'); it does
--   NOT check incognito (which lives on user_private_settings). So an incognito
--   member who is still discoverable had their profile_photos rows (ids +
--   storage_path) readable by ANY authenticated member via direct PostgREST.
--   The deck/profile routes already hide incognito members from everyone but the
--   members they liked or matched with, and PR #37 brought the byte-serving
--   chat-media route into parity. This migration brings the RLS into parity too,
--   closing the remaining metadata vector.
--
-- SEMANTICS — identical to the deck (src/app/api/profiles/route.ts) and to PR
--   #37's decideMediaAccess rule 3:
--       photo visible to viewer  <=>
--         viewer IS the owner
--         OR ( owner profile is public (active + discoverable + onboarded)
--              AND ( owner is NOT incognito
--                    OR the owner liked the viewer  (user_swipes, action='like')
--                    OR viewer has an ACTIVE match with the owner ) )
--   PARITY: user_swipes.action domain is {like, superlike, pass}; the deck and
--   PR #37 count ONLY action='like' toward the incognito exception, so this does
--   too. Making the RLS more permissive than the deck would re-introduce drift.
--
-- SAFETY
--   - The predicate is a SECURITY DEFINER function (mirrors profile_is_public):
--     an inline policy sub-select on user_private_settings / user_swipes /
--     matches would be evaluated under THOSE tables' own RLS (recursion and/or
--     wrong denials). search_path pinned to public; EXECUTE granted to
--     authenticated + service_role only, revoked from public.
--   - Idempotent (CREATE OR REPLACE; DROP POLICY IF EXISTS then CREATE).
--   - Touches ONLY the one SELECT policy. The other two profile_photos policies
--     ("Users manage own photos" = auth.uid()=user_id; "freeborn_runtime_all" =
--     runtime role, true) are left exactly as they are.
--   - Strictly NARROWING for incognito owners; a NON-incognito discoverable
--     member's visibility is unchanged.
--   - Verified on Production before the swap: 0 incognito members, and over all
--     154 real (photo-owner, viewer) pairs the new predicate was IDENTICAL to the
--     old one (0 mismatches) — zero behavioural change to any current member.
--
-- REVERSAL (only if ever needed):
--   drop policy if exists "Discoverable members' photos are visible" on public.profile_photos;
--   create policy "Discoverable members' photos are visible"
--     on public.profile_photos for select to authenticated
--     using (auth.uid() = user_id or public.profile_is_public(user_id));
--   drop function if exists public.profile_photo_visible_to(uuid, uuid);
-- ============================================================================

create or replace function public.profile_photo_visible_to(p_owner uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_owner = p_viewer
    or (
      public.profile_is_public(p_owner)
      and (
        not coalesce(
          (select s.incognito
             from public.user_private_settings s
            where s.user_id = p_owner),
          false
        )
        or exists (
          select 1
            from public.user_swipes w
           where w.liker_id = p_owner
             and w.liked_id = p_viewer
             and w.action = 'like'
        )
        or exists (
          select 1
            from public.matches m
           where m.status = 'active'
             and (
                   (m.user_a = p_owner  and m.user_b = p_viewer)
                or (m.user_a = p_viewer and m.user_b = p_owner)
             )
        )
      )
    );
$$;

revoke all on function public.profile_photo_visible_to(uuid, uuid) from public;
grant execute on function public.profile_photo_visible_to(uuid, uuid) to authenticated, service_role;

-- Swap the SELECT policy to the viewer-aware predicate. SAME policy name, SAME
-- role (authenticated), SAME command (SELECT), so anything that references it by
-- name is unaffected.
drop policy if exists "Discoverable members' photos are visible" on public.profile_photos;
create policy "Discoverable members' photos are visible"
on public.profile_photos for select to authenticated
using (public.profile_photo_visible_to(user_id, auth.uid()));
