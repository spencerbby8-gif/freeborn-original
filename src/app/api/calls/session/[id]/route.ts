import { isBlockedPair } from "@/lib/conversation-access";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, callSessions, matches } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { callSessionView, findParticipantSession, isCallSessionLive } from "@/lib/call-session-server";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { badIdResponse, isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await context.params;
  if (!isUuid(id)) return badIdResponse();
  const row = await findParticipantSession(id, member.id);
  if (!row) return Response.json({ error: "Call not found." }, { status: 404 });
  const [conversation]=await db.select({status:matches.status}).from(matches).where(eq(matches.id,row.matchId)).limit(1);
  if(!conversation||conversation.status!=="active"||await isBlockedPair(row.callerId,row.calleeId))return Response.json({error:"Call not found."},{status:404});
  if (row.status !== "ended" && !isCallSessionLive(row)) return Response.json({ error: "This call has expired." }, { status: 410 });
  return Response.json(await callSessionView(row, member.id), { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const { id } = await context.params;
  if (!isUuid(id)) return badIdResponse();
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const action = (body as { action?: unknown } | null)?.action;
  if (action !== "accept" && action !== "decline" && action !== "end") {
    return Response.json({ error: "Unknown call action." }, { status: 400 });
  }
  const row = await findParticipantSession(id, member.id);
  if (!row) return Response.json({ error: "Call not found." }, { status: 404 });
  if (!isCallSessionLive(row)) return Response.json({ error: "This call has expired." }, { status: 410 });
  if (action !== "end" && row.calleeId !== member.id) {
    return Response.json({ error: "Only the receiving member can answer this call." }, { status: 403 });
  }

  const outcome=await db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${row.callerId}::text, ${row.calleeId}::text) || ':' || greatest(${row.callerId}::text, ${row.calleeId}::text), 0))`);
    const [match]=await tx.select({status:matches.status}).from(matches).where(eq(matches.id,row.matchId)).for('update');
    const [current]=await tx.select().from(callSessions).where(eq(callSessions.id,id)).for('update');
    if(!current || !isCallSessionLive(current))return {expired:true as const};
    if(action!=="end"){
      const [block]=await tx.select({id:blockedUsers.id}).from(blockedUsers).where(or(
        and(eq(blockedUsers.blockerId,row.callerId),eq(blockedUsers.blockedId,row.calleeId)),
        and(eq(blockedUsers.blockerId,row.calleeId),eq(blockedUsers.blockedId,row.callerId))
      )).limit(1);
      if(!match || match.status!=="active" || block)return {denied:true as const};
    }
    const [updated]=await tx.update(callSessions).set({
      status:action==="accept"?"active":"ended",
      ...(action==="accept"?{expiresAt:new Date(Date.now()+4*60*60_000)}:{endedAt:new Date(),endedBy:member.id,endReason:action==="decline"?"declined":current.status==="ringing"?"cancelled":"ended"}),
    }).where(and(eq(callSessions.id,id),inArray(callSessions.status,action==="end"?["ringing","active"]:["ringing"]))).returning();
    return updated?{updated}:{changed:true as const};
  });
  if('expired' in outcome)return Response.json({error:"This call has expired."},{status:410});
  if('denied' in outcome)return Response.json({error:"Call not found."},{status:404});
  if('changed' in outcome)return Response.json({error:"This call is no longer waiting."},{status:409});
  const updated=outcome.updated;
  return Response.json(await callSessionView(updated, member.id), { headers: { "Cache-Control": "private, no-store" } });
}
