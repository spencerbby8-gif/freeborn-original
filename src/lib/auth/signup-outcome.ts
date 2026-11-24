/** Interpret Supabase's existing-user obfuscation without adding an email-lookup API.
 * Never authenticate, overwrite an account, or start onboarding on an ambiguous result.
 */
type SignupData = {session: unknown; user: {id?: string; identities?: unknown[]}|null};
type AuthFailure = {code?: string; message?: string}|null;
export type SignupOutcome = 'existing-account'|'signed-in'|'confirmation-required'|'unavailable';
export function signupOutcome(data: SignupData, error: AuthFailure): SignupOutcome {
  if (error) {
    if (['user_already_exists','user_already_registered','email_exists','identity_already_exists'].includes(error.code??'') || /already (?:been )?registered/i.test(error.message??'')) return 'existing-account';
    return 'unavailable';
  }
  // A real session, not an empty-identity fake user, proves authenticated access.
  if (data.session) return 'signed-in';
  if (!data.user?.id) return 'unavailable';
  if (Array.isArray(data.user.identities)) {
    return data.user.identities.length===0 ? 'existing-account' : 'confirmation-required';
  }
  // The provider didn't establish either a new identity or an authenticated session.
  return 'unavailable';
}
export const EXISTING_ACCOUNT_MESSAGE = 'An account already exists for this email. Log in instead, or reset your password.';
