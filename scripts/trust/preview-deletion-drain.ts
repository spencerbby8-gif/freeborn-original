import { readFileSync } from "node:fs";

const projectRef = process.env.PREVIEW_PROJECT_REF!;
const admin = readFileSync(process.env.PREVIEW_ADMIN_FILE!, "utf8").trim();
const stateFile = process.env.PREVIEW_DELETION_STATE_FILE!;
const state = JSON.parse(readFileSync(stateFile, "utf8")) as { users: Array<{ id: string; label: string }> };
const expected = new Set(state.users.map((user) => user.id));
const supabaseUrl = `https://${projectRef}.supabase.co`;
if (expected.size === 0) throw new Error("deletion drain requires synthetic account ids");

async function call(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", admin);
  headers.set("Authorization", `Bearer ${admin}`);
  const response = await fetch(`${supabaseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* no raw response logging */ }
  return { status: response.status, body };
}

function owned(account: string, bucket: string, path: string) {
  return path.length > 0 && path.length <= 512 && !/^[A-Za-z][A-Za-z0-9+.-]*:|\\|(^|\/)\.\.(\/|$)|^\//.test(path)
    && (path.startsWith(`${account}/`) || (bucket === "verification-selfies" && path.startsWith(`selfie-${account}-`) && !path.includes("/")));
}

let completed = 0;
for (let round = 0; round < 10; round += 1) {
  const claimed = await call("/rest/v1/rpc/fb14_claim_cleanup_jobs", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_limit: 20 }),
  });
  if (claimed.status !== 200 || !Array.isArray(claimed.body)) throw new Error(`claim failed with HTTP ${claimed.status}`);
  if (claimed.body.length === 0) {
    console.log(JSON.stringify({ status: "drained", syntheticAccounts: expected.size, jobsCompleted: completed }));
    process.exit(0);
  }
  for (const job of claimed.body) {
    const account = String(job.deletion_account_id);
    if (!expected.has(account)) throw new Error("refusing to process a job outside the synthetic state file");
    const bucket = String(job.bucket);
    const prefix = String(job.owner_prefix);
    if (prefix !== `${account}/`) throw new Error("unexpected cleanup prefix");
    const listing = await call(`/storage/v1/object/list/${bucket}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    if (listing.status !== 200 || !Array.isArray(listing.body)) throw new Error(`storage list failed with HTTP ${listing.status}`);
    const paths = new Set<string>(Array.isArray(job.object_paths) ? job.object_paths.map(String) : []);
    for (const object of listing.body) paths.add(`${prefix}${object.name}`);
    for (const path of paths) if (!owned(account, bucket, path)) throw new Error("unowned storage path in cleanup job");
    if (paths.size) {
      const removed = await call(`/storage/v1/object/${bucket}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [...paths] }),
      });
      if (removed.status !== 200) throw new Error(`storage removal failed with HTTP ${removed.status}`);
    }
    const after = await call(`/storage/v1/object/list/${bucket}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    if (after.status !== 200 || !Array.isArray(after.body) || after.body.length !== 0) throw new Error("storage prefix remains nonempty");
    const done = await call("/rest/v1/rpc/fb14_complete_cleanup_job", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_job_id: job.id, p_lease_token: job.lease_token }),
    });
    if (done.status !== 200 || done.body !== true) throw new Error(`completion failed with HTTP ${done.status}`);
    completed += 1;
  }
}
throw new Error("deletion queue did not drain within ten rounds");
