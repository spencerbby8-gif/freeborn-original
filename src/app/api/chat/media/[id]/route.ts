import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { chatMedia, matches, profilePhotos, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { decideMediaAccess, needsPublishedProfilePhotoLookup } from "@/lib/media-access";
import { badIdResponse, isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/media/:id
 *
 * Streams one stored chat attachment — a photo, video or voice note sent
 * between two matched members.
 *
 * WHY THIS IS NOT SIMPLER
 *   This route used to have no authentication at all. Its comment said ids are
 *   "random uuids (unguessable)", and it answered with
 *   `Cache-Control: public, max-age=31536000, immutable`. Three problems:
 *
 *   1. Guessability is not an access control. Ids leak through browser history,
 *      Referer headers, shared links, proxy logs, and the message body of
 *      anyone who ever received the attachment (media is embedded in
 *      messages.body as [[image:/api/chat/media/<id>]]).
 *   2. `public` explicitly invites SHARED caches — CDNs, corporate proxies,
 *      Netlify's edge — to store private media for a year.
 *   3. No nosniff, and `mime` is client-declared at upload time.
 *
 *   On a platform where members may exchange intimate images, that was the
 *   highest-impact privacy defect in the codebase. Seven live messages
 *   referenced this route at the time of the audit.
 *
 *   Enforcing ownership needs a link from the media row to a conversation,
 *   which `chat_media` did not have. That column is added by
 *   db/migrations/2026-10-16-rls-and-media-ownership.sql — apply the migration
 *   BEFORE deploying this file.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const member = await getMember(request);
  if (!member) return new Response("Not signed in.", { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return badIdResponse();

  const [row] = await db
    .select({ mime: chatMedia.mime, data: chatMedia.data, matchId: chatMedia.matchId, senderId: chatMedia.senderId })
    .from(chatMedia)
    .where(eq(chatMedia.id, id))
    .limit(1);

  // 404 rather than 403 for both "missing" and "not yours": a 403 confirms the
  // id exists, which turns this endpoint into an oracle for probing.
  if (!row) return new Response("Not found", { status: 404 });

  /* The decision lives in src/lib/media-access.ts so that every combination of these
     facts can be EXECUTED under test — the harness enumerates the truth table. The route's
     job is only to gather the facts, cheapest first: the conversation link (indexed,
     already loaded) and, only when nothing has granted yet, the profile-photo lookup. */
  let requesterIsParticipant = false;
  if (row.matchId) {
    // The caller must be one of the two participants of this conversation.
    const [participant] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.id, row.matchId),
          or(eq(matches.userA, member.id), eq(matches.userB, member.id))
        )
      )
      .limit(1);
    requesterIsParticipant = Boolean(participant);
  }

  const facts = {
    requesterId: member.id,
    mediaSenderId: row.senderId,
    mediaMatchId: row.matchId,
    requesterIsParticipant,
    publishedAsVisibleProfilePhoto: false,
  };

  if (needsPublishedProfilePhotoLookup(facts)) {
    /* The audience that fixes disappearing profile photos:
       `/api/profile/photos` stores profile images as chat_media blobs (see that
       route's POST), and those rows have no conversation, so the rules above left
       them readable by their owner ONLY — the owner saw their own photo everywhere
       and every other member saw a broken image, which is exactly how "my photos
       disappeared" gets reported. An <img> for a profile photo is a *member*
       request, so the right rule is the one RLS already enforces on profile_photos
       itself. The predicate below is copied from policy "Discoverable members'
       photos are visible" (db/migrations/2026-10-16-rls-and-media-ownership.sql) so
       the two cannot drift, and it is no wider than the public `profile-photos`
       bucket this media substitutes for. It never widens a private conversation
       attachment: a blob counts only if the owner put it on their own profile. */
    const published = await db
      .select({ id: profilePhotos.id })
      .from(profilePhotos)
      .innerJoin(userProfiles, eq(userProfiles.id, profilePhotos.userId))
      .where(
        and(
          eq(profilePhotos.storagePath, `/api/chat/media/${id}`),
          eq(userProfiles.profileStatus, "active"),
          eq(userProfiles.discoverable, true),
          inArray(userProfiles.onboardingStage, ["profile_setup", "ready"])
        )
      )
      .limit(1);
    facts.publishedAsVisibleProfilePhoto = published.length > 0;
  }

  if (!decideMediaAccess(facts).allow) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      // private: no shared cache may store this. no-store: do not persist it.
      // Media is immutable in principle, but privacy beats the byte savings.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
