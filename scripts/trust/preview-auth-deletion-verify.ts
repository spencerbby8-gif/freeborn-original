import { readFileSync } from "node:fs";

type User = { label: string; id: string; email: string; password: string; token: string; deleted: boolean; deletionToken?: string };
type Result = { id: string; pass: boolean; detail?: string | number | boolean };
type State = { runId: string; projectRef: string; users: User[]; results: Result[] };

const stateFile = process.env.PREVIEW_DELETION_STATE_FILE;
if (!stateFile) throw new Error("PREVIEW_DELETION_STATE_FILE is required");
const state = JSON.parse(readFileSync(stateFile, "utf8")) as State;
const publishable = process.env.PREVIEW_PUBLISHABLE_KEY;
const appBase = process.env.APP_BASE_URL;
if (!publishable || !appBase) throw new Error("PREVIEW_PUBLISHABLE_KEY and APP_BASE_URL are required");
const results = state.results;

function check(id: string, pass: boolean, detail?: string | number) {
  results.push({ id, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok" : "FAIL"} ${id}${detail === undefined ? "" : ` (${detail})`}`);
}

async function jsonRequest(url: string, token?: string) {
  const headers = new Headers({ apikey: publishable! });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* sanitized below */ }
  return { status: response.status, body };
}

for (const user of state.users) {
  if (!user.deletionToken) {
    check(`deletion_public_status_completed_${user.label}`, false, "missing_token");
    continue;
  }
  const status = await jsonRequest(`${appBase}/api/account/deletion-status?token=${encodeURIComponent(user.deletionToken)}`);
  check(`deletion_public_status_completed_${user.label}`,
    status.status === 200 && status.body?.status === "completed" && status.body?.completed === true && !("accountId" in (status.body ?? {})), status.status);
  const oldToken = await jsonRequest(`https://${state.projectRef}.supabase.co/auth/v1/user`, user.token);
  check(`deleted_auth_token_rejected_${user.label}`, oldToken.status === 401 || oldToken.status === 403, oldToken.status);
}

const failed = results.filter((result) => !result.pass);
console.log(JSON.stringify({ status: failed.length ? "fail" : "pass", runId: state.runId, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exitCode = 1;
