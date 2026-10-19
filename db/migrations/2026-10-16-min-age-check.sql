-- ============================================================================
-- FREEBORN MINIMUM AGE CONSTRAINT (audit finding H4, 2026-10-16)
-- ============================================================================
-- WHY
--   The onboarding UI builds its birth-year dropdown starting at
--   currentYear - 18 (src/components/onboarding/fields.tsx:391), and the copy
--   tells the member "Your birth date confirms you're 18+". But birth_date was
--   never validated on the server: src/lib/onboarding-store.ts:295 passed it
--   straight through, and the only age-related CHECK in the schema
--   (user_profiles_age_preference_check) validates the PREFERENCE range, not
--   the member's own age.
--
--   A direct POST /api/onboarding with birth_date = '2012-01-01' was accepted
--   and made the member discoverable. On a dating product that is a child
--   safety failure and a legal one (COPPA / UK OSA / EU DSA). It also makes
--   ageMinPreference >= 18 meaningless.
--
--   This constraint is the layer that cannot be bypassed by any code path,
--   including a future one nobody remembers to validate. The API now rejects
--   under-18 writes with a 400 as well (see src/lib/age.ts).
--
-- BEFORE YOU RUN THIS
--   It will FAIL if any existing row already violates it. Check first:
--
--     select id, email, birth_date,
--            date_part('year', age(current_date, birth_date)) as age
--     from public.user_profiles
--     where birth_date is not null
--       and birth_date > (current_date - interval '18 years');
--
--   If that returns rows, they are either bad data or real underage accounts.
--   Either way, review them by hand BEFORE applying — do not bulk-delete, and
--   if any are real underage members, follow your safeguarding process rather
--   than silently dropping the rows.
--
-- Apply with the project owner connection (transaction pooler).
-- ============================================================================

alter table public.user_profiles
  add constraint user_profiles_min_age_check
  check (
    birth_date is null
    or birth_date <= (current_date - interval '18 years')
  );

comment on constraint user_profiles_min_age_check on public.user_profiles is
  'Freeborn is 18+. birth_date must imply an age of at least 18, or be null. '
  'Server-side validation lives in src/lib/age.ts; this is the backstop that '
  'no code path can bypass.';

-- NOTE: birth_date is nullable, and this constraint permits null. A null
-- birth_date means "age unknown", which the discovery deck already renders as
-- no age. If the product intends every active member to have a verified birth
-- date, that is a separate (stricter) decision:
--
--   alter table public.user_profiles
--     add constraint user_profiles_birth_date_required
--     check (birth_date is not null or profile_status <> 'active');
--
-- Left commented out because it would change behaviour for existing members
-- mid-onboarding. Decide it deliberately, not as a side effect of this patch.
