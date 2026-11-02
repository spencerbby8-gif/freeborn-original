// FB-15 verification-selfie retention worker: pure job logic (testable without a server).
// The HTTP entrypoint lives in index.ts.
//
// Supabase Edge Function only. Uses the platform-injected server credential;
// no service-role/secret key is read by Vercel, returned to a browser, logged,
// or stored in the repository. The queue/audit contain metadata only, and this
// worker logs only job ids and fixed error codes (never paths or image data).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type RetentionJob = {
  id: string;
  asset_key: string;
  account_id: string;
  source_table: "verification_requests" | "verification_selfie_checks" | "storage_orphan";
  source_id: string | null;
  storage_path: string | null;
  storage_object_id: string | null;
  has_inline: boolean;
  reason: "rejected" | "superseded" | "withdrawn" | "orphaned";
  attempts: number;
  lease_token: string;
};

export type Outcome = "completed" | "skipped";

export const BUCKET = "verification-selfies";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD_PATH = /(^\/|^[A-Za-z][A-Za-z0-9+.-]*:|\\|(^|\/)\.\.(\/|$))/;
export const KNOWN_CODES = new Set([
  "storage_list_failed", "storage_remove_failed", "storage_verify_failed",
  "inline_purge_failed", "hold_changed", "path_invalid", "stale_lease", "internal_error",
]);

export function serverCredential(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default ?? Object.values(parsed).find((v) => typeof v === "string" && v.length > 0) ?? null;
  } catch {
    return null;
  }
}

export function ownedPath(accountId: string, path: string): boolean {
  if (!UUID.test(accountId) || typeof path !== "string" || path.length === 0 || path.length > 512 || BAD_PATH.test(path)) {
    return false;
  }
  const id = accountId.toLowerCase();
  return path.startsWith(`${id}/`) || (path.startsWith(`selfie-${id}-`) && !path.includes("/"));
}

function splitPath(path: string): { folder: string; name: string } {
  const slash = path.lastIndexOf("/");
  return slash >= 0
    ? { folder: path.slice(0, slash), name: path.slice(slash + 1) }
    : { folder: "", name: path };
}

// Returns the object currently at the exact path, or null. Never throws on
// "not found"; throws storage_list_failed only when the listing itself fails.
async function currentEntry(admin: SupabaseClient, path: string): Promise<{ id: string } | null> {
  const { folder, name } = splitPath(path);
  const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: 1000, search: name });
  if (error) throw new Error("storage_list_failed");
  const match = (data ?? []).find((entry) => entry.name === name && entry.id !== null);
  return match ? { id: match.id as string } : null;
}

// Absence proof. With a captured object id, only that object's absence matters:
// a different object at a reused path is a newer item and is never touched.
async function objectAbsent(admin: SupabaseClient, path: string, expectedObjectId: string | null): Promise<boolean> {
  const entry = await currentEntry(admin, path);
  if (expectedObjectId === null) return entry === null;
  return entry === null || entry.id !== expectedObjectId;
}

export async function failJob(admin: SupabaseClient, job: RetentionJob, code: string): Promise<void> {
  const safe = KNOWN_CODES.has(code) ? code : "internal_error";
  const { error } = await admin.rpc("fb15_fail_retention_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_error_code: safe,
  });
  console.error(JSON.stringify({ event: "fb15_job_failed", job: job.id, code: safe, rpcError: Boolean(error) }));
}

export async function complete(
  admin: SupabaseClient,
  job: RetentionJob,
  expectedObjectId: string | null,
  failCode: "inline_purge_failed" | "storage_verify_failed",
): Promise<Outcome> {
  const { data, error } = await admin.rpc("fb15_complete_retention_job", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_inline_absent: true,
    p_storage_absent: true,
    p_expected_object_id: expectedObjectId,
  });
  if (error) throw new Error("internal_error");
  if (data === "completed") return "completed";
  if (data === "verification_failed") throw new Error(failCode);
  // hold_protected (job already moved to held) or stale_lease: nothing to retry now.
  return "skipped";
}

export async function processJob(admin: SupabaseClient, job: RetentionJob): Promise<Outcome> {
  if (job.has_inline) {
    const { data, error } = await admin.rpc("fb15_purge_inline", {
      p_job_id: job.id,
      p_lease_token: job.lease_token,
    });
    if (error) throw new Error("inline_purge_failed");
    // false = held, lease lost, or not yet absent: fail it so the state is recorded.
    if (data !== true) throw new Error("hold_changed");
    return complete(admin, job, null, "inline_purge_failed");
  }

  const path = job.storage_path;
  if (!path || !ownedPath(job.account_id, path)) throw new Error("path_invalid");

  const { data: authorized, error: authError } = await admin.rpc("fb15_authorize_storage_purge", {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
  });
  if (authError) throw new Error("internal_error");
  if (!authorized || (authorized as { storagePath?: string }).storagePath !== path) throw new Error("hold_changed");

  const { data: validation, error: validationError } = await admin.rpc("fb15_owned_selfie_path", {
    p_account_id: job.account_id,
    p_path: path,
  });
  if (validationError || validation !== true) throw new Error("path_invalid");

  // Remove only the captured object. If that object is already gone (and any
  // object now at the path is someone else's newer upload), do not delete it.
  const current = await currentEntry(admin, path);
  const targetPresent = job.storage_object_id !== null
    ? current !== null && current.id === job.storage_object_id
    : current !== null;
  if (targetPresent) {
    const { error: removeError } = await admin.storage.from(BUCKET).remove([path]);
    if (removeError) throw new Error("storage_remove_failed");
  }

  if (!(await objectAbsent(admin, path, job.storage_object_id))) throw new Error("storage_verify_failed");
  return complete(admin, job, job.storage_object_id, "storage_verify_failed");
}
