import { readFileSync } from "node:fs";

const env = readFileSync(".env.example", "utf8");
const readme = readFileSync("README.md", "utf8");
const tls = readFileSync("src/db/tls.ts", "utf8");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(!env.includes("ihwtpwlszegrjgakqsxx"), ".env.example must not default to the Production Supabase project");
check(!env.includes("paskturljojjopxhnrik"), ".env.example must not default to a concrete Preview project");
check(env.includes("https://YOUR_PROJECT_REF.supabase.co"), "Supabase URLs must use explicit project placeholders");
check(env.includes("freeborn_runtime.YOUR_PROJECT_REF:YOUR_PASSWORD"), "runtime DSN must use a scoped role and placeholders");
check(!env.includes("postgresql://postgres:["), "the postgres bypass role must not be the DSN template");
check(!readme.includes("owner and therefore bypass RLS"), "README must not describe the old RLS-bypass runtime");
check(!/ssl:\s*\{\s*rejectUnauthorized:\s*false\s*\}/.test(tls), "remote TLS verification must not be disabled");
check(tls.includes("every environment"), "Supabase CA requirement must apply to every environment");

if (failures.length) {
  console.error(JSON.stringify({ status: "fail", failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "pass", productionProjectPinnedInTemplate: false, concretePreviewPinnedInTemplate: false, unverifiedRemoteTls: false, runtimeModel: "least-privilege" }, null, 2));
}
