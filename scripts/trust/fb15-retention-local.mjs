#!/usr/bin/env node
// FB-15 local PostgreSQL regression for verification-selfie retention.
//
// Covers: path ownership, lifecycle eligibility (rejected / superseded / pending /
// approved / failed checks / orphaned objects), hold + release, successful purge,
// failed completion, retries + backoff + exhaustion + requeue, lease expiry,
// idempotent scan/complete/withdraw, starvation-free scanning, withdrawal,
// metadata-only audit, client-role denial, pinned search_path, and the
// pg_cron/pg_net/Vault scheduling migration (emulated locally).
//
// LIMITS (stated, not hidden): this does NOT call the Supabase Storage API. The
// "storage" steps here delete rows in a local storage.objects stub that mirrors
// the worker's exact sequence. The Deno worker itself is exercised separately
// (see test:retention-worker) and in production verification. This file never
// touches a real project or real member data.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.FB15_LOCAL_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/app_db";
const client = new pg.Client({ connectionString: url });
let pass = 0;
const fails = [];
function ok(name, cond, detail = "") {
  if (cond) {
    pass += 1;
    console.log(`  ok ${name}`);
  } else {
    fails.push(name);
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const q = async (sql, params = []) => (await client.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
async function expectSqlError(name, sql, params, code) {
  try {
    await client.query(sql, params);
    ok(name, false, "expected error");
  } catch (err) {
    ok(name, err.code === code, `code=${err.code} ${err.message}`);
  }
}

const SELFIE = (marker) => `data:image/jpeg;base64,${Buffer.from(`SELFIE-${marker}`).toString("base64")}`;
const MARKERS = [];
function marker(tag) {
  const m = `MARK-${tag}-${randomUUID().slice(0, 8)}`;
  MARKERS.push(m);
  return m;
}

async function mkAccount(id = randomUUID()) {
  await q(`insert into accounts (id, email) values ($1, $2) on conflict do nothing`, [id, `${id}@accounts.fb15.test`]);
  await q(`insert into user_profiles (id, email) values ($1, $2) on conflict do nothing`, [id, `${id}@fb15.test`]);
  return id;
}
async function mkRequest({ account, status, selfie, submittedAt = null }) {
  const id = randomUUID();
  await q(
    `insert into verification_requests (id, account_id, status, selfie_media, submitted_at)
     values ($1, $2, $3, $4, coalesce($5::timestamptz, now()))`,
    [id, account, status, selfie, submittedAt]
  );
  return id;
}
async function mkObject(name, { ageMinutes = 60 } = {}) {
  const row = await one(
    `insert into storage.objects (bucket_id, name, created_at)
     values ('verification-selfies', $1, now() - make_interval(mins => $2)) returning id`,
    [name, ageMinutes]
  );
  return row.id;
}
async function mkCheck({ account, status, path, objectAgeMinutes = 60, withObject = true }) {
  const id = randomUUID();
  if (withObject) await mkObject(path, { ageMinutes: objectAgeMinutes });
  await q(
    `insert into verification_selfie_checks (id, user_id, storage_path, pose_id, pose_asset_path, status)
     values ($1, $2, $3, 'pose-test', 'pose-test.jpg', $4)`,
    [id, account, path, status]
  );
  return id;
}
async function jobFor(assetKey) {
  return one(`select * from verification_selfie_retention_jobs where asset_key = $1`, [assetKey]);
}
async function objectExists(objectId) {
  return (await one(`select count(*)::int as n from storage.objects where id = $1`, [objectId])).n === 1;
}

// Mirrors the worker's sequence exactly. Storage removal is emulated by deleting
// the local storage.objects row only for the captured object id (or the path if none).
async function processClaimed(job) {
  const fail = (code) => one(`select public.fb15_fail_retention_job($1,$2,$3) as ok`, [job.id, job.lease_token, code]);
  if (job.has_inline) {
    const p = await one(`select public.fb15_purge_inline($1,$2) as ok`, [job.id, job.lease_token]);
    if (p.ok !== true) return (await fail("hold_changed")).ok && "failed";
    const c = await one(`select public.fb15_complete_retention_job($1,$2,true,true,null) as r`, [job.id, job.lease_token]);
    return c.r;
  }
  const auth = await one(`select public.fb15_authorize_storage_purge($1,$2) as a`, [job.id, job.lease_token]);
  if (!auth.a) return (await fail("hold_changed")).ok && "failed";
  const path = job.storage_path;
  const objectId = job.storage_object_id;
  const cur = await q(`select id from storage.objects where bucket_id='verification-selfies' and name=$1`, [path]);
  const present = objectId ? cur.some((r) => r.id === objectId) : cur.length > 0;
  if (present) {
    await q(
      `delete from storage.objects where bucket_id='verification-selfies' and name=$1 and ($2::uuid is null or id=$2::uuid)`,
      [path, objectId]
    );
  }
  const after = await q(`select id from storage.objects where bucket_id='verification-selfies' and name=$1`, [path]);
  const absent = objectId ? !after.some((r) => r.id === objectId) : after.length === 0;
  if (!absent) {
    await fail("storage_verify_failed");
    return "failed";
  }
  const c = await one(`select public.fb15_complete_retention_job($1,$2,true,true,$3::uuid) as r`, [job.id, job.lease_token, objectId]);
  return c.r;
}

// Claims everything due and processes it. Returns the job outcomes by id.
async function drain(limit = 50) {
  const claimed = await q(`select * from public.fb15_claim_retention_jobs($1)`, [limit]);
  const out = {};
  for (const job of claimed) out[job.id] = await processClaimed(job);
  return out;
}

await client.connect();
try {
  // Roles and migrations (run twice: must be idempotent).
  await client.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);
  const migration = await readFile(new URL("../../supabase/migrations/20261102090000_fb15_selfie_retention.sql", import.meta.url), "utf8");
  await client.query(migration);
  await client.query(migration);
  ok("migration 090000 applies twice (idempotent)", true);

  // ---- 1. Path ownership -------------------------------------------------
  console.log("path ownership");
  const A = await mkAccount();
  const B = await mkAccount();
  const pathCases = [
    [`${A}/a.jpg`, true],
    [`selfie-${A}-1700000000.jpg`, true],
    [`${B}/a.jpg`, false],
    [`selfie-${B}-1.jpg`, false],
    [`${A}/../${B}/a.jpg`, false],
    [`${A}\\x.jpg`, false],
    [`https://example.test/${A}/a.jpg`, false],
    [`/${A}/a.jpg`, false],
    [`selfie-${A}-1/extra.jpg`, false],
    [`${A}/${"x".repeat(600)}`, false],
  ];
  for (const [p, expected] of pathCases) {
    const r = await one(`select public.fb15_owned_selfie_path($1::uuid,$2) as ok`, [A, p]);
    ok(`owned ${p.slice(0, 40)}`, r.ok === expected);
  }
  ok("owned null path is false", (await one(`select public.fb15_owned_selfie_path($1::uuid,null) as ok`, [A])).ok === false);
  await expectSqlError(
    "queue rejects a path owned by another account",
    `insert into verification_selfie_retention_jobs (asset_key, account_id, source_table, storage_path, reason)
     values ($1, $2, 'storage_orphan', $3, 'orphaned')`,
    [`object:${randomUUID()}`, A, `${B}/leak.jpg`],
    "23514"
  );

  // ---- 2. Lifecycle eligibility: rejected / superseded / latest pending / approved
  console.log("lifecycle eligibility");
  const U1 = await mkAccount();
  const mRej = marker("rej"), mOld = marker("old"), mNew = marker("new"), mAppr = marker("appr");
  const rRej = await mkRequest({ account: U1, status: "rejected", selfie: SELFIE(mRej), submittedAt: "2026-10-01T00:00:00Z" });
  const rOld = await mkRequest({ account: U1, status: "pending", selfie: SELFIE(mOld), submittedAt: "2026-10-02T00:00:00Z" });
  const rNew = await mkRequest({ account: U1, status: "pending", selfie: SELFIE(mNew), submittedAt: "2026-10-03T00:00:00Z" });
  const rAppr = await mkRequest({ account: U1, status: "approved", selfie: SELFIE(mAppr), submittedAt: "2026-10-04T00:00:00Z" });
  const scanned = await one(`select public.fb15_scan_retention(100) as n`);
  ok("scan enqueues at least rejected + superseded", scanned.n >= 2, `n=${scanned.n}`);
  ok("rejected inline is enqueued as rejected", (await jobFor(`request:${rRej}`))?.reason === "rejected");
  ok("older pending is enqueued as superseded", (await jobFor(`request:${rOld}`))?.reason === "superseded");
  ok("latest pending is NOT enqueued (pending review protected)", (await jobFor(`request:${rNew}`)) === undefined);
  ok("approved reference is NOT enqueued", (await jobFor(`request:${rAppr}`)) === undefined);
  ok("second scan enqueues nothing new (idempotent)", (await one(`select public.fb15_scan_retention(100) as n`)).n === 0);
  const audited = await one(`select count(*)::int as n from verification_selfie_retention_audit a join verification_selfie_retention_jobs j on j.id=a.job_id where j.asset_key in ($1,$2) and a.event='enqueued'`, [`request:${rRej}`, `request:${rOld}`]);
  ok("exactly one enqueued audit per job", audited.n === 2, `n=${audited.n}`);

  let outcomes = await drain();
  ok("rejected job completed", outcomes[(await jobFor(`request:${rRej}`)).id] === "completed");
  ok("superseded job completed", outcomes[(await jobFor(`request:${rOld}`)).id] === "completed");
  ok("rejected selfie purged", (await one(`select selfie_media from verification_requests where id=$1`, [rRej])).selfie_media === null);
  ok("superseded selfie purged", (await one(`select selfie_media from verification_requests where id=$1`, [rOld])).selfie_media === null);
  ok("latest pending selfie retained", (await one(`select selfie_media from verification_requests where id=$1`, [rNew])).selfie_media !== null);
  ok("approved selfie retained", (await one(`select selfie_media from verification_requests where id=$1`, [rAppr])).selfie_media !== null);

  // ---- 3. Hold, then release when the hold clears ---------------------------
  console.log("holds");
  const U2 = await mkAccount();
  const mG = marker("g"), mH = marker("h");
  const rG = await mkRequest({ account: U2, status: "pending", selfie: SELFIE(mG), submittedAt: "2026-10-05T00:00:00Z" });
  await mkRequest({ account: U2, status: "pending", selfie: SELFIE(mH), submittedAt: "2026-10-06T00:00:00Z" });
  await one(`select public.fb15_scan_retention(100) as n`);
  const gJob = await jobFor(`request:${rG}`);
  ok("superseded job created for G", gJob?.reason === "superseded");
  await q(`update verification_requests set status='approved' where id=$1`, [rG]);
  await drain();
  const gHeld = await jobFor(`request:${rG}`);
  ok("G approved while queued becomes held (approved_reference)", gHeld.status === "held");
  ok("held G selfie retained", (await one(`select selfie_media from verification_requests where id=$1`, [rG])).selfie_media !== null);
  const heldAudit = await one(`select hold_reason, event from verification_selfie_retention_audit where job_id=$1 and event='hold_protected' order by id desc limit 1`, [gJob.id]);
  ok("hold transition audited with hold reason", heldAudit?.hold_reason === "approved_reference");
  await q(`update verification_requests set status='rejected' where id=$1`, [rG]);
  const relOut = await drain();
  ok("hold cleared (rejected) → job released and completed", relOut[gJob.id] === "completed");
  ok("released G selfie purged", (await one(`select selfie_media from verification_requests where id=$1`, [rG])).selfie_media === null);
  ok("hold_released audit recorded", (await one(`select count(*)::int as n from verification_selfie_retention_audit where job_id=$1 and event='hold_released'`, [gJob.id])).n === 1);

  // ---- 4. Checks and orphan objects ----------------------------------------
  console.log("checks + orphans");
  const C = await mkAccount();
  const pendingPath = `${C}/pending.jpg`, failedPath = `${C}/failed.jpg`, apprPath = `${C}/appr.jpg`;
  const cPending = await mkCheck({ account: C, status: "pending", path: pendingPath });
  const cFailed = await mkCheck({ account: C, status: "failed", path: failedPath });
  const cAppr = await mkCheck({ account: C, status: "approved", path: apprPath });
  const failedObj = (await one(`select id from storage.objects where name=$1`, [failedPath])).id;
  const pendingObj = (await one(`select id from storage.objects where name=$1`, [pendingPath])).id;
  await one(`select public.fb15_scan_retention(100) as n`);
  ok("pending check (pending review) not enqueued", (await jobFor(`check:${cPending}`)) === undefined);
  ok("approved check (approved reference) not enqueued", (await jobFor(`check:${cAppr}`)) === undefined);
  const fJob = await jobFor(`check:${cFailed}`);
  ok("failed check enqueued as rejected with captured object id", fJob?.reason === "rejected" && fJob.storage_object_id === failedObj);
  const oOwned = `${C}/orphan.jpg`;
  const oYoung = `${C}/young.jpg`;
  const oUnowned = `random-folder-${randomUUID()}/x.jpg`;
  const oldOrphanObj = await mkObject(oOwned, { ageMinutes: 60 });
  const youngObj = await mkObject(oYoung, { ageMinutes: 1 });
  const unownedObj = await mkObject(oUnowned, { ageMinutes: 600 });
  const legacyObj = await mkObject(`selfie-${C}-1700000000.jpg`, { ageMinutes: 60 });
  await one(`select public.fb15_scan_retention(100) as n`);
  ok("old owned orphan enqueued", (await jobFor(`object:${oldOrphanObj}`))?.reason === "orphaned");
  ok("legacy selfie-<account>-<ts> orphan enqueued", (await jobFor(`object:${legacyObj}`))?.reason === "orphaned");
  ok("young object (upload race guard, 15 min) NOT enqueued", (await jobFor(`object:${youngObj}`)) === undefined);
  ok("unowned object name NOT enqueued", (await jobFor(`object:${unownedObj}`)) === undefined);
  ok("object referenced by a check NOT enqueued as orphan", (await jobFor(`object:${pendingObj}`)) === undefined);

  const D = await mkAccount();
  await q(`insert into account_deletion_requests (account_id) values ($1) on conflict do nothing`, [D]);
  const delObj = await mkObject(`${D}/deleting.jpg`, { ageMinutes: 60 });
  await one(`select public.fb15_scan_retention(100) as n`);
  ok("account with deletion request is left to FB-14", (await jobFor(`object:${delObj}`)) === undefined);

  outcomes = await drain();
  ok("failed check job completed", outcomes[fJob.id] === "completed");
  ok("failed check object removed from storage", !(await objectExists(failedObj)));
  ok("pending check object still present (pending review)", await objectExists(pendingObj));
  ok("old orphan object removed", !(await objectExists(oldOrphanObj)));
  ok("young object still present", await objectExists(youngObj));
  ok("check verdict row retained after purge", (await one(`select status from verification_selfie_checks where id=$1`, [cFailed])).status === "failed");

  // ---- 5. Failure, retry, backoff, exhaustion, requeue, lease expiry --------
  console.log("failure + retry");
  const F = await mkAccount();
  const fPath = `${F}/retry.jpg`;
  await mkCheck({ account: F, status: "failed", path: fPath });
  await one(`select public.fb15_scan_retention(100) as n`);
  const rJob = await jobFor(`check:${(await one(`select id from verification_selfie_checks where storage_path=$1`, [fPath])).id}`);
  let claim = (await q(`select * from public.fb15_claim_retention_jobs(50)`)).find((j) => j.id === rJob.id);
  ok("retry job claimed once", claim?.attempts === 1);
  const failedOk = (await one(`select public.fb15_fail_retention_job($1,$2,'storage_remove_failed') as ok`, [claim.id, claim.lease_token])).ok;
  let row = await one(`select status, error_code, next_attempt_at > now() as later from verification_selfie_retention_jobs where id=$1`, [rJob.id]);
  ok("failure records code and schedules backoff", failedOk && row.status === "pending" && row.error_code === "storage_remove_failed" && row.later);
  ok("stale lease cannot fail the job again", (await one(`select public.fb15_fail_retention_job($1,$2,'storage_remove_failed') as ok`, [claim.id, claim.lease_token])).ok === false);
  ok("object still present after failed attempt", await objectExists(await one(`select storage_object_id from verification_selfie_retention_jobs where id=$1`, [rJob.id]).then((r) => r.storage_object_id)));
  await q(`update verification_selfie_retention_jobs set next_attempt_at = now() where id=$1`, [rJob.id]);

  // Lease expiry: claim, let the lease lapse, re-claim.
  claim = (await q(`select * from public.fb15_claim_retention_jobs(50)`)).find((j) => j.id === rJob.id);
  ok("retry claimed again (attempt 2)", claim?.attempts === 2);
  await q(`update verification_selfie_retention_jobs set lease_expires_at = now() - interval '1 second' where id=$1`, [rJob.id]);
  const reclaim = (await q(`select * from public.fb15_claim_retention_jobs(50)`)).find((j) => j.id === rJob.id);
  ok("expired lease is re-claimed with a new token", reclaim && reclaim.lease_token !== claim.lease_token && reclaim.attempts === 3);
  ok("old lease cannot complete (stale_lease)", (await one(`select public.fb15_complete_retention_job($1,$2,true,true,$3::uuid) as r`, [rJob.id, claim.lease_token, await one(`select storage_object_id from verification_selfie_retention_jobs where id=$1`, [rJob.id]).then((r) => r.storage_object_id)])).r === "stale_lease");

  // Completion refuses to claim success while the object still exists.
  const stillThere = await one(`select public.fb15_complete_retention_job($1,$2,true,true,$3::uuid) as r`, [rJob.id, reclaim.lease_token, reclaim.storage_object_id]);
  ok("complete refuses while the captured object still exists", stillThere.r === "verification_failed");
  await one(`select public.fb15_fail_retention_job($1,$2,'storage_verify_failed') as ok`, [rJob.id, reclaim.lease_token]);
  // Exhaust attempts.
  for (let i = 0; i < 12; i += 1) {
    if ((await one(`select status from verification_selfie_retention_jobs where id=$1`, [rJob.id])).status !== "pending") break;
    await q(`update verification_selfie_retention_jobs set next_attempt_at = now() where id=$1 and status = 'pending'`, [rJob.id]);
    const c = (await q(`select * from public.fb15_claim_retention_jobs(50)`)).find((j) => j.id === rJob.id);
    if (!c) break;
    await one(`select public.fb15_fail_retention_job($1,$2,'storage_remove_failed') as ok`, [c.id, c.lease_token]);
  }
  row = await one(`select status, attempts, max_attempts from verification_selfie_retention_jobs where id=$1`, [rJob.id]);
  ok("exhausted job becomes failed (visible), not retried forever", row.status === "failed" && row.attempts === row.max_attempts, JSON.stringify(row));
  const requeued = await one(`select public.fb15_requeue_failed_jobs($1) as n`, [F]);
  ok("requeue resets failed work", requeued.n >= 1);
  ok("requeue audited", (await one(`select count(*)::int as n from verification_selfie_retention_audit where job_id=$1 and event='requeued'`, [rJob.id])).n === 1);
  outcomes = await drain();
  ok("requeued job completes after storage recovers", outcomes[rJob.id] === "completed");
  ok("retried object removed", rJob.storage_object_id !== null && !(await objectExists(rJob.storage_object_id)));

  // ---- 6. Starvation: completed candidates must not block new work --------
  console.log("starvation");
  const Z = await mkAccount();
  const zRej = await mkRequest({ account: Z, status: "rejected", selfie: SELFIE(marker("z")) });
  const limited = await one(`select public.fb15_scan_retention(1) as n`);
  ok("limit=1 still reaches new work behind completed candidates", limited.n === 1 && (await jobFor(`request:${zRej}`)) !== undefined);
  await drain();

  // ---- 7. Withdrawal ---------------------------------------------------------
  console.log("withdrawal");
  const W = await mkAccount();
  const mW0 = marker("w0"), mW1 = marker("w1"), mW2 = marker("w2"), mW3 = marker("w3");
  const w0 = await mkRequest({ account: W, status: "pending", selfie: SELFIE(mW0), submittedAt: "2026-10-10T00:00:00Z" });
  const w1 = await mkRequest({ account: W, status: "pending", selfie: SELFIE(mW1), submittedAt: "2026-10-11T00:00:00Z" });
  const w2 = await mkRequest({ account: W, status: "approved", selfie: SELFIE(mW2), submittedAt: "2026-10-09T00:00:00Z" });
  const w3 = await mkRequest({ account: W, status: "rejected", selfie: SELFIE(mW3), submittedAt: "2026-10-08T00:00:00Z" });
  const wcAppr = await mkCheck({ account: W, status: "approved", path: `${W}/c-approved.jpg` });
  const wcFailed = await mkCheck({ account: W, status: "failed", path: `${W}/c-failed.jpg` });
  const wcApprObj = (await one(`select id from storage.objects where name=$1`, [`${W}/c-approved.jpg`])).id;
  await one(`select public.fb15_scan_retention(100) as n`);
  ok("pre-withdrawal: older pending queued as superseded", (await jobFor(`request:${w0}`))?.reason === "superseded");
  const wd = await one(`select public.fb15_withdraw_selfies($1) as n`, [W]);
  ok("withdrawal reports queued copies", wd.n >= 4, `n=${wd.n}`);
  ok("withdrawal converts superseded job to withdrawn", (await jobFor(`request:${w0}`)).reason === "withdrawn");
  ok("withdrawal clears verified flag", (await one(`select is_verified from user_profiles where id=$1`, [W])).is_verified === false);
  ok("withdrawal removes all inline seals immediately", (await q(`select count(*)::int as n from verification_requests where account_id=$1 and selfie_media is not null`, [W]))[0].n === 0);
  ok("approved request is erased on withdrawal (withdrawn overrides approved hold)", (await jobFor(`request:${w2}`)).reason === "withdrawn");
  ok("check rows are retained after withdrawal (verdict metadata)", (await one(`select count(*)::int as n from verification_selfie_checks where id in ($1,$2)`, [wcAppr, wcFailed])).n === 2);
  outcomes = await drain();
  ok("withdrawn approved check object removed", !(await objectExists(wcApprObj)));
  const wJobs = await q(`select status from verification_selfie_retention_jobs where account_id=$1`, [W]);
  ok("every withdrawal job completed (none held/pending/failed)", wJobs.length >= 5 && wJobs.every((r) => r.status === "completed"), JSON.stringify(wJobs.map((r) => r.status)));
  ok("withdrawal repeated is safe (no duplicate jobs)", (await one(`select public.fb15_withdraw_selfies($1) as n`, [W])).n === 0);

  // ---- 8. Metadata-only audit & client denial -------------------------------
  console.log("audit + grants");
  const cols = (await q(`select column_name from information_schema.columns where table_name='verification_selfie_retention_audit' order by ordinal_position`)).map((r) => r.column_name);
  ok("audit columns are the metadata allow-list", cols.join(",") === "id,job_id,source_table,event,reason,attempts,inline_absent,storage_absent,hold_reason,error_code,created_at", cols.join(","));
  const leak = await one(
    `select count(*)::int as n from verification_selfie_retention_audit a
     where a::text ilike '%data:image%' or a::text ilike '%base64%' or a::text ilike '%.jpg%' or a::text ilike '%MARK-%'
        or a::text like '%' || $1 || '%' or a::text like '%' || $2 || '%'`,
    [U1, W]
  );
  ok("audit contains no image data, paths, markers or account ids", leak.n === 0, `leaks=${leak.n}`);
  ok("jobs table has no image bytes column", (await one(`select count(*)::int as n from information_schema.columns where table_name='verification_selfie_retention_jobs' and data_type ilike '%bytea%'`)).n === 0);
  for (const role of ["anon", "authenticated"]) {
    for (const table of ["verification_selfie_retention_jobs", "verification_selfie_retention_audit"]) {
      const r = await one(`select has_table_privilege($1, $2, 'select') as s, has_table_privilege($1, $2, 'insert') as i`, [role, `public.${table}`]);
      ok(`${role} has no table privilege on ${table}`, r.s === false && r.i === false);
    }
    const e = await one(`select has_function_privilege($1, 'public.fb15_claim_retention_jobs(integer)', 'EXECUTE') as e`, [role]);
    ok(`${role} cannot execute claim function`, e.e === false);
    const e2 = await one(`select has_function_privilege($1, 'public.fb15_purge_inline(uuid,uuid)', 'EXECUTE') as e`, [role]);
    ok(`${role} cannot execute purge function`, e2.e === false);
  }
  ok("service_role can execute claim function", (await one(`select has_function_privilege('service_role', 'public.fb15_claim_retention_jobs(integer)', 'EXECUTE') as e`)).e === true);
  const unpinned = await q(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and proname like 'fb15_%' and (proconfig is null or not (proconfig::text like '%search_path%'))`);
  ok("every fb15 function pins search_path", unpinned.length === 0, unpinned.map((r) => r.proname).join(","));
  const definerOpen = await q(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and proname like 'fb15_%' and prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')`);
  ok("no security-definer fb15 function is executable by anon", definerOpen.length === 0);

  // ---- 9. Scheduling migration (pg_cron/pg_net/Vault emulated) -------------
  console.log("scheduling (emulated pg_cron/pg_net/Vault)");
  await client.query(`create schema if not exists vault;
    create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
    create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret, description from vault.secrets;
    create or replace function vault.create_secret(new_secret text, new_name text, new_description text) returns uuid language sql as $$ insert into vault.secrets (name, secret, description) values (new_name, new_secret, new_description) returning id $$;
    create schema if not exists net;
    create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
    create schema if not exists cron;
    create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
    create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
    create or replace function cron.unschedule(job_name text) returns boolean language sql as $$ delete from cron.job where jobname = job_name returning true $$;`);
  const sched = await readFile(new URL("../../supabase/migrations/20261102090100_fb15_retention_scheduling.sql", import.meta.url), "utf8");
  // Only the two extension lines are removed (the emulated schemas above stand in for them).
  const emulated = sched.replace(/^create extension if not exists pg_(cron|net) .*$/gm, "");
  await client.query(emulated);
  await client.query(emulated);
  ok("scheduling migration applies twice (idempotent)", true);
  const job = await one(`select jobname, schedule, active, command from cron.job where jobname='fb15-selfie-retention'`);
  ok("cron job every minute, active", job?.schedule === "* * * * *" && job.active === true);
  const secret = await one(`select decrypted_secret from vault.decrypted_secrets where name='fb15_retention_secret'`);
  ok("cron command contains no secret value", !!secret && !job.command.includes(secret.decrypted_secret));
  ok("verifier accepts the vault secret", (await one(`select public.fb15_verify_cron_secret($1) as ok`, [secret.decrypted_secret])).ok === true);
  ok("verifier rejects a wrong secret", (await one(`select public.fb15_verify_cron_secret($1) as ok`, ["x".repeat(64)])).ok === false);
  for (const role of ["anon", "authenticated"]) {
    const e = await one(`select has_function_privilege($1, 'public.fb15_trigger_retention()', 'EXECUTE') as e, has_function_privilege($1, 'public.fb15_verify_cron_secret(text)', 'EXECUTE') as v`, [role]);
    ok(`${role} cannot trigger or verify the cron secret`, e.e === false && e.v === false);
  }
  const triggerId = await one(`select public.fb15_trigger_retention() as id`);
  ok("trigger issues a pg_net request", String(triggerId.id) === "1");

  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) {
    console.error(`FAILED: ${fails.join(" | ")}`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error("FB-15 local test crashed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
