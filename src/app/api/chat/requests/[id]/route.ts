import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, matches, messageRequests } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { isBlockedPair } from "@/lib/conversation-access";
import { isUuid } from "@/lib/uuid";
import { rejectCrossOrigin } from "@/lib/request-guard";

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
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
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
      // Same pair lock as blocking and reciprocal likes, with the block check
      // inside the transaction. A concurrent block cannot slip between check
      // and creation of the conversation.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${userA}::text, ${userB}::text) || ':' || greatest(${userA}::text, ${userB}::text), 0))`);
      const [blocked] = await tx.select({id:blockedUsers.id}).from(blockedUsers).where(or(
        and(eq(blockedUsers.blockerId,userA),eq(blockedUsers.blockedId,userB)),
        and(eq(blockedUsers.blockerId,userB),eq(blockedUsers.blockedId,userA))
      )).limit(1);
      if(blocked)return {error:'blocked' as const};
      // Lock the request itself: simultaneous accept/cancel must not both win.
      const [current] = await tx.select({status:messageRequests.status}).from(messageRequests).where(eq(messageRequests.id,row.id)).for('update');
      if(!current || current.status!=='pending')return {error:'answered' as const};
      const [existing] = await tx.select({ id: matches.id, status: matches.status }).from(matches)
        .where(and(eq(matches.userA, userA), eq(matches.userB, userB))).limit(1);
      if (existing && existing.status !== "active") return { error: "severed" as const };
      let matchId = existing?.id;
      if (!matchId) {
        const [created] = await tx.insert(matches).values({ userA, userB, initiatedBy: row.fromId, lastMessageAt: new Date() })
          .onConflictDoNothing({target:[matches.userA,matches.userB]}).returning({id:matches.id});
        if(created)matchId=created.id;
        else {
          const [winner]=await tx.select({id:matches.id,status:matches.status}).from(matches).where(and(eq(matches.userA,userA),eq(matches.userB,userB))).limit(1);
          if(!winner||winner.status!=='active')return {error:'severed' as const};
          matchId=winner.id;
        }
      }
      await tx.update(messageRequests).set({ status: "accepted", respondedAt: new Date() }).where(eq(messageRequests.id, row.id));
      return { matchId };
    });
    if (result.error) {
      if(result.error==='blocked')return Response.json({error:"This conversation isn't available."},{status:403});
      if(result.error==='answered')return Response.json({error:"This request has already been answered."},{status:409});
      return Response.json({error:"This conversation has ended. Unmatching is permanent in Freeborn: neither of you can send again."},{status:409});
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
