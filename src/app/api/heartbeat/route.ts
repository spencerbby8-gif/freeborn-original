import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

const lastBeat = new Map<string, number>();

/**
 * POST /api/heartbeat — "I'm here right now." Updates last_active_at so
 * other members see a truthful Active/last-seen status. Throttled to one
 * real write per 2 minutes per member.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const now = Date.now();
  const prev = lastBeat.get(member.id) ?? 0;
  if (now - prev < 2 * 60 * 1000) return Response.json({ ok: true, cached: true });
  lastBeat.set(member.id, now);

  await db
    .update(userProfiles)
    .set({ lastActiveAt: new Date() })
    .where(eq(userProfiles.id, member.id));

  return Response.json({ ok: true });
}
