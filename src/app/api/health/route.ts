import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err instanceof Error && err.name ? err.name : "unknown";
    // Log full error for Vercel runtime logs; return sanitized type to client
    console.error("[health] DB connection failed:", code, msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
