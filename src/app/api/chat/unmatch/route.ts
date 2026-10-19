import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/unmatch — dissolve a match. The match row goes and every
 * message in the conversation cascades with it. Clean for both sides.
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
  const { with: otherId } = (body ?? {}) as { with?: string };
  if (!otherId || otherId === member.id) {
    return Response.json({ error: "A valid member is required." }, { status: 400 });
  }

  const removed = await db
    .delete(matches)
    .where(and(eq(matches.userA, member.id), eq(matches.userB, otherId)))
    .returning({ id: matches.id });
  const removed2 = await db
    .delete(matches)
    .where(and(eq(matches.userA, otherId), eq(matches.userB, member.id)))
    .returning({ id: matches.id });

  return Response.json({ ok: true, unmatched: removed.length + removed2.length > 0 });
}
