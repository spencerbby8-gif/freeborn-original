import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Database connection (Supabase transaction pooler).
 *
 * The connection string is read from the environment only — it must never be
 * hardcoded here. `SUPABASE_TRANSACTION_POOLER` is flagged as a secret in
 * Vercel, and Vercel's secret scanning fails the build if it finds that
 * value anywhere in the repo or build output.
 *
 * Configure it in Vercel -> Project -> Settings -> Environment Variables.
 *
 * Resolution order:
 *  1. SUPABASE_TRANSACTION_POOLER — the member-provided pooler env var.
 *  2. DATABASE_URL, unless it is the local sandbox default below.
 *
 * The pool is created LAZILY, on the first query. `next build` imports every
 * route module to collect page data, and that step must not require a live
 * database or a connection string.
 */
const LOCAL_SANDBOX_URL = "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

function resolveDatabaseUrl(): string | undefined {
  const poolerUrl = process.env.SUPABASE_TRANSACTION_POOLER;
  if (poolerUrl) return poolerUrl;
  const envUrl = process.env.DATABASE_URL;
  if (envUrl && envUrl !== LOCAL_SANDBOX_URL) return envUrl;
  return undefined;
}

const globalForDb = globalThis as typeof globalThis & {
  __freebornPgPool?: Pool;
  __freebornDrizzleDb?: ReturnType<typeof drizzle>;
};

/** Set once createDb() runs, in EVERY environment. The `pool` export below
    reads this rather than globalForDb.__freebornPgPool, which is only assigned
    in development — that mismatch made `pool` throw in production. */
let activePool: Pool | undefined;

function createDb() {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(
      "No database connection configured. Set SUPABASE_TRANSACTION_POOLER " +
        "(preferred) or DATABASE_URL to your Supabase pooler connection " +
        "string in your Vercel project environment variables. See DEPLOY.md.",
    );
  }

  const isLocal =
    databaseUrl.includes("127.0.0.1") || databaseUrl.includes("localhost");

  const pool =
    globalForDb.__freebornPgPool ??
    new Pool({
      connectionString: databaseUrl,
      /* node-postgres defaults to max:10. On Vercel EVERY serverless
         instance builds its own pool, so 50 concurrent instances means 500
         connections aimed at the Supabase transaction pooler — which refuses
         them. The failure mode is sporadic, hard-to-diagnose 500s under load,
         and it can exhaust the project's connection budget for everyone.
         Keep per-instance pools tiny; on serverless, few and short-lived wins. */
      max: Number(process.env.PGPOOL_MAX ?? 2),
      /* Supabase requires TLS. rejectUnauthorized:false is the standard
         workaround because the pooler certificate CN does not match the host;
         the connection is still encrypted. Never enable this for a local
         sandbox Postgres, which typically has no certificate at all. */
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
      /* Bound every statement. Vercel caps functions at 26s on paid plans, so
         a runaway query must die before the platform kills the invocation and
         leaves the connection in an unknown state. */
      statement_timeout: 15_000,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });

  activePool = pool;

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__freebornPgPool = pool;
  }

  return drizzle(pool);
}

function getDb() {
  return (globalForDb.__freebornDrizzleDb ??= createDb());
}

/**
 * Drizzle client. Behaves exactly like a real drizzle instance, but the
 * connection is only established the first time a query is actually made —
 * importing this module is always side-effect free.
 */
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb(), prop);
  },
});

/**
 * Lazily-created pool, for callers that need raw `pg` access.
 *
 * This used to read `globalForDb.__freebornPgPool!`, which is only assigned
 * when NODE_ENV !== "production". In production it was therefore `undefined`
 * and every property access threw a TypeError. Nothing imported it at audit
 * time, so it was dead code rather than a live outage — but it was a landmine
 * for whoever reached for it next. It now reads `activePool`, which createDb()
 * sets in every environment.
 */
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    getDb();
    const value = Reflect.get(activePool!, prop);
    return typeof value === "function" ? value.bind(activePool) : value;
  },
  has(_target, prop) {
    getDb();
    return Reflect.has(activePool!, prop);
  },
});
