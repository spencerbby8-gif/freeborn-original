/**
 * Age helpers — the single source of truth for "how old is this member" and
 * "is this member old enough to be here".
 *
 * Previously `ageFromBirthDate` was copy-pasted verbatim into
 * /api/profiles and /api/profile/[id]. Duplication of the AGE function
 * specifically is how an under-18 member survives a partial fix, so it lives
 * here once.
 */

/** Freeborn is 18+. Enforced in three places: the UI dropdown, the API
 *  (see /api/onboarding), and a database CHECK constraint (see
 *  db/migrations/2026-10-16-min-age-check.sql). The constraint is the one
 *  that cannot be bypassed by any code path. */
export const MIN_AGE = 18;

/** Age in whole years from a `YYYY-MM-DD` birth date, or null if unusable. */
export function ageFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  // Strict format check, preserved from the src/lib/onboarding-data.ts copy so
  // that replacing it with this one does not loosen validation. A malformed or
  // partial date yields null rather than a plausible-looking age.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())) return null;
  const dob = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * True when the supplied birth date is missing, unparseable, in the future, or
 * implies an age below MIN_AGE.
 *
 * Deliberately strict: an unusable birth date is treated as NOT old enough,
 * because the alternative lets a malformed value through a safety gate.
 */
export function isUnderMinAge(birthDate: unknown): boolean {
  if (typeof birthDate !== "string" || birthDate.trim() === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())) return true;
  const age = ageFromBirthDate(birthDate.trim());
  if (age === null) return true;
  if (age < 0) return true; // birth date in the future
  return age < MIN_AGE;
}
