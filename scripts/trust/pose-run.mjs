#!/usr/bin/env node
/**
 * pose-run.mjs — the driver for scripts/trust/pose-e2e.ts.
 *
 * It does four things, and each one exists because the absence of it produced a fake green in an
 * earlier version of this suite:
 *
 *  1. BUILD. The suite and the gateway double are bundled with esbuild from the real sources, using
 *     a generated tsconfig whose `paths` replace exactly two modules (the token resolver and the
 *     connection). A stale bundle is the classic false pass, so any previous artifact is deleted
 *     first and the build must succeed — there is no fallback to a second esbuild binary.
 *  2. START THE VISION DOUBLE IN THIS PROCESS, on an ephemeral port, and hand its URL to the
 *     children. One witness for the whole run means one log to testify about every prompt the
 *     product actually sent; per-mode children see the same record.
 *  3. RUN ONE CHILD PER MODE, sequentially. Several behaviours under test are configured by
 *     environment at module scope (whether a second vision engine is configured, and
 *     FREEBORN_POSE_ENFORCEMENT), so they cannot coexist in one process. Sequential, because the
 *     children share a Postgres schema and each mode reads the audit table by physical insertion
 *     order — interleaving would make "the row this test wrote" mean nothing.
 *  4. GUARD THE ARTIFACT. The bundle is scanned for strings that must never appear in a test
 *     harness: a connection string, a service-role client, or any secret value at all.
 *
 * Usage:
 *   node scripts/trust/pose-run.mjs                 # every mode
 *   POSE_E2E_ONLY=legacy node scripts/trust/pose-run.mjs
 *   E2E_DATABASE_URL=postgresql://... node scripts/trust/pose-run.mjs
 */
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SRC = (p) => resolve(ROOT, p);

const DB_URL = process.env.E2E_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const BUNDLE = resolve(HERE, ".pose-e2e.build.mjs");
const GW_BUNDLE = resolve(HERE, ".gateway.build.mjs");
const TSCONFIG_E2E = resolve(HERE, "tsconfig.e2e.json");

const MODES = ["main", "adversarial", "ratelimit", "legacy", "single", "refused"];
const ONLY = (process.env.POSE_E2E_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const RUN = ONLY.length ? MODES.filter((m) => ONLY.includes(m)) : MODES;
if (RUN.length === 0) {
  console.error(`POSE_E2E_ONLY matched nothing. Known modes: ${MODES.join(", ")}`);
  process.exit(2);
}

/** The suite addresses the real app modules through the alias, so the alias must exist before we
 *  start — otherwise esbuild silently resolves `@/db` to nothing and every import throws. */
function assertProjectShape() {
  /* A text check, not a JSON.parse: tsconfig.json is JSONC (comments are legal in it), and a
     comment-stripping regex is exactly the kind of thing that breaks quietly when someone adds a
     path containing "/*". What the suite needs is one fact — that "@/..." resolves into src/. */
  const tsraw = readFileSync(SRC("tsconfig.json"), "utf8");
  if (!/"@\/\*"\s*:\s*\[\s*"\.\/src\/\*"/.test(tsraw)) {
    console.error('tsconfig.json must map "@/*" to "./src/*" — the suite depends on it to import the shipped modules.');
    process.exit(2);
  }
  for (const f of ["scripts/trust/pose-e2e.ts", "scripts/trust/pose-fixtures/db.ts", "scripts/trust/pose-fixtures/app-auth.ts", "scripts/trust/pose-fixtures/gateway.ts"]) {
    if (!existsSync(SRC(f))) {
      console.error(`missing ${f}`);
      process.exit(2);
    }
  }
}

/** Two replacements, both deliberate and both recorded here so a reviewer can see the boundary of
 *  the test: the bearer-token resolver and the database connection. Nothing else is substituted. */
function writeE2eTsconfig() {
  writeFileSync(
    TSCONFIG_E2E,
    JSON.stringify(
      {
        compilerOptions: {
          target: "es2022",
          module: "esnext",
          moduleResolution: "bundler",
          strict: true,
          skipLibCheck: true,
          allowImportingTsExtensions: true,
          baseUrl: ROOT,
          paths: {
            "@/db": ["./scripts/trust/pose-fixtures/db.ts"],
            "@/lib/app-auth": ["./scripts/trust/pose-fixtures/app-auth.ts"],
            "@/*": ["./src/*"],
          },
        },
        include: ["**/*.ts"],
      },
      null,
      2
    ) + "\n"
  );
}

async function bundle() {
  /* Delete-then-build, never `|| fallback`: reusing a previous artifact is how a suite reports
     the behaviour of code that no longer exists. */
  rmSync(BUNDLE, { force: true });
  rmSync(GW_BUNDLE, { force: true });
  await build({
    entryPoints: [SRC("scripts/trust/pose-e2e.ts")],
    outfile: BUNDLE,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    packages: "external",
    legalComments: "none",
    tsconfig: TSCONFIG_E2E,
    logLevel: "warning",
    footer: { js: "main().then((c) => { process.exitCode = c ?? 0; }).catch((e) => { console.error('pose-e2e crashed:', e && e.stack ? e.stack : e); process.exitCode = 3; });" },
  });
  await build({
    entryPoints: [SRC("scripts/trust/pose-fixtures/gateway.ts")],
    outfile: GW_BUNDLE,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    packages: "external",
    legalComments: "none",
    logLevel: "warning",
  });

  const src = readFileSync(BUNDLE, "utf8");
  const FORBIDDEN = [
    ["a baked-in connection string", /postgresql:\/\//],
    ["a Supabase service-role client", /service_role|SUPABASE_SERVICE/i],
    ["a bearer secret literal", /ghp_[A-Za-z0-9]/],
    ["the production pooler variable, read from the bundle", /SUPABASE_TRANSACTION_POOLER/],
  ];
  const hits = FORBIDDEN.filter(([, re]) => re.test(src));
  if (hits.length) {
    console.error("bundle guard tripped — the harness must not carry these:");
    for (const [why] of hits) console.error(`  - ${why}`);
    process.exit(2);
  }
  /* And the inverse: the shipped code must be IN there. A mis-set alias that quietly excluded the
     route would leave a suite that tests nothing at all and prints the same word. */
  const REQUIRED = [
    ["the pose provenance consumer", /consumePoseChallenge|pose lookup failed/],
    ["the freshness consumer", /lost the consume race|no liveness token presented/],
    ["the legacy hatch", /legacy hatch/],
    ["the browser-integrity evaluator", /chromeWithoutClientHints/],
    ["the audit marker", /unproven:legacy-pose/],
  ];
  const missing = REQUIRED.filter(([, re]) => !re.test(src)).map(([what]) => what);
  if (missing.length) {
    console.error("the bundle does NOT contain the shipped code it is supposed to exercise:");
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(2);
  }
  return { bytes: src.length };
}

/** Every mode seeds `e2e-<mode>-<n>@freeborn.test`. Clearing by that pattern rather than by
 *  table truncation keeps anything a developer put in the same local database. */
async function resetDatabase(pg) {
  const drop = async (sql) => {
    await pg.query(sql);
  };
  await drop(`delete from verification_requests where account_id in (select id from user_profiles where email like 'e2e-%@freeborn.test')`);
  await drop(`delete from security_events where email like 'e2e-%@freeborn.test'`);
  await drop(`delete from human_challenges where email like 'e2e-%@freeborn.test'`);
  await drop(`delete from verification_challenges where user_id in (select id from user_profiles where email like 'e2e-%@freeborn.test')`);
  await drop(`delete from verification_rate_limits where user_id in (select id from user_profiles where email like 'e2e-%@freeborn.test')`);
  await drop(`delete from profile_photos where user_id in (select id from user_profiles where email like 'e2e-%@freeborn.test')`);
  await drop(`update user_profiles set is_verified = false, last_verified_at = null where email like 'e2e-%@freeborn.test'`);
}

function envFor(mode, gatewayUrl) {
  const members = [];
  for (const m of MODES) for (const n of [1, 2, 3]) members.push(`e2e-${m}-${n}@freeborn.test`);
  const base = {
    POSE_E2E_MODE: mode,
    __POSE_E2E_BASE: gatewayUrl,
    E2E_MEMBERS: members.join(","),
    E2E_DATABASE_URL: DB_URL,
    /* The bundle reads this name so that nothing in it can pick up a developer's real
       SUPABASE_TRANSACTION_POOLER; both are set to the loopback URL on purpose. */
    SUPABASE_TRANSACTION_POOLER: DB_URL,
    DATABASE_URL: DB_URL,
    /* Emptied, not deleted: the CSRF assertions are only meaningful when no origin is allow-listed
       and the guard has to fall back to same-host comparison. */
    NEXT_PUBLIC_APP_URL: "",
    FREEBORN_ALLOWED_ORIGINS: "",
    /* Stage 1's gateway: always configured, or the suite would never exercise the dual path. */
    ANTIGRAVITY_BASE_URL: gatewayUrl,
    ANTIGRAVITY_FREE_API_KEY: "e2e-stage1-key",
    /* No Supabase project is reachable from here and none is needed: the token resolver is the one
       stubbed module, and getMember never calls out. */
    SUPABASE_URL: "",
    SUPABASE_ANON_KEY: "",
    FREEBORN_HUMAN_CHALLENGE: process.env.FREEBORN_HUMAN_CHALLENGE ?? "off",
  };
  /* The pose control's enforcement level is a process-wide constant, read at module scope — hence
     one child per mode. `review` is written explicitly everywhere else so no inherited value can
     silently turn the hatch on for a mode that is supposed to be enforcing. */
  base.FREEBORN_POSE_ENFORCEMENT = mode === "legacy" ? "legacy" : "review";
  if (mode === "refused") {
    /* Configured, and rejected by the key-format guard in src/lib/lm7.ts: the state an operator
       actually ends up in after a key rotation, and the one that used to be reported as
       engine:"single" with no further explanation. */
    base.VOID_AI_BASE_URL = gatewayUrl;
    base.VOID_AI_API_KEY = "e2e-not-a-voidai-key";
  } else if (mode !== "single") {
    base.VOID_AI_BASE_URL = gatewayUrl;
    base.VOID_AI_API_KEY = "sk-voidai-e2e-stage2-key";
  }
  return base;
}

function runChild(mode, gatewayUrl) {
  return new Promise((resolveRun) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [BUNDLE], {
      cwd: ROOT,
      env: { ...process.env, ...envFor(mode, gatewayUrl) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let partial = "";
    const emit = (chunk, prefix) => {
      partial += chunk;
      const lines = partial.split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(`  ${prefix} ${line}\n`);
    };
    child.stdout.on("data", (b) => {
      const s = String(b);
      out += s;
      emit(s, mode.padEnd(11));
    });
    child.stderr.on("data", (b) => {
      out += String(b);
      emit(String(b), `${mode.padEnd(8)}!`);
    });
    child.on("close", (code) => {
      if (partial) process.stdout.write(`  ${mode.padEnd(11)} ${partial}\n`);
      resolveRun({ mode, code: code ?? 1, ms: Date.now() - t0, out });
    });
  });
}

async function main() {
  assertProjectShape();
  writeE2eTsconfig();
  const { bytes } = await bundle();
  console.log(`built pose-e2e bundle (${(bytes / 1024).toFixed(0)} kB) + gateway double`);

  const { startGateway } = await import(GW_BUNDLE);
  const gw = await startGateway();
  console.log(`vision double listening on ${gw.url}`);

  const { Pool } = await import("pg");
  const pg = new Pool({ connectionString: DB_URL, max: 3 });
  await resetDatabase(pg);

  const results = [];
  for (const mode of RUN) {
    const r = await runChild(mode, gw.url);
    results.push(r);
    const counts = /(\d+)\/(\d+) passed, (\d+) failed, (\d+) skipped/.exec(r.out);
    const tally = counts ? `${counts[1]}/${counts[2]} pass, ${counts[3]} fail, ${counts[4]} skip` : r.code === 0 ? "no summary line" : `exit ${r.code}`;
    console.log(`  ${r.code === 0 ? "PASS" : "FAIL"}  ${mode.padEnd(12)} ${(r.ms / 1000).toFixed(1)}s   ${tally}`);
    if (r.code !== 0) {
      const failed = r.out.split("\n").filter((l) => /^\s+- /.test(l));
      for (const f of failed.slice(0, 12)) console.log(`        ${f.trim()}`);
    }
    /* The double is reset between modes so each mode's prompt-log assertions describe only its own
       calls; the DB is not, so a later mode can read an earlier member's rows if it looks globally. */
    await fetch(`${gw.url}/__e2e_reset`).catch(() => undefined);
  }

  await pg.end();
  await gw.close();
  rmSync(TSCONFIG_E2E, { force: true });
  rmSync(BUNDLE, { force: true });
  rmSync(GW_BUNDLE, { force: true });

  const bad = results.filter((r) => r.code !== 0);
  console.log(
    `\n${bad.length ? "POSE E2E: FAILING" : "POSE E2E: ALL MODES PASS"} — ${results.length} mode(s): ` +
      results.map((r) => `${r.mode}${r.code === 0 ? "" : "!"}`).join(" ")
  );
  process.exitCode = bad.length ? 1 : 0;
}

main().catch((e) => {
  console.error("pose-run failed:", e && e.stack ? e.stack : e);
  process.exit(1);
});
