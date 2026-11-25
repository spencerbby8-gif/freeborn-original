import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, matches, messageRequests, profilePhotos, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { isBlockedPair } from "@/lib/conversation-access";
import { resolvePhotoUrl } from "@/lib/photo-url";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/* Per-instance limiter, same shape as the other chat routes: a member may put
   out a bounded number of requests an hour. Requests are already one-per-pair,
   this stops pair-harvesting. */
const submitLog = new Map<string, number[]>();
function rateLimited(accountId: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (submitLog.get(accountId) ?? []).filter((t) => now - t < windowMs);
  submitLog.set(accountId, hits);
  if (hits.length >= max) return true;
  hits.push(now);
  return false;
}

type RequestPerson = { id: string; name: string; photo: string };

async function person(id: string): Promise<RequestPerson> {
  const [profile] = await db
    .select({ id: userProfiles.id, name: userProfiles.displayName })
    .from(userProfiles)
    .where(eq(userProfiles.id, id))
    .limit(1);
  const [photo] = await db
    .select({ path: profilePhotos.storagePath })
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, id))
    .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
    .limit(1);
  return { id, name: profile?.name ?? "Freeborn member", photo: resolvePhotoUrl(photo?.path) };
}

/**
 * GET /api/chat/requests — the member's live message requests.
 *
 * `incoming`: pending requests addressed to them, newest first — what the
 * Messages screen offers to accept or decline.
 * `outgoing`: pending requests they sent — so "Message <name>" on a profile can
 * say "Request sent" instead of offering to send a second one.
 * Blocked pairs are omitted in both directions: a block is a boundary, not a
 * conversation.
 */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const rows = await db
    .select()
    .from(messageRequests)
    .where(
      and(
        eq(messageRequests.status, "pending"),
        or(eq(messageRequests.fromId, member.id), eq(messageRequests.toId, member.id)),
      ),
    )
    .orderBy(desc(messageRequests.createdAt));

  const incoming: Array<{ id: string; from: RequestPerson; createdAt: string }> = [];
  const outgoing: Array<{ id: string; to: RequestPerson; createdAt: string }> = [];
  for (const row of rows) {
    const otherId = row.fromId === member.id ? row.toId : row.fromId;
    if (await isBlockedPair(member.id, otherId)) continue;
    const other = await person(otherId);
    if (row.toId === member.id) {
      incoming.push({ id: row.id, from: other, createdAt: row.createdAt.toISOString() });
    } else {
      outgoing.push({ id: row.id, to: other, createdAt: row.createdAt.toISOString() });
    }
  }
  return Response.json(
    { incoming, outgoing },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * POST /api/chat/requests — "Message <name>" from a profile.
 *
 * Owner addendum 2026-11-15: this button used to call /api/chat/start, which
 * demands a mutual like and answered 409 without one — and the button swallowed
 * the 409, so the member tapped Message and nothing happened. Now the tap
 * creates a request the other member responds to.
 *
 * Answers, all of them actionable by the client:
 *   200 { matchId }            a live conversation already exists — open it
 *   200 { requestId, pending } request created (or already pending)
 *   200 { incomingId }         THEY already asked this member — respond instead
 *   403                        blocked pair, or the recipient's privacy rule
 *   409 { error }              the pair's conversation was severed; permanent
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
  const { to } = (body ?? {}) as { to?: string };
  if (!isUuid(to)) return Response.json({ error: "A valid member is required." }, { status: 400 });
  if (to === member.id) return Response.json({ error: "You can't message yourself." }, { status: 400 });

  const [userA,userB]=[member.id,to].sort();
  const outcome=await db.transaction(async tx=>{
    // Order request creation, matching, blocking and acceptance on the pair.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${member.id}::text, ${to}::text) || ':' || greatest(${member.id}::text, ${to}::text), 0))`);
    const [block]=await tx.select({id:blockedUsers.id}).from(blockedUsers).where(or(
      and(eq(blockedUsers.blockerId,member.id),eq(blockedUsers.blockedId,to)),
      and(eq(blockedUsers.blockerId,to),eq(blockedUsers.blockedId,member.id))
    )).limit(1);
    if(block)return {error:'blocked' as const};
    const [other]=await tx.select({id:userProfiles.id,privacy:userProfiles.messagePrivacy,name:userProfiles.displayName}).from(userProfiles).where(eq(userProfiles.id,to)).for('share');
    if(!other)return {error:'missing' as const};
    const [match]=await tx.select({id:matches.id,status:matches.status}).from(matches).where(and(eq(matches.userA,userA),eq(matches.userB,userB))).limit(1);
    if(match && (match.status==='active'||match.status==='archived'))return {matchId:match.id};
    if(match)return {error:'ended' as const};
    const mp=other.privacy??'everyone';
    if(mp!=='everyone'){
      const [me]=await tx.select({verified:userProfiles.isVerified,vaccination:userProfiles.vaccinationStatus}).from(userProfiles).where(eq(userProfiles.id,member.id)).for('share');
      if(!(mp==='verified'?me?.verified===true:me?.vaccination==='unvaccinated'))return {error:'restricted' as const,privacy:mp,name:other.name??'This member'};
    }
    const [mine]=await tx.select().from(messageRequests).where(and(eq(messageRequests.fromId,member.id),eq(messageRequests.toId,to))).for('update');
    if(mine?.status==='pending')return {requestId:mine.id,status:'pending' as const};
    const [theirs]=await tx.select().from(messageRequests).where(and(eq(messageRequests.fromId,to),eq(messageRequests.toId,member.id))).for('update');
    if(theirs?.status==='pending')return {incomingId:theirs.id};
    if(rateLimited(member.id,25,60*60*1000))return {error:'rate' as const};
    if(mine){
      if(mine.status!=='declined')return {error:'ended' as const};
      const [renewed]=await tx.update(messageRequests).set({status:'pending',createdAt:new Date(),respondedAt:null}).where(and(eq(messageRequests.id,mine.id),eq(messageRequests.status,'declined'))).returning({id:messageRequests.id});
      if(!renewed)return {error:'ended' as const};
      return {requestId:renewed.id,status:'pending' as const};
    }
    const [created]=await tx.insert(messageRequests).values({fromId:member.id,toId:to,status:'pending'})
      .onConflictDoNothing({target:[messageRequests.fromId,messageRequests.toId]}).returning({id:messageRequests.id});
    if(!created)return {error:'changed' as const};
    return {requestId:created.id,status:'pending' as const,created:true as const};
  });
  const headers={'Cache-Control':'private, no-store'};
  if(outcome.error==='blocked')return Response.json({error:"This conversation isn't available."},{status:403,headers});
  if(outcome.error==='missing')return Response.json({error:'Profile not found.'},{status:404,headers});
  if(outcome.error==='ended')return Response.json({error:'This conversation has ended. Unmatching is permanent in Freeborn: neither of you can send again.'},{status:409,headers});
  if(outcome.error==='changed')return Response.json({error:'The request changed. Please try again.'},{status:409,headers});
  if(outcome.error==='rate')return Response.json({error:'Too many message requests. Please wait a while.'},{status:429,headers});
  if(outcome.error==='restricted')return Response.json({error:outcome.privacy==='verified'?`${outcome.name} only accepts messages from verified members.`:`${outcome.name} only accepts messages from unvaccinated members.`,restricted:true},{status:403,headers});
  return Response.json(outcome,{status:'created' in outcome?201:200,headers});
}
