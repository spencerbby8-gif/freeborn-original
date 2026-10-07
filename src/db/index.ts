import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Fallback connection (Supabase transaction pooler) — same documented
 * pattern as the Supabase URL/key fallbacks in src/lib/supabase/*. This
 * module is server-only (API routes), so the string never ships to the
 * browser bundle. A real DATABASE_URL env var always wins when present.
 */
const FALLBACK_DATABASE_URL = "postgresql://postgres.ihwtpwlszegrjgakqsxx:kOZt1oTOiaJUEuwQ@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

const databaseUrl = process.env.DATABASE_URL ?? FALLBACK_DATABASE_URL;

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
