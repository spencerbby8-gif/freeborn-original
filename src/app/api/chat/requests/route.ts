import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { matches, messageRequests, profilePhotos, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { isBlockedPair } from "@/lib/conversation-access";
import { resolvePhotoUrl } from "@/lib/photo-url";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { to } = (body ?? {}) as { to?: string };
  if (!to) return Response.json({ error: "'to' is required." }, { status: 400 });
  if (to === member.id) return Response.json({ error: "You can't message yourself." }, { status: 400 });

  const [other] = await db
    .select({ id: userProfiles.id, messagePrivacy: userProfiles.messagePrivacy, displayName: userProfiles.displayName })
    .from(userProfiles)
    .where(eq(userProfiles.id, to))
    .limit(1);
  if (!other) return Response.json({ error: "Profile not found." }, { status: 404 });

  if (await isBlockedPair(member.id, to)) {
    return Response.json({ error: "This conversation isn't available." }, { status: 403 });
  }

  /* A live conversation outranks a request: open the thread, don't queue paper. */
  const [userA, userB] = [member.id, to].sort() as [string, string];
  const [match] = await db
    .select({ id: matches.id, status: matches.status })
    .from(matches)
    .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
    .limit(1);
  if (match && match.status === "active") {
    return Response.json({ matchId: match.id }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (match) {
    return Response.json(
      {
        error:
          "This conversation has ended. Unmatching is permanent in Freeborn: neither of you can send again.",
      },
      { status: 409 },
    );
  }

  /* Their privacy rule, enforced here exactly as /api/chat/start enforces it. */
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
        { status: 403 },
      );
    }
  }

  const [mine] = await db
    .select()
    .from(messageRequests)
    .where(and(eq(messageRequests.fromId, member.id), eq(messageRequests.toId, to)))
    .limit(1);
  if (mine?.status === "pending") {
    return Response.json(
      { requestId: mine.id, status: "pending" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const [theirs] = await db
    .select()
    .from(messageRequests)
    .where(and(eq(messageRequests.fromId, to), eq(messageRequests.toId, member.id)))
    .limit(1);
  if (theirs?.status === "pending") {
    return Response.json(
      { incomingId: theirs.id },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (rateLimited(member.id, 25, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many message requests. Please wait a while." }, { status: 429 });
  }

  if (mine) {
    /* A declined request may be renewed once the dust settles: same pair row,
       back to pending. Only the server writes this path, and RLS keeps the
       sender out of 'accepted' either way. */
    const [renewed] = await db
      .update(messageRequests)
      .set({ status: "pending", createdAt: new Date(), respondedAt: null })
      .where(eq(messageRequests.id, mine.id))
      .returning();
    return Response.json(
      { requestId: renewed.id, status: "pending" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const [created] = await db
    .insert(messageRequests)
    .values({ fromId: member.id, toId: to, status: "pending" })
    .returning();
  return Response.json(
    { requestId: created.id, status: "pending" },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
