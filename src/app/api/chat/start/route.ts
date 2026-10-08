import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

/**
 * Start (or reopen) a conversation with another member.
 * In the preview room a conversation implies mutual interest, so if no match
 * exists yet one is created (with a greeting from the other member).
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { with: otherId } = (body ?? {}) as { with?: string };
  if (!otherId) return Response.json({ error: "'with' is required." }, { status: 400 });
  if (otherId === member.id)
    return Response.json({ error: "You can't message yourself." }, { status: 400 });

  const [other] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.id, otherId))
    .limit(1);
  if (!other) return Response.json({ error: "Profile not found." }, { status: 404 });

  const [userA, userB] = [member.id, otherId].sort();
  const existing = await db
    .select()
    .from(matches)
    .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
    .limit(1);

  if (existing.length) {
    return Response.json({ matchId: existing[0].id });
  }

  const [match] = await db
    .insert(matches)
    .values({ userA, userB, initiatedBy: member.id, lastMessageAt: new Date() })
    .returning({ id: matches.id });

  // No scripted greeting — the conversation starts empty, honestly.

  return Response.json({ matchId: match.id });
}
