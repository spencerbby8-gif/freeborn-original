import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** Public liveness only. Operational details stay in server logs and the
 * operator-gated engine probe; never return upstream text or stack traces. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "unknown")
      : "unknown";
    console.error(`[health] database check failed (code=${code})`);
    return Response.json({ ok: false }, { status: 500 });
  }
}
