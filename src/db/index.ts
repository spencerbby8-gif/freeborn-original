import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Database connection (Supabase transaction pooler).
 *
 * Credentials are NEVER hardcoded in this file — the repository is public,
 * so the connection string must come from the environment. Configure it in
 * Netlify -> Site settings -> Environment (see DEPLOY.md).
 *
 * Resolution order:
 *  1. SUPABASE_TRANSACTION_POOLER — the member-provided pooler env var.
 *  2. DATABASE_URL, unless it is the local sandbox default below.
 *
 * The pool is created LAZILY, on the first query. `next build` imports every
 * route module to collect page data, and that step must not require a live
 * database or a connection string — otherwise the build fails with
 * "Failed to collect page data" before the app is ever deployed.
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

function createDb() {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(
      "No database connection configured. Set SUPABASE_TRANSACTION_POOLER " +
        "(preferred) or DATABASE_URL to your Supabase pooler connection " +
        "string in your Netlify site environment variables. See DEPLOY.md.",
    );
  }

  const pool =
    globalForDb.__freebornPgPool ?? new Pool({ connectionString: databaseUrl });

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

/** Lazily-created pool, for callers that need raw `pg` access. */
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    getDb();
    const value = Reflect.get(globalForDb.__freebornPgPool!, prop);
    return typeof value === "function" ? value.bind(globalForDb.__freebornPgPool) : value;
  },
  has(_target, prop) {
    getDb();
    return Reflect.has(globalForDb.__freebornPgPool!, prop);
  },
});
