-- ============================================================================
-- Proto profile fields — the ONE column the approved design needs that the
-- schema genuinely lacked: zodiac.
--
-- The Discover card and the Profile-detail info grid show
--     Lifestyle · Drinks · Zodiac · Languages
-- and before adding anything I audited all 38 existing ADD COLUMN statements.
-- Three of those four tiles already have a home, so no new column is created
-- for them and no data is duplicated under a second name:
--
--     Lifestyle  -> lifestyle_preferences text[]     (exists)
--     Drinks     -> drinking text                    (exists, p0_security_core)
--     Languages  -> language text                    (exists, p0_security_core)
--     Zodiac     -> *** nothing ***                  <-- this migration
--
-- The same audit cleared the rest of the screen:
--     card-meta  "5'6""  -> height_cm / height_cm_profile  (exists)
--     card-tags          -> interests text[]               (exists)
--     card-bio           -> bio text                       (exists)
--     pd-sub             -> occupation, city               (exists)
--
-- Zodiac is nullable and free text on purpose:
--   · every existing row keeps working, nothing is back-filled with an
--     invented sign;
--   · it is never derived from birth_date — the mock shows a self-described
--     sign, and inferring one would put words in a member's mouth;
--   · the UI omits an empty tile rather than printing a placeholder.
-- ============================================================================

begin;

alter table public.user_profiles
  add column if not exists zodiac text;

comment on column public.user_profiles.zodiac is
  'Self-described star sign (Aries … Pisces). Never inferred from birth_date.';

-- ---------------------------------------------------------------------------
-- Grant. p0_security_core replaced table-wide UPDATE with a column allowlist:
--     revoke update on public.user_profiles from authenticated;
--     grant update (display_name, …) on public.user_profiles to authenticated;
-- A newly added column is therefore READ-ONLY to members until it appears in
-- that list — the member-facing profile editor would silently drop every
-- zodiac value it tried to save, with no error. Re-granting the exact same
-- column set with zodiac appended keeps the allowlist intact and widens it by
-- precisely one column. The list is copied verbatim from p0_security_core so
-- no previously-writable column is accidentally revoked.
-- ---------------------------------------------------------------------------
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
  card_animations, haptic_feedback, notification_sounds, last_active_at,
  zodiac
) on public.user_profiles to authenticated;

-- No index: zodiac is displayed, never filtered or sorted on. An index here
-- would be pure write overhead on the hottest table in the schema.

commit;
