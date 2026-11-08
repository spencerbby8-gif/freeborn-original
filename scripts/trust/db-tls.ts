import assert from "node:assert/strict";
import { resolveDatabaseConnection } from "../../src/db/tls";

let passed = 0;
function test(name: string, run: () => void) {
  run();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const SUPABASE_DSN =
  "postgresql://runtime.preview:p%40ss%2Fword@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&sslrootcert=ignored.pem";

test("DSN TLS keys cannot overwrite the explicit pool policy", () => {
  const pem = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----";
  const resolved = resolveDatabaseConnection(SUPABASE_DSN, { vercelEnv: "preview", caCertificate: pem });
  const url = new URL(resolved.connectionString);
  assert.equal(url.searchParams.has("sslmode"), false);
  assert.equal(url.searchParams.has("sslrootcert"), false);
  assert.equal(url.searchParams.get("pgbouncer"), "true");
  assert.equal(url.username, "runtime.preview");
  assert.equal(url.password, "p%40ss%2Fword");
  assert.deepEqual(resolved.ssl, { ca: pem, rejectUnauthorized: true });
});

test("a PEM CA enables certificate and hostname verification", () => {
  const pem = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----";
  const resolved = resolveDatabaseConnection(SUPABASE_DSN, {
    caCertificate: pem,
    vercelEnv: "production",
  });
  assert.deepEqual(resolved.ssl, { ca: pem, rejectUnauthorized: true });
});

test("escaped PEM newlines are accepted", () => {
  const pem = "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----";
  const resolved = resolveDatabaseConnection(SUPABASE_DSN, {
    caCertificate: pem,
    vercelEnv: "preview",
  });
  assert.equal(resolved.ssl?.ca?.toString().includes("\\n"), false);
});

test("Vercel production fails closed without the Supabase CA", () => {
  assert.throws(
    () => resolveDatabaseConnection(SUPABASE_DSN, { vercelEnv: "production" }),
    /DATABASE_CA_CERT is required/,
  );
});

test("Preview and development also fail closed without the Supabase CA", () => {
  for (const vercelEnv of ["preview", "development"]) {
    assert.throws(
      () => resolveDatabaseConnection(SUPABASE_DSN, { vercelEnv }),
      /every environment/,
    );
  }
});

test("a CA path or opaque secret is not mistaken for a certificate", () => {
  assert.throws(
    () => resolveDatabaseConnection(SUPABASE_DSN, { caCertificate: "/tmp/root.crt" }),
    /must be a PEM certificate/,
  );
});

test("local disposable PostgreSQL remains plaintext and loopback-only", () => {
  const resolved = resolveDatabaseConnection(
    "postgresql://postgres:postgres@127.0.0.1:5432/app_db?sslmode=require",
    { vercelEnv: "development" },
  );
  assert.equal(resolved.ssl, undefined);
  assert.equal(new URL(resolved.connectionString).searchParams.has("sslmode"), false);
});

test("non-Supabase remote providers retain public-CA verification", () => {
  const resolved = resolveDatabaseConnection(
    "postgresql://u:p@db.example.com:5432/app?sslmode=require",
    { vercelEnv: "preview" },
  );
  assert.deepEqual(resolved.ssl, { rejectUnauthorized: true });
});

test("non-Postgres schemes are rejected", () => {
  assert.throws(
    () => resolveDatabaseConnection("https://db.example.com/?sslmode=require"),
    /must use postgres/,
  );
});

test("no process-global TLS bypass is introduced", () => {
  const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  resolveDatabaseConnection(SUPABASE_DSN, {
    vercelEnv: "preview",
    caCertificate: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
  });
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, before);
});

console.log(`DB TLS: ALL PASS (${passed}/${passed})`);
