import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, messageReactions, messages, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { looksLikeScam } from "@/lib/scam-guard";

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

  /* Aggregate reactions per message (hold-to-react, double-tap to love). */
  const ids = rows.map((m) => m.id);
  const reactionsByMessage = new Map<
    string,
    Array<{ emoji: string; mine: boolean; count: number }>
  >();
  if (ids.length > 0) {
    const reactionRows = await db
      .select({
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
      })
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, ids));
    for (const r of reactionRows) {
      const list = reactionsByMessage.get(r.messageId) ?? [];
      const existing = list.find((x) => x.emoji === r.emoji);
      if (existing) {
        existing.count += 1;
        existing.mine = existing.mine || r.userId === member.id;
      } else {
        list.push({ emoji: r.emoji, mine: r.userId === member.id, count: 1 });
      }
      reactionsByMessage.set(r.messageId, list);
    }
  }

  return Response.json({
    messages: rows.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderId === member.id,
      at: m.createdAt,
      read: Boolean(m.readAt),
      flagged: Boolean(m.flagged),
      reactions: reactionsByMessage.get(m.id) ?? [],
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

  /* Scam guard: flag recognizable scam patterns so the recipient is warned. */
  await db
    .insert(messages)
    .values({ matchId, senderId: member.id, body: clean, flagged: looksLikeScam(clean) });
  await db.update(matches).set({ lastMessageAt: new Date() }).where(eq(matches.id, matchId));

  // Read receipts: the other member reads everything you've sent before they
  // answer, so your messages flip to "read" the moment a reply lands.
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.matchId, matchId),
        eq(messages.senderId, member.id),
        sql`${messages.readAt} is null`
      )
    );

  // No scripted replies. Every message in Freeborn is written by a real
  // member — fake activity is exactly what destroyed the platforms we're
  // here to beat.

  return Response.json({ ok: true });
}

/**
 * DELETE /api/chat/messages?match=<id> — delete the whole conversation.
 * Every message on both sides is removed; the match itself stays open.
 */
export async function DELETE(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const matchId = url.searchParams.get("match");
  if (!matchId) return Response.json({ error: "match is required." }, { status: 400 });

  const match = await ownsMatch(matchId, member.id);
  if (!match) return Response.json({ error: "Match not found." }, { status: 404 });

  const removed = await db.delete(messages).where(eq(messages.matchId, matchId)).returning({ id: messages.id });
  return Response.json({ ok: true, deleted: removed.length });
}
