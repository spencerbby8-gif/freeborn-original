import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const raw = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const parsed = new URL(raw);
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
  throw new Error("profile trigger regression refuses every non-loopback database");
}
const owner = new pg.Client({ connectionString: raw });
const password = randomBytes(24).toString("hex");
const id = randomUUID();
const email = `trigger-${id}@example.invalid`;
let member;
let runtime;
const results = [];
const check = (name, condition, detail = "") => {
  results.push({ name, pass: Boolean(condition), detail });
  if (!condition) throw new Error(`${name} failed ${detail}`);
};
const localLogin = (username) => {
  const url = new URL(raw);
  url.username = username;
  url.password = password;
  return new pg.Client({ connectionString: url.toString() });
};
const expectDenied = async (client, sql, name) => {
  try {
    await client.query(sql);
    throw new Error(`${name} unexpectedly succeeded`);
  } catch (error) {
    check(name, error.code === "42501", error.code ?? error.message);
  }
};

try {
  await owner.connect();
  await owner.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login; end if;
    if not exists (select 1 from pg_roles where rolname='freeborn_runtime') then create role freeborn_runtime login; end if;
  end $$`);
  for (const role of ["authenticator", "freeborn_runtime"]) {
    const escaped = password.replaceAll("'", "''");
    await owner.query(`alter role ${role} login password '${escaped}'`);
  }
  await owner.query("grant authenticated to authenticator");
  await owner.query("insert into public.accounts(id,email) values($1,$2)", [id, email]);
  await owner.query("insert into public.user_profiles(id,email,display_name) values($1,$2,'before')", [id, email]);
  await owner.query(readFileSync("supabase/migrations/20261108000000_fix_profile_update_noop.sql", "utf8"));
  await owner.query(`drop trigger if exists user_profiles_member_write_guard on public.user_profiles;
    create trigger user_profiles_member_write_guard before insert or update on public.user_profiles
    for each row execute function public.enforce_user_profiles_member_writes();
    grant usage on schema public to authenticator, authenticated, freeborn_runtime;
    grant select, update on public.user_profiles to authenticated, freeborn_runtime;`);

  member = localLogin("authenticator");
  await member.connect();
  await member.query("set role authenticated");
  await member.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: "authenticated" })]);
  const current = await member.query("update public.user_profiles set display_name='current-claims' where id=$1 returning display_name", [id]);
  check("current_postgrest_claims_persist", current.rows[0]?.display_name === "current-claims");
  await expectDenied(member, `update public.user_profiles set is_verified=true where id='${id}'`, "current_claims_privileged_write_denied");

  await member.query("reset request.jwt.claims");
  await member.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
  const legacy = await member.query("update public.user_profiles set display_name='legacy-claim' where id=$1 returning display_name", [id]);
  check("legacy_claim_persists", legacy.rows[0]?.display_name === "legacy-claim");

  await member.query("reset request.jwt.claim.role");
  const missing = await member.query("update public.user_profiles set display_name='missing-claims' where id=$1 returning display_name", [id]);
  check("missing_claims_ordinary_write_persists", missing.rows[0]?.display_name === "missing-claims");
  await expectDenied(member, `update public.user_profiles set is_verified=true where id='${id}'`, "missing_claims_fail_closed");

  runtime = localLogin("freeborn_runtime");
  await runtime.connect();
  const server = await runtime.query("update public.user_profiles set is_verified=true,display_name='runtime' where id=$1 returning is_verified,display_name", [id]);
  check("runtime_server_write_persists", server.rows[0]?.is_verified === true && server.rows[0]?.display_name === "runtime");
  console.log(JSON.stringify({ status: "pass", checks: results }, null, 2));
} finally {
  await member?.end().catch(() => undefined);
  await runtime?.end().catch(() => undefined);
  await owner.query("drop trigger if exists user_profiles_member_write_guard on public.user_profiles").catch(() => undefined);
  await owner.query("delete from public.user_profiles where id=$1", [id]).catch(() => undefined);
  await owner.query("delete from public.accounts where id=$1", [id]).catch(() => undefined);
  await owner.end().catch(() => undefined);
}
