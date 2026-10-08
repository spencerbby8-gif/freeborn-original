import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Fallback connection (Supabase transaction pooler) — same documented
 * pattern as the Supabase URL/key fallbacks in src/lib/supabase/*. This
 * module is server-only (API routes), so the string never ships to the
 * browser bundle.
 *
 * Resolution order (survives the platform resetting .env between rebuilds):
 *  1. SUPABASE_TRANSACTION_POOLER — the member-provided pooler env var.
 *  2. A real (non-sandbox-default) DATABASE_URL.
 *  3. The pooler fallback constant below.
 * The empty local sandbox DB is only used when nothing else is configured,
 * so Freeborn always runs on the member's Supabase in practice.
 */
const FALLBACK_DATABASE_URL = "postgresql://postgres.ihwtpwlszegrjgakqsxx:cfn6VrT7sUQ9QK8b@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const LOCAL_SANDBOX_URL = "postgresql://postgres:postgres@127.0.0.1:5432/app_db";

const envUrl = process.env.DATABASE_URL;
const poolerUrl = process.env.SUPABASE_TRANSACTION_POOLER;
const databaseUrl =
  poolerUrl ??
  (envUrl && envUrl !== LOCAL_SANDBOX_URL ? envUrl : FALLBACK_DATABASE_URL);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
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
