#!/usr/bin/env node
// FB-14 local PostgreSQL regression: durable queue, leases, retries, backoff,
// exhaustion/requeue, duplicate enqueue, minimal public status, and client-role
// denial. This does NOT touch Supabase Storage or any real member account.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.FB14_LOCAL_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/app_db";
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
async function expectSqlError(name, sql, code) {
  try {
    await client.query(sql);
    ok(name, false, "expected permission denial");
  } catch (err) {
    ok(name, err.code === code, `code=${err.code}`);
  }
}

await client.connect();
const testIds = [];
try {
  await client.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);
  const migration = await readFile(new URL("../../supabase/migrations/20261102040000_fb14_durable_account_deletion.sql", import.meta.url), "utf8");
  await client.query(migration);

  const id = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const pathCases = [
    [id, "profile-photos", `${id}/a.jpg`, true],
    [id, "verification-selfies", `selfie-${id}-1.jpg`, true],
    [id, "profile-photos", `selfie-${id}-1.jpg`, false],
    [id, "profile-photos", `${other}/a.jpg`, false],
    [id, "profile-photos", `${id}/../${other}/a.jpg`, false],
    [id, "profile-photos", `https://example.test/${id}/a.jpg`, false],
    [id, "profile-photos", `/${id}/a.jpg`, false],
  ];
  for (const [account, bucket, path, expected] of pathCases) {
    const r = await client.query("select public.fb14_owned_storage_path($1::uuid,$2,$3) as owned", [account, bucket, path]);
    ok(`path validation ${bucket} ${path.slice(0, 48)}`, r.rows[0].owned === expected);
  }

  const account = randomUUID();
  testIds.push(account);
  const ins = await client.query(
    "insert into public.account_deletion_requests(account_id) values($1::uuid) returning status_token",
    [account]
  );
  const token = ins.rows[0].status_token;
  await client.query(
    `insert into public.storage_cleanup_jobs(deletion_account_id,bucket,owner_prefix,object_paths)
     values($1::uuid,'profile-photos',$1::uuid || '/',array[$1::uuid || '/a.jpg'])
     on conflict (deletion_account_id,bucket) do nothing`,
    [account]
  );
  await client.query(
    `insert into public.storage_cleanup_jobs(deletion_account_id,bucket,owner_prefix,object_paths)
     values($1::uuid,'profile-photos',$1::uuid || '/',array[$1::uuid || '/a.jpg'])
     on conflict (deletion_account_id,bucket) do nothing`,
    [account]
  );
  const dup = await client.query("select count(*)::int as n from public.storage_cleanup_jobs where deletion_account_id=$1::uuid", [account]);
  ok("duplicate enqueue is idempotent", dup.rows[0].n === 1);

  let claim = await client.query("select * from public.fb14_claim_cleanup_jobs(10) where deletion_account_id=$1::uuid", [account]);
  ok("claim leases due work", claim.rows.length === 1 && claim.rows[0].attempts === 1 && !!claim.rows[0].lease_token);
  const job = claim.rows[0];
  const wrongLease = randomUUID();
  const badComplete = await client.query("select public.fb14_complete_cleanup_job($1::uuid,$2::uuid) as done", [job.id, wrongLease]);
  ok("wrong lease cannot complete a job", badComplete.rows[0].done === false);

  const failed = await client.query("select public.fb14_fail_cleanup_job($1::uuid,$2::uuid,$3) as failed", [job.id, job.lease_token, "simulated storage outage"]);
  ok("storage failure is recorded", failed.rows[0].failed === true);
  const afterFail = await client.query("select status, attempts, next_attempt_at > now() as backed_off, last_error from public.storage_cleanup_jobs where id=$1::uuid", [job.id]);
  ok("failure retries with backoff", afterFail.rows[0].status === "pending" && afterFail.rows[0].attempts === 1 && afterFail.rows[0].backed_off === true && afterFail.rows[0].last_error === "simulated storage outage");

  await client.query("update public.storage_cleanup_jobs set next_attempt_at=now() where id=$1::uuid", [job.id]);
  claim = await client.query("select * from public.fb14_claim_cleanup_jobs(10) where deletion_account_id=$1::uuid", [account]);
  ok("retry is claimable after backoff", claim.rows.length === 1 && claim.rows[0].attempts === 2);
  const interrupted = claim.rows[0];
  await client.query("update public.storage_cleanup_jobs set lease_expires_at=now()-interval '1 second' where id=$1::uuid", [interrupted.id]);
  claim = await client.query("select * from public.fb14_claim_cleanup_jobs(10) where deletion_account_id=$1::uuid", [account]);
  ok("interrupted job is reclaimed after lease expiry", claim.rows.length === 1 && claim.rows[0].attempts === 3 && claim.rows[0].lease_token !== interrupted.lease_token);
  const recovered = claim.rows[0];
  const done = await client.query("select public.fb14_complete_cleanup_job($1::uuid,$2::uuid) as done", [recovered.id, recovered.lease_token]);
  ok("recovered job completes with the current lease", done.rows[0].done === true);
  const completedRequest = await client.query("select status, storage_completed_at is not null as complete from public.account_deletion_requests where account_id=$1::uuid", [account]);
  ok("request completes only after all jobs complete", completedRequest.rows[0].status === "completed" && completedRequest.rows[0].complete === true);

  const exhaustedAccount = randomUUID();
  testIds.push(exhaustedAccount);
  await client.query("insert into public.account_deletion_requests(account_id) values($1::uuid)", [exhaustedAccount]);
  await client.query(
    `insert into public.storage_cleanup_jobs(deletion_account_id,bucket,owner_prefix,max_attempts)
     values($1::uuid,'verification-selfies',$1::uuid || '/',1)`,
    [exhaustedAccount]
  );
  claim = await client.query("select * from public.fb14_claim_cleanup_jobs(10) where deletion_account_id=$1::uuid", [exhaustedAccount]);
  const exhaustedJob = claim.rows[0];
  await client.query("select public.fb14_fail_cleanup_job($1::uuid,$2::uuid,$3)", [exhaustedJob.id, exhaustedJob.lease_token, "permanent outage"]);
  const exhausted = await client.query("select j.status as job_status, r.status as request_status from public.storage_cleanup_jobs j join public.account_deletion_requests r on r.account_id=j.deletion_account_id where j.id=$1::uuid", [exhaustedJob.id]);
  ok("exhausted retries fail visibly, never complete", exhausted.rows[0].job_status === "failed" && exhausted.rows[0].request_status === "cleanup_failed");
  const requeued = await client.query("select public.fb14_requeue_failed_jobs($1::uuid) as n", [exhaustedAccount]);
  ok("operator requeue returns failed work to the queue", requeued.rows[0].n === 1);
  claim = await client.query("select * from public.fb14_claim_cleanup_jobs(10) where deletion_account_id=$1::uuid", [exhaustedAccount]);
  ok("requeued work is claimable", claim.rows.length === 1 && claim.rows[0].attempts === 1);
  await client.query("select public.fb14_complete_cleanup_job($1::uuid,$2::uuid)", [claim.rows[0].id, claim.rows[0].lease_token]);

  const status = await client.query("select public.fb14_deletion_status($1::uuid) as status", [token]);
  const keys = Object.keys(status.rows[0].status ?? {}).sort();
  ok("public status is minimal", JSON.stringify(keys) === JSON.stringify(["completedAt", "requestedAt", "status"]));

  await client.query("set role authenticated");
  await expectSqlError("authenticated cannot read cleanup jobs", "select count(*) from public.storage_cleanup_jobs", "42501");
  const authStatus = await client.query("select public.fb14_deletion_status($1::uuid) as status", [token]);
  ok("authenticated can use only the token status function", authStatus.rows[0].status?.status === "completed");
  await client.query("reset role");
  await client.query("set role anon");
  await expectSqlError("anon cannot read deletion requests", "select count(*) from public.account_deletion_requests", "42501");
  await client.query("reset role");
} catch (err) {
  fails.push(`unexpected error: ${err.message}`);
  console.error(err);
} finally {
  for (const id of testIds) {
    await client.query("delete from public.storage_cleanup_jobs where deletion_account_id=$1::uuid", [id]).catch(() => {});
    await client.query("delete from public.account_deletion_requests where account_id=$1::uuid", [id]).catch(() => {});
  }
  await client.end();
}

console.log(`\nFB-14 local queue: ${pass} passed, ${fails.length} failed`);
if (fails.length > 0) process.exit(1);
