/**
 * `@/db` for the e2e bundle ONLY — resolved by the generated tsconfig's `paths`, never by the app.
 *
 * Why a shim instead of the real `@/db`: the product module resolves its connection string from
 * `SUPABASE_TRANSACTION_POOLER` first, which in a developer's shell points at PRODUCTION. A suite
 * that INSERTs verification rows and flips `user_profiles.is_verified` must not be able to do that
 * by inheriting an environment variable. So this file owns the connection, reads it from a name
 * that exists nowhere in the deployment (`E2E_DATABASE_URL`), and refuses anything that is not a
 * loopback address — before `pg` is asked to connect.
 *
 * Everything else is the same: drizzle over node-postgres, so the route's queries are the real
 * ones against the real schema, constraints and all. That is the difference between this suite
 * and a mock: the 23505 lockout defect was invisible to a mock and impossible to hide here.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as appSchema from "@/db/schema";

export const schema = appSchema;

const raw = process.env.E2E_DATABASE_URL ?? "";
const LOCAL = /^postgres(ql)?:\/\/([^@/]*@)?(127\.0\.0\.1|localhost)(:\d+)?\/[a-z0-9_]+$/i;

if (!LOCAL.test(raw)) {
  console.error(
    "pose-e2e refuses to run: E2E_DATABASE_URL must be a loopback postgres URL " +
      `(got ${raw ? raw.replace(/:[^:@/]*@/, ":***@").slice(0, 60) : "nothing"}). ` +
      "Point it at your local cluster (postgres on 127.0.0.1, database app_db). It is deliberately " +
        "not spelled out as a URL here: the runner scans this bundle for baked-in connection " +
        "strings, and a literal inside a help message would trip the same guard that catches a leak."
  );
  process.exit(2);
}

export const pool = new Pool({ connectionString: raw, max: 4 });
export const db: NodePgDatabase<typeof appSchema> = drizzle(pool, { schema: appSchema });

export async function closeDb(): Promise<void> {
  await pool.end();
}

/** One-row SELECT helper for the suite's own assertions (never used by product code). */
export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}
