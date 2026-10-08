/**
 * Photo URL resolution.
 *
 * profile_photos.storage_path can hold three shapes:
 *  - a full http(s) URL (older rows / external uploads) → use as-is
 *  - an app route like "/api/chat/media/<id>"            → use as-is
 *  - a bare Supabase Storage object path ("user/file.jpg") → prefix with the
 *    public Storage URL of the profile-photos bucket. Without this prefix the
 *    browser requests a relative path and every photo renders black/blank.
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
