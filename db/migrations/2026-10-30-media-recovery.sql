-- ============================================================================
-- FREEBORN — MEDIA RECOVERY (2026-10-30)
-- ============================================================================
-- Fixes the three ways member media goes missing or survives its owner, all of
-- them measured against production `ihwtpwlszegrjgakqsxx` on 2026-10-30 with
-- read-only SELECTs. Nothing here is inferred from the schema alone.
--
--   1. chat attachments that only their SENDER can open      -> backfilled below
--   2. profile photos published through the photo manager    -> served by the
--      new branch in src/app/api/chat/media/[id]/route.ts (code, not SQL)
--   3. bucket objects that outlive the row that pointed at them -> removal is
--      wired into the delete paths (code), and the remaining orphan is listed
--      below as an owner action, because this role cannot delete them.
--
-- Every statement is idempotent. Re-running it changes nothing.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. FINISH C3: chat_media.match_id existed but was never populated for
--    uploads that predate the column, so `/api/chat/media/:id` fell through to
--    its "legacy row -> sender only" branch and the RECIPIENT of every such
--    attachment got a 404. The bytes were always there; the authorization link
--    was not.
--
--    Measured before this migration:
--      chat_media rows ....................... 11
--      with match_id IS NULL ................. 11   (i.e. ALL of them)
--      referenced by a message body .......... 6
--      of those, match_id still NULL ......... 6   <- repaired here
--      messages containing an attachment ..... 6
--      used as someone's profile photo ....... 4   <- handled by (2)
--      referenced by nothing at all .......... 1   <- (3)
--
--    The link is proven from existing data, not guessed: media is embedded in
--    messages.body as [[image:/api/chat/media/<uuid>]], and messages carry
--    match_id. Ambiguous media (one blob referenced from two different
--    conversations) is deliberately left alone rather than assigned, and the
--    join to matches means a row can never be linked to a conversation that no
--    longer exists.
--
--    Pre-flight result, all 6 candidates: refs = 1, distinct_matches = 1, and
--    the media's sender is a participant of the match being linked.
-- ────────────────────────────────────────────────────────────────────────────

with linked as (
  select m.id as media_id, ms.match_id
  from public.chat_media m
  join public.messages ms on ms.body like '%/api/chat/media/' || m.id || '%'
  join public.matches mt on mt.id = ms.match_id
  where m.match_id is null
    and ms.match_id is not null
),
unambiguous as (
  select media_id, min(match_id::text)::uuid as match_id
  from linked
  group by media_id
  having count(distinct match_id) = 1
)
update public.chat_media cm
set match_id = u.match_id
from unambiguous u
where cm.id = u.media_id
  and cm.match_id is null;

comment on column public.chat_media.match_id is
  'The conversation this attachment belongs to. Required to authorise reads: '
  'only the two participants of this match may fetch the blob. Rows uploaded '
  'before this column existed were backfilled from messages.body on 2026-10-30 '
  '(db/migrations/2026-10-30-media-recovery.sql); a media row still NULL is one '
  'no message references, and stays readable by its sender only. Media that an '
  'owner published as their profile photo is additionally readable by any '
  'signed-in member, guarded by the discoverability predicate in '
  'src/app/api/chat/media/[id]/route.ts.';

-- APPLIED 2026-10-30 through the Supabase API as migration
-- `2026_10_30_media_recovery`, and re-measured afterwards:
--   select count(*) from public.chat_media where match_id is null;        -- 11 -> 5
--   the same 6 rows joined to messages.body with match_id is null        --  6 -> 0
-- The 5 that remain NULL are the 4 profile-photo blobs (authorised instead by
-- the published-photo branch in code, item 2) and the 1 blob no message and no
-- profile references. Both verification queries returned exactly the predicted
-- numbers, and `profile_photos_storage_path_idx` is present.


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Supporting index for the profile-photo branch. That route looks media up by
--    its published path (`/api/chat/media/<uuid>`), which is a plain equality on
--    profile_photos.storage_path with no index — a sequential scan on every
--    photo <img> in a conversation or a profile page.
-- ────────────────────────────────────────────────────────────────────────────

create index if not exists profile_photos_storage_path_idx
  on public.profile_photos (storage_path);


-- ────────────────────────────────────────────────────────────────────────────
-- DOWN
-- ────────────────────────────────────────────────────────────────────────────
-- The backfill copies information that already exists in messages.body, so
-- undoing it is lossless but pointless: re-clearing match_id would put those 6
-- attachments back where the recipient cannot open them.
--   update public.chat_media set match_id = null where id in (...the 6...);
--   drop index if exists public.profile_photos_storage_path_idx;


-- ────────────────────────────────────────────────────────────────────────────
-- OWNER ACTIONS (cannot be applied by this role; storage.buckets is not ours)
-- ────────────────────────────────────────────────────────────────────────────
-- These need the project owner, either in the dashboard or with a key that owns
-- the storage schema. The precedent for leaving them here rather than
-- "working around" them is the note on RLS-2 in
-- db/migrations/2026-10-16-rls-and-media-ownership.sql.
--
-- (a) STATUS OF RLS-2 — RESOLVED. Measured 2026-10-30:
--       select id, public, file_size_limit, allowed_mime_types from storage.buckets;
--       profile-photos       | t | null | null
--       verification-selfies | f | null | null
--       chat-media           | f | null | null      <- was `t` when RLS-2 was filed
--     The `chat-media` bucket is no longer public, so the two orphaned objects
--     it holds are no longer world-readable. That finding can be closed.
--
-- (b) ONE OBJECT IN `profile-photos` HAS NO ROW. 11 objects vs 10 rows whose
--     storage_path is bucket-relative. Because the bucket is public and its read
--     policy is bucket-wide ("Public read profile photos", no ownership and no
--     discoverability condition), the bytes of that unlinked photo are still
--     retrievable by anyone who has the path — and paths leak: they appear in
--     the review queue, in account exports, and in browser history. Find it with:
--       select o.bucket_id, o.name, o.created_at
--       from storage.objects o
--       where o.bucket_id = 'profile-photos'
--         and not exists (
--           select 1 from public.profile_photos p
--           where p.storage_path = o.name
--              or o.name like '%' || p.storage_path);
--     Delete it in Storage -> profile-photos. Code no longer creates new ones
--     (profile/photos DELETE and the onboarding replace-all both remove objects
--     now), and they can only remove their own folder.
--
-- (c) BOUND THE PUBLIC BUCKET — APPLIED 2026-10-30.
--     `update storage.buckets set file_size_limit = 8388608,
--             allowed_mime_types = array['image/jpeg','image/png','image/webp']
--       where id = 'profile-photos';`
--     returned the row with both columns set, so this role CAN write
--     storage.buckets — which contradicts the "must be owner of relation
--     buckets" failure recorded for RLS-2 on 2026-10-16. Whatever changed on the
--     platform side, do not treat that older note as permanent.
--     Values chosen from measurements, not guesses: the largest object in the
--     bucket is 87,459 bytes (8 MB is ~96x headroom, so no member can be locked
--     out of replacing a photo), the only mime any object in it carries is
--     image/jpeg, src/lib/onboarding-store.ts uploads only image/jpeg|png, and
--     the allowlist is byte-for-byte the set the photo manager already enforces
--     (const MIMES = new Set(["image/jpeg","image/png","image/webp"])).
--     size from any signed-up member, and serves it publicly. The app itself only
--     ever stores image/jpeg, image/png (and browsers hand photo inputs over as
--     image/webp), so tightening this is not a breaking change for the product;
--     It removes "member signs up, uploads 100 MB, or an SVG/HTML file that a
--     browser may render inline" from the threat model. `verification-selfies`
--     is private and holds 0 objects and `chat-media` is private, so this was the
--     last bucket without a type or size bound.
--
-- (d) NOT DONE ON PURPOSE: moving `verification_requests.selfie_media` out of
--     the row. 9 rows / 280,901 base64 chars today, and the `verification-selfies`
--     bucket sits empty while the verification engine reads the inline column.
--     The refactor is real (audit finding H5) but verification is the one
--     subsystem with a freshly proven production run — it does not get destabilised
--     in a media-repair changeset. Same for `verification_selfie_checks.storage_path`,
--     which stores a fabricated `selfie-<uuid>-<ts>` string when the upload errors
--     (src/lib/onboarding-store.ts): that table is a legacy mirror of the live flow.
