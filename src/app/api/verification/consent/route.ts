import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/verification/consent
 * Withdraws verification consent without deleting the account. The seal is
 * removed immediately; selfie copies are released through the durable FB-15
 * queue. The response never claims Storage cleanup is complete while jobs remain.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { action } = (body ?? {}) as { action?: string };
  if (action !== "withdraw") {
    return Response.json({ error: "Unsupported consent action." }, { status: 400 });
  }

  const queued = await db.execute<{ n: number }>(
    sql`select public.fb15_withdraw_selfies(${member.id}::uuid) as n`
  );
  const remaining = await db.execute<{ n: number }>(
    sql`select count(*)::int as n
        from public.verification_selfie_retention_jobs
        where account_id = ${member.id}::uuid and status <> 'completed' and status <> 'cancelled'`
  );
  const pending = remaining.rows[0]?.n ?? 0;

  return Response.json(
    {
      ok: true,
      queued: queued.rows[0]?.n ?? 0,
      completed: pending === 0,
      message:
        pending === 0
          ? "Verification consent withdrawn. No stored selfie cleanup remains."
          : "Verification consent withdrawn. Selfie cleanup is in progress.",
    },
    { status: pending === 0 ? 200 : 202 }
  );
}
