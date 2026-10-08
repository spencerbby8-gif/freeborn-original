import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, messageReactions, messages } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["❤️", "👍", "😂", "😮", "😢", "🔥"]);

/**
 * POST /api/chat/reactions — toggle a reaction on a message.
 * Reacting again with the same emoji removes it (Telegram behavior).
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

  const { message, emoji } = (body ?? {}) as { message?: string; emoji?: string };
  if (!message || !emoji || !ALLOWED.has(emoji)) {
    return Response.json({ error: "A valid message and emoji are required." }, { status: 400 });
  }

  // Only react inside matches the member belongs to.
  const [msg] = await db
    .select({ id: messages.id, matchId: messages.matchId })
    .from(messages)
    .where(eq(messages.id, message))
    .limit(1);
  if (!msg) return Response.json({ error: "Message not found." }, { status: 404 });

  const [match] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, msg.matchId))
    .limit(1);
  if (!match || (match.userA !== member.id && match.userB !== member.id)) {
    return Response.json({ error: "Not allowed." }, { status: 403 });
  }

  const [existing] = await db
    .select({ id: messageReactions.id })
    .from(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, message),
        eq(messageReactions.userId, member.id),
        eq(messageReactions.emoji, emoji)
      )
    )
    .limit(1);

  if (existing) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
    return Response.json({ ok: true, on: false });
  }

  await db
    .insert(messageReactions)
    .values({ messageId: message, userId: member.id, emoji })
    .onConflictDoNothing();
  return Response.json({ ok: true, on: true });
}
