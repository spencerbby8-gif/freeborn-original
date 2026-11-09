import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";

const root = process.cwd();
const raw = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const url = new URL(raw);
if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
  throw new Error("local test preparation refuses every non-loopback database");
}
if (!url.username) throw new Error("local test database user is required");
const temporary = mkdtempSync(join(tmpdir(), "freeborn-local-schema-"));
const client = new pg.Client({ connectionString: raw });
try {
  const config = join(temporary, "drizzle.json");
  writeFileSync(config, JSON.stringify({
    dialect: "postgresql",
    schema: resolve(root, "src/db/schema.ts"),
    out: temporary,
    dbCredentials: { url: raw },
  }));
  execFileSync(join(root, "node_modules/.bin/drizzle-kit"), ["generate", "--config", config], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 8 * 1024 * 1024,
  });
  const migrations = readdirSync(temporary).filter((name) => name.endsWith(".sql")).sort();
  if (migrations.length !== 1) throw new Error(`expected one generated baseline, found ${migrations.length}`);
  const baseline = readFileSync(join(temporary, migrations[0]), "utf8");
  const fb15 = readFileSync(join(root, "supabase/migrations/20261102090000_fb15_selfie_retention.sql"), "utf8");
  /* MED-INLINE-SELFIE: extends the FB-15 pipeline, so it is applied right after it. */
  const fb15SelfiePath = readFileSync(join(root, "supabase/migrations/20261109030000_fb15_selfie_storage_path.sql"), "utf8");
  await client.connect();
  await client.query("create schema if not exists extensions");
  await client.query("drop schema if exists public cascade");
  await client.query("drop schema if exists storage cascade");
  await client.query("create schema public");
  await client.query("create extension if not exists citext with schema extensions");
  await client.query("create extension if not exists vector with schema extensions");
  await client.query("grant usage on schema public, extensions to public");
  await client.query("set search_path = public, extensions");
  await client.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$`);
  await client.query(baseline);
  /* Mirrors the real Supabase catalog: storage.objects carries a metadata jsonb
     whose `size` key is the object's byte length. FB-15's mover commit point
     reads it, so a stub without it would pass locally and differ in Production. */
  await client.query(`create schema storage;
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text not null,
      name text not null, created_at timestamptz not null default now(),
      metadata jsonb not null default '{}'::jsonb
    );`);
  await client.query(fb15);
  await client.query(fb15SelfiePath);
  const result = await client.query(`select
    (select count(*)::int from pg_tables where schemaname='public') as tables,
    (select count(*)::int from information_schema.columns where table_schema='public') as columns,
    (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'fb15_%') as fb15_functions`);
  console.log(JSON.stringify({ status: "pass", baseline: "generated from src/db/schema.ts", fb15FunctionsApplied: true, ...result.rows[0] }, null, 2));
} finally {
  await client.end().catch(() => undefined);
  rmSync(temporary, { recursive: true, force: true });
}
