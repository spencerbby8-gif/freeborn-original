import { rejectCrossOrigin } from "@/lib/request-guard";
import { withMemberApiErrors } from "@/lib/member-api-errors";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  blockedUsers,
  matches,
  messages,
  notificationPreferences,
  profilePhotos,
  userProfiles,
  userSwipes,
  verificationRequests,
} from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { resolvePhotoUrl } from "@/lib/photo-url";

/**
 * Alerts for the signed-in member: matches, unread messages (deep-linking
 * straight into the right conversation), and verification status updates.
 */
async function readNotifications(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const myMatches = await db
    .select()
    .from(matches)
    .where(or(eq(matches.userA, member.id), eq(matches.userB, member.id)))
    .orderBy(desc(matches.createdAt));

  const items: Array<{
    id: string;
    type: "match" | "message" | "like" | "verification" | "tip";
    title: string;
    body: string;
    photo?: string;
    at: Date;
    unread: boolean;
    href: string;
    profileId?: string;
    profileName?: string;
  }> = [];

  const blocks=await db.select({blockerId:blockedUsers.blockerId,blockedId:blockedUsers.blockedId}).from(blockedUsers).where(or(eq(blockedUsers.blockerId,member.id),eq(blockedUsers.blockedId,member.id)));
  const blocked=new Set(blocks.map(b=>b.blockerId===member.id?b.blockedId:b.blockerId));
  for (const m of myMatches) {
    const otherId = m.userA === member.id ? m.userB : m.userA;
    if(m.status!=="active"||blocked.has(otherId))continue;
    const [other] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, otherId))
      .limit(1);
    const [photo] = await db
      .select()
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, otherId))
      .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
      .limit(1);
    const name = other?.displayName ?? "Someone";
    const href = `/app/chat?match=${m.id}`;

    items.push({
      id: `match-${m.id}`,
      type: "match",
      title: `New match: ${name}`,
      body: "You liked each other. The conversation is open. Say hello.",
      photo: resolvePhotoUrl(photo?.storagePath ?? ""),
      at: m.createdAt,
      unread: false,
      href,
    });

    const [{ unread }] = await db
      .select({ unread: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.matchId, m.id),
          eq(messages.senderId, otherId),
          sql`${messages.readAt} is null`
        )
      );

    if (unread > 0) {
      const [last] = await db
        .select({ body: messages.body, createdAt: messages.createdAt })
        .from(messages)
        .where(and(eq(messages.matchId, m.id), eq(messages.senderId, otherId)))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      items.push({
        id: `msg-${m.id}`,
        type: "message",
        title: `${name} sent you a message`,
        body: "Open the conversation to read it.",
        photo: resolvePhotoUrl(photo?.storagePath ?? ""),
        at: last?.createdAt ?? m.createdAt,
        unread: true,
        href,
      });
    }
  }

  /* "Someone liked you — and you can see WHO." The most-demanded feature
     the competitors never built. */
  const incomingLikes = await db
    .select({ likerId: userSwipes.likerId, action: userSwipes.action, createdAt: userSwipes.createdAt })
    .from(userSwipes)
    .where(and(eq(userSwipes.likedId, member.id), inArray(userSwipes.action, ["like", "superlike"])))
    .orderBy(desc(userSwipes.createdAt))
    .limit(20);
  const existingPairs = new Set(myMatches.map(m => m.userA === member.id ? m.userB : m.userA));
  for (const like of incomingLikes) {
    // An existing or ended match is not a fresh like-back invitation.
    if(blocked.has(like.likerId) || existingPairs.has(like.likerId))continue;
    const [liker] = await db
      .select({ id: userProfiles.id, displayName: userProfiles.displayName })
      .from(userProfiles)
      .where(eq(userProfiles.id, like.likerId))
      .limit(1);
    if (!liker) continue;
    const [likerPhoto] = await db
      .select()
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, like.likerId))
      .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
      .limit(1);
    items.push({
      id: `like-${liker.id}-${like.createdAt.getTime()}`,
      type: "like",
      profileId: liker.id,
      profileName: liker.displayName ?? "Member",
      title: `${liker.displayName ?? "Someone"} liked you${like.action === "superlike" ? " (Super Like)" : ""}`,
      body: "Like back to match, or open a message draft.",
      photo: resolvePhotoUrl(likerPhoto?.storagePath ?? ""),
      at: like.createdAt,
      unread: false,
      href: "/app/likes",
    });
  }

  const durable=await db.execute<{id:string;kind:string;title:string;body:string;href:string;created_at:Date;read_at:Date|null}>(sql`select id,kind,title,body,href,created_at,read_at from public.member_notices where user_id=${member.id}::uuid order by created_at desc limit 50`);
  for(const n of durable.rows)items.push({id:`notice-${n.id}`,type:'tip',title:n.title,body:n.body,at:new Date(n.created_at),unread:!n.read_at,href:n.href});

  // Verification engine alerts
  const [latestVerify] = await db
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.accountId, member.id))
    .orderBy(desc(verificationRequests.submittedAt))
    .limit(1);
  if (latestVerify && !durable.rows.some(n=>n.kind==='verification')) {
    if (latestVerify.status === "approved") {
      items.push({
        id: `verify-${latestVerify.id}`,
        type: "verification",
        title: "You're verified",
        body: "Your identity check passed. The blue verification badge is on your profile.",
        at: latestVerify.reviewedAt ?? latestVerify.submittedAt,
        unread: false,
        href: "/app/profile",
      });
    } else if (latestVerify.status === "pending") {
      items.push({
        id: `verify-${latestVerify.id}`,
        type: "verification",
        title: "Verification in review",
        body: "Your selfie is being checked. We’ll update this feed when a result is available.",
        at: latestVerify.submittedAt,
        unread: false,
        href: "/app/profile",
      });
    }
  }

  /* Respect the member's own alert settings (Settings → Alerts) — the engine
     now honors the toggles the UI has been showing all along. */
  const [np] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, member.id))
    .limit(1);
  if (np) {
    const allowed = (t: string) => {
      if (t === "match") return np.matchAlerts;
      if (t === "message") return np.messageAlerts;
      if (t === "like") return np.likeAlerts;
      return true;
    };
    for (let i = items.length - 1; i >= 0; i--) {
      if (!allowed(items[i].type)) items.splice(i, 1);
    }
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  // Clearing a feed never marks a private message read or deletes source data.
  const visible = np?.dismissedBefore ? items.filter((item) => item.id !== "tip-1" && item.at.getTime() > np.dismissedBefore!.getTime()) : items;
  return Response.json({ notifications: visible, memberId: member.id });
}


async function clearNotifications(request: Request) {
  const blocked=rejectCrossOrigin(request);if(blocked)return blocked;
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("action" in body) || body.action !== "clear") {
    return Response.json({ error: "Unknown notification action." }, { status: 400 });
  }
  const now = new Date();
  await db.insert(notificationPreferences).values({ userId: member.id, dismissedBefore: now })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { dismissedBefore: now, updatedAt: now } });
  return Response.json({ ok: true });
}

export const GET = withMemberApiErrors(readNotifications, "notifications-read");

export const POST = withMemberApiErrors(clearNotifications, "notifications-clear");
