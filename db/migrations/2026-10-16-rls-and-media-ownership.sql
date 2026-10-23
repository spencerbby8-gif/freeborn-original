-- ============================================================================
-- FREEBORN — RLS REMEDIATION (audit findings RLS-1 / RLS-2, 2026-10-16)
-- ============================================================================
-- This file RECORDS changes already applied to the live project
-- `ihwtpwlszegrjgakqsxx` via the Supabase API, so the fix survives in version
-- control (audit finding M5: RLS was not in the repo at all, and .env.example
-- calls RLS "the guard" for the public anon key).
--
-- Re-running it is safe: both statements are idempotent.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- RLS-1 (CRITICAL, APPLIED): profile_photos was readable by absolutely anyone
-- ────────────────────────────────────────────────────────────────────────────
-- The previous policy was:
--
--   policy "Users can view discoverable photos" for select to public using (true)
--
-- The NAME promised "discoverable". The expression was literally `true`, with
-- no join to user_profiles and no check of discoverable / profile_status /
-- incognito / discovery_paused. Role `public` includes `anon`.
--
-- Because the anon (publishable) key is hardcoded in this public repository
-- (src/lib/supabase/{api-auth,proxy,server,browser}.ts) and the
-- `profile-photos` storage bucket is public, any anonymous visitor could:
--
--   supabase.from('profile_photos').select('*')      -> every storage_path
--   -> <project>/storage/v1/object/public/profile-photos/<path>
--
-- ...dumping every photo of every member, including hidden, paused, incognito
-- and suspended profiles, with no authentication and no app-layer rate limit.
-- It bypassed the application entirely, so API-level fixes do not mitigate it.
--
-- Contrast the neighbouring user_profiles policy, which is written correctly
-- and is what this replacement mirrors.
--
-- APPLIED 2026-10-16. Verify with:
--   select policyname, qual from pg_policies
--   where schemaname='public' and tablename='profile_photos';

drop policy if exists "Users can view discoverable photos" on public.profile_photos;

drop policy if exists "Discoverable members' photos are visible" on public.profile_photos;

create policy "Discoverable members' photos are visible"
on public.profile_photos
for select
to public
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.user_profiles up
    where up.id = profile_photos.user_id
      and up.profile_status = 'active'
      and up.discoverable = true
      and up.onboarding_stage = any (array['profile_setup','ready'])
  )
);

comment on policy "Discoverable members' photos are visible" on public.profile_photos is
  'Mirrors the user_profiles discovery policy. Replaces a policy whose expression was literally true for role public (incl. anon), which exposed every photo of every member to anyone holding the public anon key.';

-- KNOWN GAP (deliberately NOT changed here, so behaviour matches the existing
-- user_profiles policy exactly): neither policy implements the `incognito`
-- rule from user_private_settings ("only members I liked or matched with can
-- see me"). A member who enables incognito is still visible if they are
-- active+discoverable. That is a product decision — fix it in BOTH policies
-- together, not one, or the two will disagree the way /api/profiles and
-- /api/profile/[id] did (audit finding H3).


-- ────────────────────────────────────────────────────────────────────────────
-- RLS-2 (CRITICAL, *NOT* APPLIED — needs the project owner):
-- the `chat-media` storage bucket is public
-- ────────────────────────────────────────────────────────────────────────────
-- `update storage.buckets set public = false where id = 'chat-media';`
-- FAILED with: `must be owner of relation buckets`. The API role used by the
-- connector does not own the storage schema, and this should not be worked
-- around.
--
-- DO IT IN THE DASHBOARD: Storage -> chat-media -> untick "Public bucket".
--
-- Why it is safe to flip right now (verified against production):
--   * 0 rows in public.messages reference 'chat-media' or a storage URL
--   * 0 rows in public.match_messages reference it either
--   * src/app/api/chat/upload/route.ts — the ONLY writer to that bucket — is
--     never called from any client code (dead route; deleted in this branch)
--   * the bucket holds 2 orphaned objects (526,590 bytes, both 2026-10-06),
--     both under one user id, re-measured 2026-10-23
--   * the live attachment path is Postgres bytea via /api/chat/media, and 7
--     messages reference that path instead
--
-- So flipping breaks nothing. The 2 orphaned objects can be deleted afterwards.
--
-- NOTE: `profile-photos` is also public, and that is a defensible choice —
-- profile photos are meant to be viewable, and RLS-1 above closes the
-- ENUMERATION hole, which was the actual problem. A leaked individual URL
-- remains accessible; if that is not acceptable, make it private too and move
-- src/lib/photo-url.ts to signed URLs.
--
-- NOTE: `verification-selfies` is correctly private and holds 0 objects. The
-- 8 stored verification selfies live as base64 in
-- public.verification_requests.selfie_media instead — see audit finding H5.


-- ────────────────────────────────────────────────────────────────────────────
-- C3 support: link chat_media to a conversation so ownership can be enforced
-- ────────────────────────────────────────────────────────────────────────────
-- /api/chat/media/<id> served private photos, voice notes and videos with NO
-- authentication, relying on "ids are random uuids (unguessable)". Without a
-- link from a media row to a conversation there is no way to check that the
-- requester is a participant — which is why the column has to come first.
--
-- APPLIED 2026-10-23 via the Supabase API. Verified afterwards:
--   chat_media.match_id exists, index chat_media_match_idx exists,
--   all 11 pre-existing rows carry match_id IS NULL and therefore fall back to
--   sender-only access exactly as the column comment describes.
--
-- This had to be applied before the branch could be promoted. Commit b867f79
-- added matchId to src/db/schema.ts and made /api/chat/media/[id] select it,
-- while the column did not exist in production. main selects only { mime, data }
-- and so was unaffected, which means promoting the branch as-is would have
-- turned every chat attachment fetch into a 500 with
-- 'column chat_media.match_id does not exist'. The regression was introduced by
-- this remediation branch, not by main.

alter table public.chat_media
  add column if not exists match_id uuid
    references public.matches(id) on delete cascade;

create index if not exists chat_media_match_idx
  on public.chat_media (match_id);

comment on column public.chat_media.match_id is
  'The conversation this attachment belongs to. Required to authorise reads: '
  'only the two participants of this match may fetch the blob. Rows uploaded '
  'before this column existed are NULL and are readable only by their sender.';
