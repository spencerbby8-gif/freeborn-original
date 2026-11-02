import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await db.execute<{ db_role: string; session_role: string }>(
      sql`select current_user as db_role, session_user as session_role`
    );
    return Response.json({ ok: true, dbRole: r.rows[0]?.db_role, sessionRole: r.rows[0]?.session_role });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
