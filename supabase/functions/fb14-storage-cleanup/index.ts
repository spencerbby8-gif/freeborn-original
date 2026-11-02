// FB-14 durable storage cleanup worker.
//
// Runs only inside Supabase Edge Functions. It uses the platform-injected
// server-side credential; no service-role/secret key is read by Vercel, returned
// to a browser, logged, or placed in the repository. The cron caller proves
// itself with a Vault-stored shared secret, not with a user JWT.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

type CleanupJob = {
  id: string;
  deletion_account_id: string;
  bucket: "profile-photos" | "verification-selfies";
  owner_prefix: string;
  object_paths: string[] | null;
  attempts: number;
  lease_token: string;
};

const ALLOWED_BUCKETS = new Set(["profile-photos", "verification-selfies"]);
const BAD_PATH = /(^\/|^[A-Za-z][A-Za-z0-9+.-]*:|\\|(^|\/)\.\.(\/|$))/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serverCredential(): string | null {
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

function ownedPath(accountId: string, bucket: string, path: string): boolean {
  if (!UUID.test(accountId) || !ALLOWED_BUCKETS.has(bucket)) return false;
  if (typeof path !== "string" || path.length === 0 || path.length > 512 || BAD_PATH.test(path)) return false;
  const id = accountId.toLowerCase();
  if (path.startsWith(`${id}/`)) return true;
  return bucket === "verification-selfies" && new RegExp(`^selfie-${id}-[^/]+$`).test(path);
}

function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/[\r\n]+/g, " ").slice(0, 300);
}

async function listAllFiles(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const folders = [prefix.endsWith("/") ? prefix.slice(0, -1) : prefix];
  let guard = 0;
  while (folders.length > 0 && guard < 1000) {
    guard += 1;
    const folder = folders.shift()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
      const entries = data ?? [];
      for (const entry of entries) {
        const full = folder.length > 0 ? `${folder}/${entry.name}` : entry.name;
        if (!ownedPath(prefix.split("/")[0], bucket, full)) continue;
        if (entry.id === null) folders.push(full);
        else files.push(full);
      }
      if (entries.length < 1000) break;
      offset += entries.length;
    }
  }
  if (folders.length > 0) throw new Error(`storage prefix too deep: ${bucket}/${prefix}`);
  return files;
}

async function pathExists(admin: SupabaseClient, bucket: string, path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, search: name });
  if (error) throw new Error(`verify ${bucket}/${path}: ${error.message}`);
  return (data ?? []).some((entry) => entry.name === name && entry.id !== null);
}

async function removePaths(admin: SupabaseClient, bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) throw new Error(`remove ${bucket}: ${error.message}`);
  }
}

async function processJob(admin: SupabaseClient, job: CleanupJob): Promise<void> {
  const accountId = job.deletion_account_id.toLowerCase();
  if (!ALLOWED_BUCKETS.has(job.bucket) || job.owner_prefix !== `${accountId}/`) {
    throw new Error("cleanup job failed owner-prefix validation");
  }

  const explicit = [...new Set(job.object_paths ?? [])];
  for (const path of explicit) {
    if (!ownedPath(accountId, job.bucket, path)) throw new Error("cleanup job contains an unowned object path");
    const { data, error } = await admin.rpc("fb14_owned_storage_path", {
      p_account_id: accountId,
      p_bucket: job.bucket,
      p_path: path,
    });
    if (error) throw new Error(`path validation rpc: ${error.message}`);
    if (data !== true) throw new Error("cleanup job contains an unowned object path");
  }

  const swept = await listAllFiles(admin, job.bucket, job.owner_prefix);
  const targets = [...new Set([...swept, ...explicit])];
  await removePaths(admin, job.bucket, targets);

  const remaining = await listAllFiles(admin, job.bucket, job.owner_prefix);
  if (remaining.length > 0) throw new Error(`storage prefix not empty after remove: ${remaining.length} object(s)`);
  for (const path of explicit) {
    if (await pathExists(admin, job.bucket, path)) throw new Error(`storage object survived remove: ${path}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const url = Deno.env.get("SUPABASE_URL");
  const key = serverCredential();
  if (!url || !key) return new Response("Server credential unavailable", { status: 500 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const secret = req.headers.get("x-fb14-cron-secret") ?? "";
  if (secret.length < 32) return new Response("Unauthorized", { status: 401 });
  const { data: authorized, error: authError } = await admin.rpc("fb14_verify_cron_secret", { p_secret: secret });
  if (authError || authorized !== true) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await admin.rpc("fb14_claim_cleanup_jobs", { p_limit: 5 });
  if (error) return new Response("Claim failed", { status: 500 });
  const jobs = (data ?? []) as CleanupJob[];

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  for (const job of jobs) {
    try {
      await processJob(admin, job);
      const { data: done, error: doneError } = await admin.rpc("fb14_complete_cleanup_job", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
      });
      if (doneError) throw new Error(doneError.message);
      if (done === true) completed += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      await admin.rpc("fb14_fail_cleanup_job", {
        p_job_id: job.id,
        p_lease_token: job.lease_token,
        p_error: errorMessage(err),
      });
    }
  }

  return Response.json({ claimed: jobs.length, completed, failed, skipped });
});
