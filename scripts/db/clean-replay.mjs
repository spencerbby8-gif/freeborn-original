import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;
const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, "supabase/clean-start/manifest.json"), "utf8"));
const projectRef = process.env.FREEBORN_REPLAY_PROJECT_REF ?? "";
const expectedAck = `RESET_NONPRODUCTION_${projectRef}`;
const productionRefs = new Set(["ihwtpwlszegrjgakqsxx"]);
const reset = process.argv.includes("--reset");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new Error(message); };

if (!/^[a-z0-9]{20}$/.test(projectRef)) fail("FREEBORN_REPLAY_PROJECT_REF must be an exact Supabase project ref");
if (productionRefs.has(projectRef)) fail("Production replay is permanently refused by this runner");
if (process.env.FREEBORN_CLEAN_REPLAY_ACK !== expectedAck) fail(`set FREEBORN_CLEAN_REPLAY_ACK=${expectedAck} for this exact test project`);
if (!reset) fail("pass --reset explicitly; the runner will not mutate an implicit target");
if (!process.env.SUPABASE_TRANSACTION_POOLER) fail("SUPABASE_TRANSACTION_POOLER is required through a protected local environment");
if (!process.env.DATABASE_CA_FILE && !process.env.DATABASE_CA_CERT) fail("verified TLS requires DATABASE_CA_FILE or DATABASE_CA_CERT");

const dsn = new URL(process.env.SUPABASE_TRANSACTION_POOLER);
const username = decodeURIComponent(dsn.username);
if (username !== `postgres.${projectRef}`) {
  fail("the replay login must be postgres and scoped to the acknowledged project ref");
}
if (!/(^|\.)pooler\.supabase\.com$/.test(dsn.hostname)) fail("only the Supabase pooler is supported");
for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "sslpassword"]) dsn.searchParams.delete(key);
const ca = process.env.DATABASE_CA_CERT ?? readFileSync(process.env.DATABASE_CA_FILE, "utf8");
const client = new Client({
  connectionString: dsn.toString(),
  ssl: { rejectUnauthorized: true, ca, servername: dsn.hostname },
  connectionTimeoutMillis: 10_000,
  query_timeout: 0,
  statement_timeout: false,
});
client.on("error", (error) => console.error("database connection error:", error.code ?? "unknown"));

const applied = [];
try {
  await client.connect();
  await client.query("set statement_timeout = 0");
  const identity = await client.query(`select session_user, current_user,
    current_setting('is_superuser') as superuser,
    (select rolcreatedb and rolcreaterole from pg_roles where rolname = session_user) as project_owner`);
  if (identity.rows[0]?.session_user !== "postgres" || identity.rows[0]?.current_user !== "postgres" || identity.rows[0]?.project_owner !== true) {
    fail("the replay session must be the acknowledged project's postgres owner login");
  }
  const nonempty = await client.query(`select
    (select count(*)::int from auth.users) as auth_users,
    (select count(*)::int from storage.objects) as storage_objects,
    (select count(*)::int from storage.buckets where id in ('profile-photos','verification-selfies','chat-media')) as application_buckets`);
  if (nonempty.rows[0].auth_users !== 0 || nonempty.rows[0].storage_objects !== 0) {
    fail("refusing reset: Auth users or Storage objects exist; use a genuinely empty test project");
  }
  // Empty bucket metadata is safe to reconcile through the reviewed upsert step.
  // Supabase forbids direct bucket deletion, and unrelated buckets are preserved.
  console.log(`empty storage confirmed; existing application bucket metadata: ${nonempty.rows[0].application_buckets}`);

  for (const step of manifest.steps) {
    const bytes = readFileSync(join(root, step.path));
    if (sha256(bytes) !== step.sha256) fail(`input hash mismatch before reset: ${step.path}`);
  }

  console.log(`clean replay authorized for isolated project ${projectRef}; resetting application schema`);
  await client.query("drop schema public cascade");
  await client.query("create schema public");
  await client.query("grant all on schema public to postgres");
  await client.query("grant usage on schema public to anon, authenticated, service_role");
  await client.query("alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role");
  await client.query("alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role");
  await client.query("alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role");
  await client.query(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key, name text, statements text[], rollback text[],
      created_at timestamptz not null default now()
    )`);
  await client.query("truncate table supabase_migrations.schema_migrations");

  for (const [index, step] of manifest.steps.entries()) {
    const sql = readFileSync(join(root, step.path), "utf8");
    await client.query(sql);
    await client.query("insert into supabase_migrations.schema_migrations(version,name) values($1,$2)", [step.version, step.name]);
    applied.push(step.version);
    console.log(`applied ${index + 1}/${manifest.steps.length} ${step.name}`);
  }

  const verification = await client.query(`select
    (select count(*)::int from pg_tables where schemaname='public') as tables,
    (select count(*)::int from information_schema.columns col join pg_class t on t.relname=col.table_name join pg_namespace ns on ns.oid=t.relnamespace and ns.nspname=col.table_schema where col.table_schema='public' and t.relkind='r') as columns,
    (select count(*)::int from pg_indexes where schemaname='public') as indexes,
    (select count(*)::int from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and c.contype='c') as checks,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity) as rls_enabled_forced,
    (select count(*)::int from information_schema.table_privileges where table_schema='public' and grantee='anon') as anon_grants,
    (select count(*)::int from supabase_migrations.schema_migrations) as migrations,
    (select count(*)::int from auth.users) as auth_users,
    (select count(*)::int from storage.objects) as storage_objects`);
  const actual = verification.rows[0];
  const expected = { tables: 43, columns: 442, indexes: 125, checks: 79, rls_enabled_forced: 43, anon_grants: 0, migrations: 48, auth_users: 0, storage_objects: 0 };
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) fail(`post-replay verification ${key}=${actual[key]}, expected ${value}`);
  }
  console.log(JSON.stringify({ status: "pass", projectRef, applied: applied.length, catalog: actual }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: "fail", applied: applied.length, error: error instanceof Error ? error.message.slice(0, 300) : "unknown" }, null, 2));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
