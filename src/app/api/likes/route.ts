import { withMemberApiErrors } from "@/lib/member-api-errors";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { ageFromBirthDate } from "@/lib/age";
import { resolvePhotoUrl } from "@/lib/photo-url";
import { undoMayDeleteMatchRow } from "@/lib/match-lifecycle";
import {
  blockedUsers,
  callSessions,
  chatMedia,
  matches,
  messages,
  profilePhotos,
  userProfiles,
  userSwipes,
} from "@/db/schema";
import { getMember, getLocalProfile } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { isUuid } from "@/lib/uuid";

async function profileCard(id: string) {
  const p = await getLocalProfile(id);
  if (!p) return null;
  const [photo] = await db
    .select()
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, id))
    .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
    .limit(1);
  return {
    id: p.id,
    name: p.displayName ?? "Member",
    age: ageFromBirthDate(p.birthDate),
    occupation: p.occupation ?? "",
    interests: p.interests ?? [],
    city: p.city ?? "",
    photo: resolvePhotoUrl(photo?.storagePath ?? ""),
    verified: p.isVerified,
  };
}

/**
 * GET /api/likes
 * Returns both sides of the member's activity — honestly:
 *  - liked:    profiles this member liked (with when)
 *  - likedYou: profiles that liked THIS member (the #1 demanded feature the
 *              competitors never built), each flagged with match state.
 */
async function readLikes(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  // Blocked either way → invisible in both lists.
  const blockRows = await db
    .select({ blockerId: blockedUsers.blockerId, blockedId: blockedUsers.blockedId })
    .from(blockedUsers)
    .where(or(eq(blockedUsers.blockerId, member.id), eq(blockedUsers.blockedId, member.id)));
  const blockedSet = new Set(
    blockRows.map((b) => (b.blockerId === member.id ? b.blockedId : b.blockerId))
  );

  const myRows = await db
    .select({ likedId: userSwipes.likedId, action: userSwipes.action, createdAt: userSwipes.createdAt })
    .from(userSwipes)
    .where(and(eq(userSwipes.likerId, member.id), inArray(userSwipes.action, ["like", "superlike"])))
    .orderBy(desc(userSwipes.createdAt));

  const liked = [];
  for (const row of myRows) {
    if (blockedSet.has(row.likedId)) continue;
    const card = await profileCard(row.likedId);
    if (card) liked.push({ ...card, superlike: row.action === "superlike", likedAt: row.createdAt });
  }

  const theirRows = await db
    .select({ likerId: userSwipes.likerId, action: userSwipes.action, createdAt: userSwipes.createdAt })
    .from(userSwipes)
    .where(and(eq(userSwipes.likedId, member.id), inArray(userSwipes.action, ["like", "superlike"])))
    .orderBy(desc(userSwipes.createdAt));

  const likedYou = [];
  for (const row of theirRows) {
    if (blockedSet.has(row.likerId)) continue;
    const card = await profileCard(row.likerId);
    if (!card) continue;
    const [userA, userB] = [member.id, row.likerId].sort();
    const [match] = await db
      .select({ id: matches.id, status: matches.status })
      .from(matches)
      .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
      .limit(1);
    // Ended relationships cannot be liked back or opened as fresh matches.
    if (match && match.status !== "active" && match.status !== "archived") continue;
    likedYou.push({
      ...card,
      superlike: row.action === "superlike",
      likedAt: row.createdAt,
      matched: Boolean(match && (match.status === "active" || match.status === "archived")),
      matchId: match && (match.status === "active" || match.status === "archived") ? match.id : null,
    });
  }

  return Response.json({ liked, likedYou });
}

/**
 * POST /api/likes — record a real swipe.
 * A match is created ONLY when the feeling is genuinely mutual (the other
 * member actually liked back). No fake reciprocity, ever.
 * Also accepts { action: "reset-passes" } to bring passed profiles back
 * on purpose — recycling is never silent.
 */
async function recordChoice(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Sign in to record likes." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const payload = (body ?? {}) as { profileId?: string; choice?: string; action?: string; requireIncomingLike?: boolean };

  /* Deliberate pass-reset: members choose to see passed people again. */
  if (payload.action === "reset-passes") {
    const removed = await db
      .delete(userSwipes)
      .where(and(eq(userSwipes.likerId, member.id), eq(userSwipes.action, "pass")))
      .returning({ likedId: userSwipes.likedId });
    return Response.json({ ok: true, reset: removed.length });
  }

  /* Undo the most recent swipe. An empty active match may be removed; a match
     with messages, media or call history is severed without deleting evidence.
     Blocked and explicitly ended matches are never removed by this action. */
  if (payload.action === "undo") {
    const [candidate] = await db.select({likedId:userSwipes.likedId,action:userSwipes.action,createdAt:userSwipes.createdAt})
      .from(userSwipes).where(eq(userSwipes.likerId,member.id)).orderBy(desc(userSwipes.createdAt)).limit(1);
    if(!candidate)return Response.json({error:"Nothing to undo yet."},{status:409});
    const result=await db.transaction(async (tx)=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${member.id}::text, ${candidate.likedId}::text) || ':' || greatest(${member.id}::text, ${candidate.likedId}::text), 0))`);
      const [last]=await tx.select({likedId:userSwipes.likedId,action:userSwipes.action,createdAt:userSwipes.createdAt}).from(userSwipes)
        .where(eq(userSwipes.likerId,member.id)).orderBy(desc(userSwipes.createdAt)).limit(1);
      if(!last||last.likedId!==candidate.likedId||last.action!==candidate.action||last.createdAt.getTime()!==candidate.createdAt.getTime())return {changed:true as const};
      let unmatched=false;
      if(last.action==='like'||last.action==='superlike'){
        const [userA,userB]=[member.id,last.likedId].sort();
        // A row lock ensures a concurrent message/media FK insert cannot be
        // committed between the history check and deletion of an empty match.
        const [match]=await tx.select({id:matches.id,status:matches.status}).from(matches)
          .where(and(eq(matches.userA,userA),eq(matches.userB,userB))).for('update');
        if(match?.status==='active'){
          const [anyMessage]=await tx.select({id:messages.id}).from(messages).where(eq(messages.matchId,match.id)).limit(1);
          const [anyMedia]=await tx.select({id:chatMedia.id}).from(chatMedia).where(eq(chatMedia.matchId,match.id)).limit(1);
          const [anyCall]=await tx.select({id:callSessions.id}).from(callSessions).where(eq(callSessions.matchId,match.id)).limit(1);
          if(undoMayDeleteMatchRow(Boolean(anyMessage||anyMedia||anyCall))){
            const removed=await tx.delete(matches).where(and(eq(matches.id,match.id),eq(matches.status,'active'))).returning({id:matches.id});unmatched=removed.length>0;
          }else{
            const severed=await tx.update(matches).set({status:'unmatched',unmatchedBy:member.id,unmatchedAt:new Date(),unmatchReason:'other'})
              .where(and(eq(matches.id,match.id),eq(matches.status,'active'))).returning({id:matches.id});unmatched=severed.length>0;
          }
        }
      }
      await tx.delete(userSwipes).where(and(eq(userSwipes.likerId,member.id),eq(userSwipes.likedId,last.likedId)));
      return {undone:last.likedId,unmatched};
    });
    if('changed' in result)return Response.json({error:'Your latest choice changed. Please try again.'},{status:409});
    return Response.json({ok:true,...result});
  }

  /* Unlike — recourse for accidental taps (a trap users raged about on the
     other platforms). */
  if (payload.action === "unlike") {
    const { profileId: targetId } = payload;
    if (!isUuid(targetId)) return Response.json({ error: "A valid profile id is required." }, { status: 400 });
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${member.id}::text, ${targetId}::text) || ':' || greatest(${member.id}::text, ${targetId}::text), 0))`);
      await tx.delete(userSwipes).where(and(eq(userSwipes.likerId, member.id), eq(userSwipes.likedId, targetId)));
    });
    return Response.json({ ok: true });
  }

  const { profileId, choice } = payload;
  if (!isUuid(profileId) || (choice !== "like" && choice !== "pass" && choice !== "superlike")) {
    return Response.json(
      { error: "A profile id and a choice of 'like', 'pass', or 'superlike' is required." },
      { status: 400 }
    );
  }

  const target = await getLocalProfile(profileId);
  if (!target) return Response.json({ error: "Profile not found." }, { status: 404 });
  if (member.id === profileId)
    return Response.json({ error: "You can't swipe on your own profile." }, { status: 400 });

  // Serialize both directions with block/unblock. This closes the simultaneous
  // reciprocal-like race and prevents creating a match over a committed block.
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${member.id}::text, ${profileId}::text) || ':' || greatest(${member.id}::text, ${profileId}::text), 0))`);
    const [block] = await tx.select({ id: blockedUsers.id }).from(blockedUsers).where(or(
      and(eq(blockedUsers.blockerId, member.id), eq(blockedUsers.blockedId, profileId)),
      and(eq(blockedUsers.blockerId, profileId), eq(blockedUsers.blockedId, member.id))
    )).limit(1);
    if (block) return { blocked: true as const };
    const [userA, userB] = [member.id, profileId].sort();
    const [existing] = await tx.select({ id: matches.id, status: matches.status }).from(matches)
      .where(and(eq(matches.userA, userA), eq(matches.userB, userB))).limit(1);
    // A separate unmatch is terminal; never manufacture a new positive swipe.
    if (existing && existing.status !== "active" && existing.status !== "archived")
      return { ended: true as const };
    const [backSwipe] = await tx.select({ action: userSwipes.action }).from(userSwipes)
      .where(and(eq(userSwipes.likerId, profileId),eq(userSwipes.likedId,member.id),inArray(userSwipes.action,["like","superlike"]))).limit(1);
    // A message-from-Likes action only implies a like back while the incoming
    // like is still real. Do not silently send a new one if it was withdrawn.
    if (payload.requireIncomingLike === true && (choice !== "like" || (!backSwipe && !existing))) return { incomingGone:true as const };
    await tx.insert(userSwipes).values({ likerId: member.id, likedId: profileId, action: choice })
      .onConflictDoUpdate({target:[userSwipes.likerId,userSwipes.likedId],set:{action:choice,createdAt:new Date()}});
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(userSwipes)
      .where(and(eq(userSwipes.likedId, profileId), eq(userSwipes.action, "like")));
    if (choice === "pass") return { likes: count, matched: false, matchId: null, newlyMatched: false };
    if (!backSwipe && !existing) return { likes: count, matched: false, matchId: null, newlyMatched: false };
    if (existing) return { likes: count, matched: true, matchId: existing.id, newlyMatched: false };
    // Another match path might insert without taking our pair lock. Never treat
    // an ON CONFLICT result as a live match without checking its status.
    const [created] = await tx.insert(matches).values({userA,userB,initiatedBy:member.id,lastMessageAt:new Date()})
      .onConflictDoNothing({target:[matches.userA,matches.userB]}).returning({id:matches.id});
    if (created) return { likes: count, matched: true, matchId: created.id, newlyMatched: true };
    const [winner] = await tx.select({id:matches.id,status:matches.status}).from(matches)
      .where(and(eq(matches.userA,userA),eq(matches.userB,userB))).limit(1);
    if (!winner || (winner.status !== "active" && winner.status !== "archived")) return {ended:true as const};
    return {likes:count,matched:true,matchId:winner.id,newlyMatched:false};
  });
  if ('blocked' in result) return Response.json({error:'Not available.'},{status:403});
  if ('ended' in result) return Response.json({error:'This conversation has ended.',endedPreviously: true},{status:409});
  if ('incomingGone' in result) return Response.json({error:'This like is no longer available. No message was sent.'},{status:409});
  return Response.json({ok:true,...result});
}

export const GET = withMemberApiErrors(readLikes, "likes-read");

export const POST = withMemberApiErrors(recordChoice, "discovery-choice");
