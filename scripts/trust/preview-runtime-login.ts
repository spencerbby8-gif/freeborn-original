import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { resolveDatabaseConnection } from "../../src/db/tls";

type Probe = { id: string; sql: string; expected: "allow" | "deny" };

const probes: Probe[] = [
  { id: "health_select", sql: "select 1 as ok", expected: "allow" },
  { id: "runtime_table_read", sql: "select count(*) from public.mixer_venues", expected: "allow" },
  { id: "allowed_helper", sql: "select public.hamming64('0','0') as distance", expected: "allow" },
  { id: "deny_retention_jobs", sql: "select count(*) from public.verification_selfie_retention_jobs", expected: "deny" },
  { id: "deny_retention_audit", sql: "select count(*) from public.verification_selfie_retention_audit", expected: "deny" },
  { id: "deny_realtime_health", sql: "select count(*) from public.realtime_health", expected: "deny" },
  { id: "deny_auth_schema", sql: "select count(*) from auth.users", expected: "deny" },
  { id: "deny_storage_schema", sql: "select count(*) from storage.objects", expected: "deny" },
  { id: "deny_retention_worker", sql: "select public.fb15_claim_retention_jobs(1)", expected: "deny" },
  { id: "deny_ddl", sql: "create table public.runtime_must_not_create(id integer)", expected: "deny" },
];

async function main() {
  const host = process.env.PREVIEW_POOLER_HOST;
  const projectRef = process.env.PREVIEW_PROJECT_REF;
  const passwordFile = process.env.PREVIEW_RUNTIME_PASSWORD_FILE;
  if (!host || !projectRef || !passwordFile) {
    throw new Error("PREVIEW_POOLER_HOST, PREVIEW_PROJECT_REF, and PREVIEW_RUNTIME_PASSWORD_FILE are required.");
  }
  const password = readFileSync(passwordFile, "utf8").trim();
  const caCertificate = process.env.PREVIEW_CA_CERT_FILE
    ? readFileSync(process.env.PREVIEW_CA_CERT_FILE, "utf8")
    : undefined;
  const username = `freeborn_runtime.${projectRef}`;
  const dsn = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:6543/postgres?sslmode=require&pgbouncer=true`;
  const connection = resolveDatabaseConnection(dsn, { vercelEnv: "preview", caCertificate });
  const pool = new Pool({
    connectionString: connection.connectionString,
    ssl: connection.ssl,
    max: 1,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 1_000,
  });
  const results: Array<Record<string, unknown>> = [];
  try {
    const identity = await pool.query(
      "select current_user as username, current_setting('is_superuser') as is_superuser",
    );
    results.push({ id: "identity", pass: identity.rows[0]?.username === "freeborn_runtime" && identity.rows[0]?.is_superuser === "off", username: identity.rows[0]?.username, is_superuser: identity.rows[0]?.is_superuser });
    for (const probe of probes) {
      try {
        await pool.query(probe.sql);
        results.push({ id: probe.id, expected: probe.expected, pass: probe.expected === "allow", outcome: "allowed" });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
        results.push({ id: probe.id, expected: probe.expected, pass: probe.expected === "deny" && code === "42501", outcome: "denied", code });
      }
    }
  } finally {
    await pool.end();
  }
  const failed = results.filter((result) => result.pass !== true);
  console.log(JSON.stringify({ status: failed.length === 0 ? "pass" : "fail", tls: caCertificate ? "verified_ca_and_hostname" : "encrypted_unverified", results }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  console.log(JSON.stringify({ status: "connection_error", code }));
  process.exitCode = 1;
});
