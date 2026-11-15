import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, messageRequests } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { isBlockedPair } from "@/lib/conversation-access";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/requests/<id> — respond to a message request.
 *
 *   accept   recipient only. Mints the same match row a mutual like mints, so
 *            the whole chat stack (threads, fb-chat topics, call sessions)
 *            works unchanged from that moment. A severed pair can never be
 *            re-minted this way: unmatching is permanent.
 *   decline  recipient only.
 *   cancel   sender only, while pending.
 *
 * Every branch re-checks the block list: a block placed after the request was
 * sent must still stop it from becoming a conversation.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown request." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const action = (body as { action?: unknown } | null)?.action;
  if (action !== "accept" && action !== "decline" && action !== "cancel") {
    return Response.json({ error: "Unknown request action." }, { status: 400 });
  }

  const [row] = await db.select().from(messageRequests).where(eq(messageRequests.id, id)).limit(1);
  if (!row) return Response.json({ error: "Unknown request." }, { status: 404 });
  const isRecipient = row.toId === member.id;
  const isSender = row.fromId === member.id;
  if (!isRecipient && !isSender) return Response.json({ error: "Unknown request." }, { status: 404 });
  if (action === "accept" && !isRecipient) {
    return Response.json({ error: "Only the member who was asked can accept." }, { status: 403 });
  }
  if (action === "cancel" && !isSender) {
    return Response.json({ error: "Only the sender can cancel a request." }, { status: 403 });
  }
  if (action === "decline" && !isRecipient) {
    return Response.json({ error: "Only the member who was asked can decline." }, { status: 403 });
  }
  if (row.status !== "pending") {
    return Response.json({ error: "This request has already been answered." }, { status: 409 });
  }

  const otherId = isRecipient ? row.fromId : row.toId;
  if (await isBlockedPair(member.id, otherId)) {
    return Response.json({ error: "This conversation isn't available." }, { status: 403 });
  }

  if (action === "accept") {
    const [userA, userB] = [row.fromId, row.toId].sort() as [string, string];
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: matches.id, status: matches.status })
        .from(matches)
        .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
        .limit(1);
      if (existing && existing.status !== "active") {
        return { error: "severed" as const };
      }
      let matchId = existing?.id;
      if (!matchId) {
        const [created] = await tx
          .insert(matches)
          .values({ userA, userB, initiatedBy: row.fromId, lastMessageAt: new Date() })
          .returning();
        matchId = created.id;
      }
      await tx
        .update(messageRequests)
        .set({ status: "accepted", respondedAt: new Date() })
        .where(eq(messageRequests.id, row.id));
      return { matchId };
    });
    if (result.error) {
      return Response.json(
        {
          error:
            "This conversation has ended. Unmatching is permanent in Freeborn: neither of you can send again.",
        },
        { status: 409 },
      );
    }
    return Response.json({ matchId: result.matchId }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const [updated] = await db
    .update(messageRequests)
    .set({ status: "declined", respondedAt: new Date() })
    .where(and(eq(messageRequests.id, row.id), eq(messageRequests.status, "pending")))
    .returning();
  if (!updated) return Response.json({ error: "This request has already been answered." }, { status: 409 });
  return Response.json({ status: "declined" }, { headers: { "Cache-Control": "private, no-store" } });
}
