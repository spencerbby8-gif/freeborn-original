import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";

/**
 * Verification selfies live in the private `verification-selfies` bucket, not in
 * a relational column (MED-INLINE-SELFIE).
 *
 * WHY THIS FILE EXISTS
 *   `verification_requests.selfie_media` used to hold the whole photograph as a
 *   base64 data URL. That put biometric bytes into application-database backups
 *   and every dump/restore path, while the project already owns a private bucket
 *   with per-member RLS, a 6 MiB / jpeg-png-webp bound, and two purge pipelines
 *   (FB-14 account erasure, FB-15 retention) that only ever look at Storage.
 *
 *   This module is the single door into that bucket for selfies, so the shape of
 *   a path, the size bound and the MIME bound are stated once:
 *
 *     <account_id>/selfie-<uuid>.<jpg|png|webp>
 *
 *   The account-id prefix is not cosmetic. Storage RLS authorises a member with
 *   `(storage.foldername(name))[1] = auth.uid()::text`, `fb15_owned_selfie_path`
 *   and `fb14_owned_storage_path` both accept it, and FB-14's erasure sweep
 *   deletes by `<account_id>/` prefix. Any other shape would be unreadable by
 *   its owner, unauthorizable for retention, and invisible to account erasure.
 *
 * DEGRADATION
 *   Local suites (scripts/trust/pose-run.mjs) run against a loopback database
 *   with no Supabase project reachable at all, so "Storage is not configured" is
 *   a real state and callers keep their documented inline fallback there. On a
 *   Vercel PRODUCTION deployment the same state is a configuration fault, not a
 *   test harness: `selfieStorageMandatory()` is true and callers must refuse the
 *   attempt rather than quietly put image bytes back into the database.
 */

export const SELFIE_BUCKET = "verification-selfies";

/** storage.buckets.file_size_limit for `verification-selfies`. */
export const MAX_SELFIE_BYTES = 6 * 1024 * 1024;

const MIME_TO_EXT: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_PATH_RE = /(^\/|^[A-Za-z][A-Za-z0-9+.-]*:|\\|(^|\/)\.\.(\/|$))/;

export type ParsedSelfie = {
  mime: string;
  ext: "jpg" | "png" | "webp";
  bytes: Buffer;
  /** SHA-256 of the ORIGINAL data-URL text — the value the database digests. */
  textSha256: string;
};

/**
 * Validate and decode a submitted selfie. Returns null for anything that is not
 * a jpeg/png/webp data URL inside the bucket's byte bound, so a caller can never
 * upload a shape the bucket would reject or the retention rules cannot own.
 */
export function parseSelfieDataUrl(dataUrl: string): ParsedSelfie | null {
  if (typeof dataUrl !== "string" || dataUrl.length === 0) return null;
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return null;
  const declared = match[1] === "jpg" ? "image/jpeg" : `image/${match[1]}`;
  const ext = MIME_TO_EXT[declared];
  if (!ext) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
  /* A truncated or non-image base64 body decodes to something, so the length is
     checked after decoding and the magic bytes before anything is stored. */
  if (bytes.length === 0 || bytes.length > MAX_SELFIE_BYTES) return null;
  if (!looksLikeImage(bytes, ext)) return null;
  return {
    mime: declared,
    ext,
    bytes,
    textSha256: createHash("sha256").update(dataUrl, "utf8").digest("hex"),
  };
}

function looksLikeImage(bytes: Buffer, ext: string): boolean {
  if (ext === "jpg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (ext === "png") {
    return bytes.length > 24
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes.readUInt32BE(12) === 0x49484452;
  }
  /* webp: RIFF....WEBP */
  return bytes.length > 12
    && bytes.toString("ascii", 0, 4) === "RIFF"
    && bytes.toString("ascii", 8, 12) === "WEBP";
}

/** True when a Supabase project is configured, i.e. Storage can be reached. */
export function selfieStorageConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  return Boolean(url && key);
}

/**
 * True when an inline fallback is NOT allowed. A production deployment with no
 * Supabase configuration is misconfigured; storing the photograph in the
 * database instead would silently undo this whole control.
 */
export function selfieStorageMandatory(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/** The only path shape this module will ever write or read. */
export function selfieObjectPath(accountId: string, ext: "jpg" | "png" | "webp"): string | null {
  if (!UUID_RE.test(accountId)) return null;
  const id = accountId.toLowerCase();
  return `${id}/selfie-${randomUUID()}.${ext}`;
}

/** Mirror of `public.fb15_owned_selfie_path` for the prefix shape. */
export function isOwnedSelfiePath(accountId: string, path: string): boolean {
  if (!UUID_RE.test(accountId)) return false;
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false;
  if (BAD_PATH_RE.test(path)) return false;
  return path.startsWith(`${accountId.toLowerCase()}/`);
}

/**
 * Upload a selfie as the member. The client must be member-scoped
 * (`createSupabaseClientForApi(request)`), because Storage RLS — not this code —
 * is what makes the write legitimate. `upsert: false` so a path collision fails
 * loudly instead of overwriting an earlier attempt.
 */
export async function uploadSelfie(
  client: SupabaseClient,
  accountId: string,
  selfie: ParsedSelfie
): Promise<string | null> {
  const path = selfieObjectPath(accountId, selfie.ext);
  if (!path) return null;
  const { error } = await client.storage
    .from(SELFIE_BUCKET)
    .upload(path, new Uint8Array(selfie.bytes), {
      contentType: selfie.mime,
      upsert: false,
    });
  if (error) return null;
  return path;
}

/**
 * Where a submitted selfie ends up.
 *
 * `path` and `inline` are mutually exclusive, mirroring the database check
 * constraint `verification_requests_selfie_one_home`:
 *   - Storage configured and the upload succeeded → `path`, `inline` null;
 *   - Storage not configured and not mandatory (local harness) → `inline`;
 *   - Storage configured but the upload failed, or mandatory and unconfigured →
 *     `refused`, and the caller stores NOTHING and tells the member to retry.
 *     A verification attempt is retryable; a photograph silently written back
 *     into the application database is not.
 */
export type StoredSelfie =
  | { status: "stored"; path: string | null; inline: string | null }
  | { status: "refused"; error: string };

export const SELFIE_STORAGE_RETRY_MESSAGE =
  "We could not reach the verification service, so nothing was decided about your selfie. Please try again in a few minutes.";

/**
 * Store one submitted selfie, as the member, in the member's own private folder.
 *
 * The Supabase client is built from the request rather than from a service key:
 * the app holds no service-role credential, and Storage RLS is what makes the
 * write legitimate. That also means a member can only ever create an object
 * inside their own `<account_id>/` prefix.
 */
export async function storeVerificationSelfie(
  request: Request,
  accountId: string,
  selfie: ParsedSelfie,
  dataUrl: string
): Promise<StoredSelfie> {
  if (!selfieStorageConfigured()) {
    if (selfieStorageMandatory()) return { status: "refused", error: SELFIE_STORAGE_RETRY_MESSAGE };
    /* No Supabase project exists in this runtime (loopback suites). Keeping the
       inline shape here is what lets the pose/freshness gate be tested at all. */
    return { status: "stored", path: null, inline: dataUrl };
  }
  let client: SupabaseClient;
  try {
    client = await createSupabaseClientForApi(request);
  } catch {
    return { status: "refused", error: SELFIE_STORAGE_RETRY_MESSAGE };
  }
  const path = await uploadSelfie(client, accountId, selfie);
  if (!path) return { status: "refused", error: SELFIE_STORAGE_RETRY_MESSAGE };
  return { status: "stored", path, inline: null };
}

/**
 * Read a selfie back as a data URL, for the identity-match gate. Returns null
 * rather than throwing: a missing or unreadable reference must degrade the
 * comparison to "no baseline", never break a photo upload.
 */
export async function readSelfieDataUrl(
  client: SupabaseClient,
  accountId: string,
  path: string
): Promise<string | null> {
  if (!isOwnedSelfiePath(accountId, path)) return null;
  const { data, error } = await client.storage.from(SELFIE_BUCKET).download(path);
  if (error || !data) return null;
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_SELFIE_BYTES) return null;
  const mime = data.type && MIME_TO_EXT[data.type] ? data.type : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
