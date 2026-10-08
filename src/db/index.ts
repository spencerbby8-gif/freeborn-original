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
 */
const LOCAL_SANDBOX_URL = "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

const envUrl = process.env.DATABASE_URL;
const poolerUrl = process.env.SUPABASE_TRANSACTION_POOLER;
const databaseUrl =
  poolerUrl ?? (envUrl && envUrl !== LOCAL_SANDBOX_URL ? envUrl : undefined);

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Set SUPABASE_TRANSACTION_POOLER (preferred) or " +
      "DATABASE_URL to your Supabase pooler connection string. See DEPLOY.md.",
  );
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
