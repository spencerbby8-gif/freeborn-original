/**
 * One rule for display names, because two routes write the column and the
 * database has an opinion the code was not enforcing.
 *
 * Production carries CHECK user_profiles_display_name_length:
 *   display_name IS NULL OR (length(display_name) >= 2 AND length(display_name) <= 40)
 *
 * An empty string satisfies neither branch. Both POST /api/settings and
 * /api/profile/me wrote `value.trim()` straight through, so a member who cleared
 * the field, or who had never set a name and saved any other field, raised a
 * CHECK violation. /api/settings then reported it as "Couldn't save settings:
 * Unknown error" because its catch only reads `.message` off Error instances and
 * a PostgREST failure is a plain object. Reproduced against production:
 * POST {"profile":{"displayName":""}} returns 500, while {"displayName":"Test"}
 * returns 200.
 *
 * Empty therefore means "leave it alone" rather than "reject", because NULL is
 * legal and a member with no name yet must still be able to save their bio.
 * One character is a genuine mistake and is refused with words a person can act
 * on.
 */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 40;

export type DisplayNameResult =
  | { ok: true; write: true; value: string }
  | { ok: true; write: false }
  | { ok: false; error: string };

export function normalizeDisplayName(raw: unknown): DisplayNameResult {
  if (typeof raw !== "string") return { ok: false, error: "Your name has to be text." };
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length === 0) return { ok: true, write: false };
  if (value.length < DISPLAY_NAME_MIN) {
    return {
      ok: false,
      error: `Your name needs at least ${DISPLAY_NAME_MIN} characters, or leave it blank to keep the one you have.`,
    };
  }
  if (value.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Your name has to fit in ${DISPLAY_NAME_MAX} characters.` };
  }
  return { ok: true, write: true, value };
}

/** height_cm is CHECKed to 120..230 in production. height_cm_profile, the column
 *  /api/profile/me actually writes, has no CHECK at all, so a height of 4 cm was
 *  accepted and then rendered on a profile other members read. */
export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 230;

export type HeightResult =
  | { ok: true; write: true; value: number }
  | { ok: true; write: false }
  | { ok: false; error: string };

export function normalizeHeightCm(raw: unknown): HeightResult {
  const n = typeof raw === "string" && raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { ok: true, write: false };
  if (n < HEIGHT_MIN_CM || n > HEIGHT_MAX_CM) {
    return {
      ok: false,
      error: `Height has to be between ${HEIGHT_MIN_CM} and ${HEIGHT_MAX_CM} cm.`,
    };
  }
  return { ok: true, write: true, value: Math.round(n) };
}

/** A PostgREST failure is a plain object, so `err instanceof Error` is false and
 *  the real reason disappears. Read the message off either shape. */
export function dbErrorMessage(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error) return err.message;
  const e = err as { message?: string; details?: string } | null;
  return e?.message || e?.details || fallback;
}
