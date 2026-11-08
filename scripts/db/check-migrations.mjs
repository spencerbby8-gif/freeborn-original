import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const manifestPath = "supabase/clean-start/manifest.json";
const manifest = JSON.parse(readFileSync(join(root, manifestPath), "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const read = (path) => readFileSync(join(root, path));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(manifest.schemaVersion === 1, "unsupported clean-start manifest schema");
check(manifest.steps.length === 44, `expected 44 replay steps, found ${manifest.steps.length}`);
check(new Set(manifest.steps.map((step) => step.version)).size === manifest.steps.length, "duplicate replay versions");
check(new Set(manifest.steps.map((step) => step.name)).size === manifest.steps.length, "duplicate replay names");
check(new Set(manifest.steps.map((step) => step.path)).size === manifest.steps.length, "duplicate replay paths");

for (const step of manifest.steps) {
  check(!step.path.includes("..") && !step.path.startsWith("/"), `unsafe replay path: ${step.path}`);
  check(existsSync(join(root, step.path)), `missing replay input: ${step.path}`);
  if (existsSync(join(root, step.path))) {
    check(sha256(read(step.path)) === step.sha256, `hash mismatch: ${step.path}`);
  }
}

const included = new Set(manifest.steps.map((step) => step.path));
const excluded = new Set(manifest.excludedScheduling);
check(excluded.size === 2, "both scheduling migrations must be explicitly excluded");
for (const path of excluded) {
  check(existsSync(join(root, path)), `excluded scheduling file is missing: ${path}`);
  check(!included.has(path), `scheduling file must not be replayed: ${path}`);
}

const migrationFiles = (directory) => readdirSync(join(root, directory), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => `${directory}/${entry.name}`)
  .sort();
for (const path of [...migrationFiles("supabase/migrations"), ...migrationFiles("db/migrations")]) {
  if (!excluded.has(path)) check(included.has(path), `migration is not accounted for by clean replay: ${path}`);
}
check(manifest.steps.filter((step) => step.path.startsWith("supabase/migrations/202607")).length === 11,
  "all 11 recovered legacy migrations must be present");

// Files present in the reviewed parent commit must remain byte-identical. This
// uses Git when available and a checked-in hash fallback for source archives.
const base = manifest.sourceCommit;
for (const step of manifest.steps) {
  if (step.path.startsWith("supabase/clean-start/") || step.path.startsWith("supabase/migrations/202607")) continue;
  try {
    const original = execFileSync("git", ["show", `${base}:${step.path}`], { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
    check(sha256(original) === sha256(read(step.path)), `applied migration was modified after ${base}: ${step.path}`);
  } catch (error) {
    if (error?.status !== 128) throw error;
  }
}

// The recovered legacy files have independent hashes from their source commit.
const legacyHashes = {
  "20260709190000_phase0_foundation.sql": "87994617a23c2a0a6452f4ff559409557d1921f892cfe83b551da4b789aea946",
  "20260709194500_phase1_auth_sync.sql": "0b14e478ac9ab297c1fd4ab6725af8a5a05a90ca6787e595550a907e32d314aa",
  "20260709200000_phase2_onboarding.sql": "2ccec28bd514f61f407ee70caabf21be5d1f2dc1d445e8558c2146dbf3223236",
  "20260709210000_phase3_discovery.sql": "74a3d0b4a8242665300ff2eac55d33072afe00d14c2e87ff72756a456b7081e3",
  "20260712000000_notification_blocked.sql": "77376585c6f6bfe8d0aa0aa2d0c07bb6fccf77cfac1e346461578890f509039f",
  "20260712120000_premium_onboarding_location_safety.sql": "be6761eae078ee63a8fe060eb3e53e2da2370276b678f564ac45656cd6d5975c",
  "20260712130000_verification_selfies.sql": "e41599ff847cf1714d19b2792c49f5b9739294f1f914625e6e05f15ca2306d19",
  "20260713120000_verification_tightening.sql": "fa7edc1409059112f48cf04e38d67eaca628c150c477a22c697a9077b85afa56",
  "20260713140000_identity_consistency.sql": "1db6b32047b93a5f751f6d5bddb6cc1ca0ee2990078d8d134880f34caa5a049f",
  "20260713160000_trust_history_reverification.sql": "364dc7f4a27ea5b8f8f4f1bc1228e970c4ce3540f368de1bf4824321d9b00b3d",
  "20260713170000_onboarding_step_constraint_hardening.sql": "37cc40c5d2266262564b5e375efd8b509f7e048e1d2feaf73a64fee712787295",
};
for (const [name, expected] of Object.entries(legacyHashes)) {
  const path = `supabase/migrations/${name}`;
  check(existsSync(join(root, path)), `recovered migration missing: ${name}`);
  if (existsSync(join(root, path))) check(sha256(read(path)) === expected, `recovered migration differs from legacy source: ${name}`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: "fail", failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "pass",
    replaySteps: manifest.steps.length,
    recoveredLegacy: 11,
    excludedScheduling: [...excluded].map((path) => relative(root, path)),
    expectedCatalog: manifest.expected,
  }, null, 2));
}
