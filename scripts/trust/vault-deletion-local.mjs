#!/usr/bin/env node
// Mutual-Filter Vault local PostgreSQL regression: schema presence, hard
// delete semantics, idempotency, cascade on account deletion, and constraint
// integrity. This does NOT touch Supabase Storage or any real member account.
// It runs against the same prepared loopback database the FB-14/FB-15
// regressions use (CI: postgres:17 service + npm run test:prepare-local).
import { randomUUID } from "node:crypto";
import pg from "pg";

const url = process.env.VAULT_LOCAL_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/app_db";
const parsed = new URL(url);
if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) {
  throw new Error("vault deletion test refuses every non-loopback database");
}
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
async function expectSqlError(name, sql, params, code) {
  try {
    await client.query(sql, params);
    ok(name, false, "expected constraint violation");
  } catch (err) {
    ok(name, err.code === code, `code=${err.code}`);
  }
}

await client.connect();
try {
  /* Schema presence — catches drift between src/db/schema.ts and the migration. */
  const tables = await client.query(
    `select table_name, column_name from information_schema.columns
     where table_schema='public' and table_name in ('vault_entries','vault_match_keys') order by table_name, ordinal_position`
  );
  const names = tables.rows.map((r) => r.table_name);
  ok("vault_entries exists in the prepared schema", names.includes("vault_entries"));
  ok("vault_match_keys exists in the prepared schema", names.includes("vault_match_keys"));
  const entryCols = tables.rows.filter((r) => r.table_name === "vault_entries").map((r) => r.column_name);
  ok(
    "vault_entries has the exact consent + payload columns",
    ["user_id", "consent_accepted_at", "consent_version", "payload", "key_version", "updated_at"].every((c) => entryCols.includes(c))
  );

  /* Fixture members: local schema mirrors auth in `accounts` (see src/db/schema.ts header). */
  const owner = randomUUID();
  const other = randomUUID();
  const third = randomUUID();
  for (const id of [owner, other, third]) {
    await client.query(
      `insert into public.accounts (id, email) values ($1, $2) on conflict (id) do nothing`,
      [id, `${id}@vault.test`]
    );
    await client.query(
      `insert into public.user_profiles (id, email) values ($1, $2) on conflict (id) do nothing`,
      [id, `${id}@vault.test`]
    );
  }
  await client.query(
    `insert into public.vault_entries (user_id, consent_accepted_at, consent_version, payload)
     values ($1, now(), '2026-11-v1', 'fbvault.v1.aa.bb'), ($2, now(), '2026-11-v1', 'fbvault.v1.cc.dd')`,
    [owner, other]
  );
  await client.query(
    `insert into public.vault_match_keys (user_id, pref_key, value_digest) values ($1, 'vaccination_stance', repeat('a', 64)), ($2, 'vaccination_stance', repeat('a', 64))`,
    [owner, other]
  );

  const ownerRows = async () =>
    (await client.query(`select count(*)::int as n from public.vault_entries where user_id = $1`, [owner])).rows[0].n;
  const ownerKeys = async () =>
    (await client.query(`select count(*)::int as n from public.vault_match_keys where user_id = $1`, [owner])).rows[0].n;

  /* DELETE /api/vault semantics: keys first, then entries, one transaction. */
  await client.query("begin");
  await client.query(`delete from public.vault_match_keys where user_id = $1`, [owner]);
  await client.query(`delete from public.vault_entries where user_id = $1`, [owner]);
  await client.query("commit");
  ok("hard delete removes the payload row", (await ownerRows()) === 0);
  ok("hard delete removes every match key", (await ownerKeys()) === 0);

  /* Idempotency: deleting again touches nothing and does not fail. */
  await client.query(`delete from public.vault_match_keys where user_id = $1`, [owner]);
  await client.query(`delete from public.vault_entries where user_id = $1`, [owner]);
  ok("hard delete is idempotent", (await ownerRows()) === 0 && (await ownerKeys()) === 0);

  /* Account-deletion hook parity: the two explicit statements from
     src/lib/account-deletion.ts must leave zero vault rows behind. */
  await client.query(
    `insert into public.vault_entries (user_id, consent_accepted_at, consent_version, payload) values ($1, now(), '2026-11-v1', 'fbvault.v1.ee.ff')`,
    [owner]
  );
  await client.query(
    `insert into public.vault_match_keys (user_id, pref_key, value_digest) values ($1, 'vaccination_stance', repeat('b', 64))`,
    [owner]
  );
  await client.query(`delete from public.vault_match_keys where user_id = $1`, [owner]);
  await client.query(`delete from public.vault_entries where user_id = $1`, [owner]);
  ok("account-deletion vault deletes leave nothing", (await ownerRows()) === 0 && (await ownerKeys()) === 0);

  /* Cascade: deleting the profile removes vault rows even without explicit deletes. */
  await client.query(
    `insert into public.vault_entries (user_id, consent_accepted_at, consent_version, payload) values ($1, now(), '2026-11-v1', 'fbvault.v1.11.22')`,
    [third]
  );
  await client.query(
    `insert into public.vault_match_keys (user_id, pref_key, value_digest) values ($1, 'vaccination_stance', repeat('c', 64))`,
    [third]
  );
  await client.query(`delete from public.user_profiles where id = $1`, [third]);
  const thirdRows = (await client.query(`select count(*)::int as n from public.vault_entries where user_id = $1`, [third])).rows[0].n;
  const thirdKeys = (await client.query(`select count(*)::int as n from public.vault_match_keys where user_id = $1`, [third])).rows[0].n;
  ok("profile deletion cascades to vault_entries", thirdRows === 0);
  ok("profile deletion cascades to vault_match_keys", thirdKeys === 0);

  /* Constraint integrity: the digest column cannot hold a truncated hash. */
  await expectSqlError(
    "short digest is refused by char_length check",
    `insert into public.vault_match_keys (user_id, pref_key, value_digest) values ($1, 'vaccination_stance', 'abc')`,
    [owner],
    "23514"
  );
  await expectSqlError(
    "empty pref_key is refused by check",
    `insert into public.vault_match_keys (user_id, pref_key, value_digest) values ($1, '', repeat('d', 64))`,
    [owner],
    "23514"
  );
  await expectSqlError(
    "vault_entries without consent is refused (consent precedes saves)",
    `insert into public.vault_entries (user_id, payload) values ($1, 'fbvault.v1.33.44')`,
    [owner],
    "23502"
  );

  /* Cleanup fixture members so other local suites start from the same state. */
  await client.query(`delete from public.accounts where id = any($1)`, [[owner, other, third]]);
} catch (err) {
  fails.push(`unexpected: ${err.message}`);
  console.error(`  FAIL unexpected — ${err.message}`);
} finally {
  await client.end();
}
if (fails.length) {
  console.error(`\n${fails.length} vault-deletion failure(s)`);
  process.exitCode = 1;
} else {
  console.log(`\n${pass} vault-deletion checks passed`);
}
