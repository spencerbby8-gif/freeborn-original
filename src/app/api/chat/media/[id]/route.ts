import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { chatMedia, matches } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

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

  const [row] = await db
    .select({ mime: chatMedia.mime, data: chatMedia.data, matchId: chatMedia.matchId, senderId: chatMedia.senderId })
    .from(chatMedia)
    .where(eq(chatMedia.id, id))
    .limit(1);

  // 404 rather than 403 for both "missing" and "not yours": a 403 confirms the
  // id exists, which turns this endpoint into an oracle for probing.
  if (!row) return new Response("Not found", { status: 404 });

  let allowed = false;
  if (row.matchId) {
    // The caller must be one of the two participants of this conversation.
    const [participant] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.id, row.matchId),
          or(eq(matches.userA, member.id), eq(matches.userB, member.id)),
        ),
      )
      .limit(1);
    allowed = Boolean(participant);
  } else {
    // Legacy row uploaded before chat_media.match_id existed. The only person
    // we can prove a relationship for is the sender.
    allowed = row.senderId === member.id;
  }

  if (!allowed) return new Response("Not found", { status: 404 });

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
