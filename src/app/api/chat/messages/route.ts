import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, messages, userProfiles } from "@/db/schema";
import { getMember, getLocalProfile } from "@/lib/app-auth";
import { pickReply } from "@/lib/chat-personas";

async function ownsMatch(matchId: string, memberId: string) {
  const [row] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) return null;
  if (row.userA !== memberId && row.userB !== memberId) return null;
  return row;
}

/** Thread messages (marks the other person's messages as read). */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const matchId = url.searchParams.get("match");
  if (!matchId) return Response.json({ error: "match is required." }, { status: 400 });

  const match = await ownsMatch(matchId, member.id);
  if (!match) return Response.json({ error: "Match not found." }, { status: 404 });

  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.matchId, matchId),
        sql`${messages.senderId} <> ${member.id}`,
        sql`${messages.readAt} is null`
      )
    );

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.matchId, matchId))
    .orderBy(asc(messages.createdAt));

  return Response.json({
    messages: rows.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderId === member.id,
      at: m.createdAt,
      read: Boolean(m.readAt),
    })),
  });
}

/** Send a message; the preview-room persona answers shortly after. */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { match: matchId, text } = (body ?? {}) as { match?: string; text?: string };
  const clean = text?.trim() ?? "";
  if (!matchId || !clean)
    return Response.json({ error: "match and text are required." }, { status: 400 });
  if (clean.length > 2000)
    return Response.json({ error: "Keep messages under 2000 characters." }, { status: 400 });

  const match = await ownsMatch(matchId, member.id);
  if (!match) return Response.json({ error: "Match not found." }, { status: 404 });

  await db.insert(messages).values({ matchId, senderId: member.id, body: clean });
  await db.update(matches).set({ lastMessageAt: new Date() }).where(eq(matches.id, matchId));

  // Persona reply, stamped a couple of seconds ahead so it arrives naturally.
  const otherId = match.userA === member.id ? match.userB : match.userA;
  const other = await getLocalProfile(otherId);
  const [{ sent }] = await db
    .select({ sent: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.matchId, matchId), eq(messages.senderId, member.id)));

  if (other) {
    const replyAt = new Date(Date.now() + 2500);
    await db.insert(messages).values({
      matchId,
      senderId: otherId,
      body: pickReply(other.displayName ?? "", sent),
      createdAt: replyAt,
    });
    await db
      .update(matches)
      .set({ lastMessageAt: replyAt })
      .where(eq(matches.id, matchId));
  }

  return Response.json({ ok: true });
}
