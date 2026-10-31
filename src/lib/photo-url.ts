/**
 * Photo URL resolution.
 *
 * profile_photos.storage_path can hold three shapes:
 *  - a full http(s) URL (older rows / external uploads) → use as-is
 *  - an app route like "/api/chat/media/<id>"            → use as-is
 *  - a bare Supabase Storage object path ("user/file.jpg") → prefix with the
 *    public Storage URL of the profile-photos bucket. Without this prefix the
 *    browser requests a relative path and every photo renders black/blank.
 *
 * A fourth shape used to occur: "/uploads/<name>", written by the onboarding
 * fallback that saved bytes to the deployment's own disk (retired 2026-10-30;
 * src/lib/onboarding-store.ts now mirrors into Postgres instead). Resolving it as
 * a same-origin path is what made those photos unrecoverable — the file only ever
 * existed on one serverless instance — so this function keeps passing it through
 * and 0 rows of that shape remain in production, re-measured the same day.
 */

const FALLBACK_SUPABASE_URL = "https://ihwtpwlszegrjgakqsxx.supabase.co";

function supabaseBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? FALLBACK_SUPABASE_URL).replace(/\/$/, "");
}

export function resolvePhotoUrl(storagePath: string | null | undefined): string {
  if (!storagePath) return "";
  if (/^https?:\/\//.test(storagePath)) return storagePath;
  if (storagePath.startsWith("/")) return storagePath;
  return `${supabaseBaseUrl()}/storage/v1/object/public/profile-photos/${storagePath}`;
}
