import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, matches, userProfiles, userSwipes } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { decideMatchAccess, severedMessage, type MatchLifecycleStatus } from "@/lib/match-lifecycle";
import { hasMutualLike, isBlockedPair } from "@/lib/conversation-access";
import { isUuid } from "@/lib/uuid";
import { rejectCrossOrigin } from "@/lib/request-guard";

/**
 * Start (or reopen) a conversation with another member.
 * In the preview room a conversation implies mutual interest, so if no match
 * exists yet one is created (with a greeting from the other member).
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
  if (!isUuid(otherId)) return Response.json({ error: "A valid member is required." }, { status: 400 });
  if (otherId === member.id)
    return Response.json({ error: "You can't message yourself." }, { status: 400 });

  const [other] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.id, otherId))
    .limit(1);
  if (!other) return Response.json({ error: "Profile not found." }, { status: 404 });

  if (await isBlockedPair(member.id, otherId)) {
    return Response.json({ error: "This conversation isn't available." }, { status: 403 });
  }
  if (!(await hasMutualLike(member.id, otherId))) {
    return Response.json({ error: "You can start a conversation after you both like each other." }, { status: 409 });
  }

  /* Their privacy rule: who may start conversations with them. Enforced
     here AND on every message send — truthful, never bypassed. */
  const mp = other.messagePrivacy ?? "everyone";
  if (mp !== "everyone") {
    const [me] = await db
      .select({
        isVerified: userProfiles.isVerified,
        vaccinationStatus: userProfiles.vaccinationStatus,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, member.id))
      .limit(1);
    const allowed =
      mp === "verified" ? me?.isVerified === true : me?.vaccinationStatus === "unvaccinated";
    if (!allowed) {
      const name = other.displayName ?? "This member";
      return Response.json(
        {
          error:
            mp === "verified"
              ? `${name} only accepts messages from verified members.`
              : `${name} only accepts messages from unvaccinated members.`,
          restricted: true,
        },
        { status: 403 }
      );
    }
  }

  const [userA, userB] = [member.id, otherId].sort();
  const outcome=await db.transaction(async tx=>{
    // Agree with block/unblock, reciprocal-like and request-accept ordering.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${member.id}::text, ${otherId}::text) || ':' || greatest(${member.id}::text, ${otherId}::text), 0))`);
    const [blocked]=await tx.select({id:blockedUsers.id}).from(blockedUsers).where(or(
      and(eq(blockedUsers.blockerId,member.id),eq(blockedUsers.blockedId,otherId)),
      and(eq(blockedUsers.blockerId,otherId),eq(blockedUsers.blockedId,member.id))
    )).limit(1);
    if(blocked)return {error:'blocked' as const};
    const swipes=await tx.select({liker:userSwipes.likerId,liked:userSwipes.likedId}).from(userSwipes).where(and(
      or(and(eq(userSwipes.likerId,member.id),eq(userSwipes.likedId,otherId)),and(eq(userSwipes.likerId,otherId),eq(userSwipes.likedId,member.id))),
      inArray(userSwipes.action,['like','superlike'])
    ));
    if(!swipes.some(s=>s.liker===member.id&&s.liked===otherId)||!swipes.some(s=>s.liker===otherId&&s.liked===member.id))return {error:'not_mutual' as const};
    const [existing]=await tx.select().from(matches).where(and(eq(matches.userA,userA),eq(matches.userB,userB))).limit(1);
    if(existing){
      const decision=decideMatchAccess({status:existing.status as MatchLifecycleStatus,isParticipant:true,isActor:existing.unmatchedBy===member.id,hasMessages:false,action:"create_or_rematch"});
      if(decision.reason!=='deny:already-matched')return {error:'ended' as const,status:existing.status as MatchLifecycleStatus};
      return {matchId:existing.id};
    }
    const [created]=await tx.insert(matches).values({userA,userB,initiatedBy:member.id,lastMessageAt:new Date()})
      .onConflictDoNothing({target:[matches.userA,matches.userB]}).returning({id:matches.id});
    if(created)return {matchId:created.id};
    // Another authorized path might insert while not using the pair lock.
    const [winner]=await tx.select({id:matches.id,status:matches.status}).from(matches).where(and(eq(matches.userA,userA),eq(matches.userB,userB))).limit(1);
    if(!winner || (winner.status!=='active'&&winner.status!=='archived'))return {error:'ended' as const,status:(winner?.status??null) as MatchLifecycleStatus|null};
    return {matchId:winner.id};
  });
  if(outcome.error==='blocked')return Response.json({error:"This conversation isn't available."},{status:403});
  if(outcome.error==='not_mutual')return Response.json({error:'You can start a conversation after you both like each other.'},{status:409});
  if(outcome.error==='ended')return Response.json({error:severedMessage(outcome.status)},{status:409});
  return Response.json({matchId:outcome.matchId});
}
