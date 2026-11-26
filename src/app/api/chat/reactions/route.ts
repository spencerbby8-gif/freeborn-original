import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, matches, messageReactions, messages } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["❤️", "👍", "😂", "😮", "😢", "🔥"]);

/**
 * POST /api/chat/reactions — toggle a reaction on a message.
 * Reacting again with the same emoji removes it (Telegram behavior).
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

  const { message, emoji } = (body ?? {}) as { message?: string; emoji?: string };
  if (!isUuid(message) || !emoji || !ALLOWED.has(emoji)) {
    return Response.json({ error: "A valid message and emoji are required." }, { status: 400 });
  }

  // Only react inside matches the member belongs to.
  const [msg] = await db
    .select({ id: messages.id, matchId: messages.matchId })
    .from(messages)
    .where(eq(messages.id, message))
    .limit(1);
  if (!msg) return Response.json({ error: "Message not found." }, { status: 404 });

  const [match] = await db.select().from(matches).where(eq(matches.id,msg.matchId)).limit(1);
  if (!match || (match.userA !== member.id && match.userB !== member.id)) return Response.json({error:"Not allowed."},{status:403});
  const otherId=match.userA===member.id?match.userB:match.userA;
  const outcome=await db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${member.id}::text, ${otherId}::text) || ':' || greatest(${member.id}::text, ${otherId}::text), 0))`);
    const [live]=await tx.select({id:matches.id}).from(matches).where(and(eq(matches.id,msg.matchId),inArray(matches.status,["active","archived"]))).for('update');
    if(!live)return {denied:true as const};
    const [block]=await tx.select({id:blockedUsers.id}).from(blockedUsers).where(or(
      and(eq(blockedUsers.blockerId,member.id),eq(blockedUsers.blockedId,otherId)),
      and(eq(blockedUsers.blockerId,otherId),eq(blockedUsers.blockedId,member.id))
    )).limit(1);
    if(block)return {denied:true as const};
    // A deleted message can disappear while the pair lock is being acquired.
    const [stillThere]=await tx.select({id:messages.id}).from(messages).where(and(eq(messages.id,message),eq(messages.matchId,msg.matchId))).for('key share');
    if(!stillThere)return {missing:true as const};
    const [existing]=await tx.select({id:messageReactions.id}).from(messageReactions).where(and(eq(messageReactions.messageId,message),eq(messageReactions.userId,member.id),eq(messageReactions.emoji,emoji))).limit(1);
    if(existing){await tx.delete(messageReactions).where(eq(messageReactions.id,existing.id));return {on:false};}
    await tx.insert(messageReactions).values({messageId:message,userId:member.id,emoji}).onConflictDoNothing();
    return {on:true};
  });
  if('denied' in outcome)return Response.json({error:'Not allowed.'},{status:403});
  if('missing' in outcome)return Response.json({error:'Message not found.'},{status:404});
  return Response.json({ok:true,...outcome});
}
