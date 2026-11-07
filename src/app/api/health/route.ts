import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = (err as any)?.cause ? String((err as any).cause) : "none";
    const stack = err instanceof Error && err.stack ? err.stack.split("\n").slice(0, 5).join(" | ") : "none";
    console.error("[health] DB connection failed:", msg, "cause:", cause, "stack:", stack);
    return Response.json({ ok: false, error: msg, cause, stack }, { status: 500 });
  }
}
