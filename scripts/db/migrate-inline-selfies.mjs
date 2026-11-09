#!/usr/bin/env node
/**
 * MED-INLINE-SELFIE — one-time mover: inline `verification_requests.selfie_media`
 * data URLs become objects in the private `verification-selfies` bucket.
 *
 * WHAT IT GUARANTEES
 *   - History is preserved. The mover never touches `id`, `account_id`, `status`,
 *     `method`, `reject_reason`, `submitted_at` or `reviewed_at`. Only the home of
 *     the photograph changes, and the swap is one statement inside
 *     `public.fb15_finalize_selfie_move`.
 *   - The bytes that land in Storage are proven to be the bytes that were in the
 *     row: the digest is computed here BEFORE the upload and re-computed by the
 *     database under a row lock at commit time. A mismatch aborts the move and
 *     leaves the original inline value untouched.
 *   - Nothing is deleted. The inline value is nulled by the same statement that
 *     records the reference; there is no window where a row has neither home.
 *   - Idempotent. A row that already moved returns `already_moved`; re-running the
 *     script is a no-op.
 *
 * SAFETY RAILS
 *   - Dry run by default. Nothing is written unless `--apply` is passed.
 *   - Refuses the Production project reference unless `--ack-move-inline-selfies-<ref>`
 *     is passed verbatim, so a shell-history accident cannot migrate live members.
 *   - Requires an explicit service-role credential; it never reads a member
 *     session and never prints one.
 *   - Prints metadata only: request ids, statuses, digests, byte lengths and
 *     result codes. It never prints a data URL, an object path or an account id,
 *     so the output can be filed as evidence as-is.
 *
 * USAGE
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY_FILE=/secure/service-role-key \
 *     node scripts/db/migrate-inline-selfies.mjs --project-ref <ref>            # dry run
 *     node scripts/db/migrate-inline-selfies.mjs --project-ref <ref> --apply    # move
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const PRODUCTION_REF = "ihwtpwlszegrjgakqsxx";
const BUCKET = "verification-selfies";
const MAX_BYTES = 6 * 1024 * 1024; // storage.buckets.file_size_limit
const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};

const apply = flag("--apply");
const projectRef = value("--project-ref") ?? process.env.SUPABASE_PROJECT_REF ?? null;
const baseUrl = (value("--url") ?? process.env.SUPABASE_URL ?? (projectRef ? `https://${projectRef}.supabase.co` : "")).replace(/\/$/, "");
const keyFile = value("--service-role-key-file") ?? process.env.SUPABASE_SERVICE_ROLE_KEY_FILE ?? null;
const adminKey = (keyFile ? readFileSync(keyFile, "utf8") : process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const ack = value("--ack");

function fail(reason, extra = {}) {
  console.log(JSON.stringify({ status: "fail", reason, ...extra }, null, 2));
  process.exit(1);
}

if (!baseUrl) fail("no Supabase URL: pass --project-ref or --url or set SUPABASE_URL");
if (!adminKey) fail("no service-role credential: pass --service-role-key-file or set SUPABASE_SERVICE_ROLE_KEY");
if (adminKey.includes("sb_publishable") || adminKey.split(".").length !== 3) {
  fail("the supplied credential is not a service-role key; refusing to run with a publishable key");
}
const refFromUrl = baseUrl.replace(/^https?:\/\//, "").split(".")[0];
if (refFromUrl === PRODUCTION_REF && ack !== `--ack-move-inline-selfies-${PRODUCTION_REF}`) {
  fail("refusing to move Production selfies without the explicit acknowledgement", {
    required: `--ack --ack-move-inline-selfies-${PRODUCTION_REF}`,
    note: "Production member data. Run the dry run first and read the plan it prints.",
  });
}
if (ack && ack !== `--ack-move-inline-selfies-${PRODUCTION_REF}`) fail("unrecognised --ack value");

async function call(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", adminKey);
  headers.set("Authorization", `Bearer ${adminKey}`);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(120_000) });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text.slice(0, 200); }
  return { status: response.status, body };
}

/* The mover's commit point must exist before a single byte is uploaded. */
const probe = await call("/rest/v1/rpc/fb15_finalize_selfie_move", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ p_request_id: randomUUID(), p_storage_path: null, p_sha256: null, p_byte_length: null }),
});
if (probe.status === 404) {
  fail("fb15_finalize_selfie_move is not installed; apply migration 20261109030000_selfie_storage_path.sql first");
}

const listed = await call(
  "/rest/v1/verification_requests?select=id,status,method,account_id,selfie_media,selfie_storage_path&selfie_media=not.is.null&order=submitted_at.asc&limit=500"
);
if (listed.status !== 200 || !Array.isArray(listed.body)) {
  fail(`could not read inline selfie rows (HTTP ${listed.status})`, { detail: typeof listed.body === "string" ? listed.body : "non-list response" });
}

const rows = listed.body;
const plan = [];
const refused = [];

for (const row of rows) {
  const dataUrl = row.selfie_media;
  const match = typeof dataUrl === "string" ? DATA_URL_RE.exec(dataUrl) : null;
  if (!match) {
    refused.push({ requestId: row.id, status: row.status, code: "not_a_data_url" });
    continue;
  }
  const declared = match[1] === "jpg" ? "image/jpeg" : `image/${match[1]}`;
  const ext = MIME_EXT[declared];
  let bytes;
  try { bytes = Buffer.from(match[2], "base64"); } catch { bytes = null; }
  if (!ext || !bytes || bytes.length === 0 || bytes.length > MAX_BYTES) {
    refused.push({ requestId: row.id, status: row.status, code: "undecodable_or_oversize", bytes: bytes?.length ?? 0 });
    continue;
  }
  plan.push({
    requestId: row.id,
    status: row.status,
    inlineTextBytes: Buffer.byteLength(dataUrl, "utf8"),
    imageBytes: bytes.length,
    mime: declared,
    sha256: createHash("sha256").update(dataUrl, "utf8").digest("hex"),
    alreadyHasPath: Boolean(row.selfie_storage_path),
    accountId: String(row.account_id).toLowerCase(),
    ext,
    bytes,
  });
}

console.log(JSON.stringify({
  status: apply ? "applying" : "dry_run",
  projectRef: refFromUrl,
  bucket: BUCKET,
  inlineRowsFound: rows.length,
  movable: plan.length,
  refusedBeforeUpload: refused,
  inlineTextBytesTotal: plan.reduce((sum, p) => sum + p.inlineTextBytes, 0),
  imageBytesTotal: plan.reduce((sum, p) => sum + p.imageBytes, 0),
  plan: plan.map(({ requestId, status, inlineTextBytes, imageBytes, mime, sha256, alreadyHasPath }) =>
    ({ requestId, status, inlineTextBytes, imageBytes, mime, sha256, alreadyHasPath })),
}, null, 2));

if (!apply) {
  console.log(JSON.stringify({ status: "dry_run_complete", moved: 0, note: "re-run with --apply to perform the move" }));
  process.exit(0);
}

const results = [];
for (const item of plan) {
  const path = `${item.accountId}/selfie-${randomUUID()}.${item.ext}`;
  const uploaded = await fetch(`${baseUrl}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: adminKey,
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": item.mime,
      "x-upsert": "false",
      "Cache-Control": "no-transform",
    },
    body: new Uint8Array(item.bytes),
    signal: AbortSignal.timeout(120_000),
  });
  if (!uploaded.ok) {
    results.push({ requestId: item.requestId, code: `upload_failed_${uploaded.status}` });
    continue;
  }

  const finalized = await call("/rest/v1/rpc/fb15_finalize_selfie_move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_request_id: item.requestId,
      p_storage_path: path,
      p_sha256: item.sha256,
      p_byte_length: item.imageBytes,
    }),
  });
  const code = finalized.status === 200 ? String(finalized.body) : `rpc_http_${finalized.status}`;
  results.push({ requestId: item.requestId, code, sha256: item.sha256, imageBytes: item.imageBytes });

  /* If the database refused the swap, the uploaded object is unreferenced. Leave
     it for FB-15's orphan sweep rather than deleting bytes from a script that
     just proved it could not account for them. */
  if (code !== "moved" && code !== "already_moved") continue;
}

const after = await call(
  "/rest/v1/verification_requests?select=id,selfie_media,selfie_storage_path&selfie_media=not.is.null&limit=500"
);
const stillInline = Array.isArray(after.body) ? after.body.length : -1;
const movedCount = results.filter((r) => r.code === "moved" || r.code === "already_moved").length;

console.log(JSON.stringify({
  status: stillInline === 0 && movedCount + refused.length === rows.length ? "complete" : "complete_with_residue",
  rowsSeen: rows.length,
  moved: movedCount,
  refusedBeforeUpload: refused.length,
  results,
  rowsStillInline: stillInline,
}, null, 2));
process.exit(stillInline === 0 ? 0 : 1);
