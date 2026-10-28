/**
 * The single source of truth for the minimum password length.
 *
 * It was previously stated in three places that disagreed with each other and
 * with the provider:
 *   - /api/account/route.ts validated `newPassword.length < 12`
 *   - auth-experience.tsx validated `values.password.length < 12`
 *   - the route's own doc comment claimed "min 12 chars, enforced by Supabase
 *     Auth", which was false: Supabase was configured with
 *     password_min_length = 6
 *
 * The comment described a guarantee that did not exist. All application code now
 * agrees through this constant rather than by coincidence.
 *
 * STILL OUT OF STEP, AND NOT FIXABLE FROM CODE: Supabase Auth is configured with
 * password_min_length = 6. That setting cannot be changed through the available
 * tooling and has to be raised to 12 in the Supabase dashboard (Authentication,
 * then Policies). Until it is, the provider would accept a 6-character password
 * from any caller that does not go through this codebase, for example the hosted
 * password-recovery flow. The app itself never asks for fewer than 12.
 */
export const MIN_PASSWORD_LENGTH = 12;

export function passwordTooShort(value: unknown): boolean {
  return typeof value !== "string" || value.length < MIN_PASSWORD_LENGTH;
}
