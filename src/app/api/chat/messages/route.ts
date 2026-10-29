import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, messageReactions, messages, userPrivateSettings, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { looksLikeScam } from "@/lib/scam-guard";
import { recordScamFlag } from "@/lib/identity-resolve";
import { rejectCrossOrigin } from "@/lib/request-guard";

async function ownsMatch(matchId: string, memberId: string) {
  const [row] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) return null;
  if (row.userA !== memberId && row.userB !== memberId) return null;
  return row;
}

/** Thread messages (marks the other person's messages as read). */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const url = new URL(request.url);
  const matchId = url.searchParams.get("match");
  if (!matchId) return Response.json({ error: "match is required." }, { status: 400 });

  const match = await ownsMatch(matchId, member.id);
  if (!match) return Response.json({ error: "Match not found." }, { status: 404 });

  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.matchId, matchId),
        sql`${messages.senderId} <> ${member.id}`,
        sql`${messages.readAt} is null`
      )
    );

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.matchId, matchId))
    .orderBy(asc(messages.createdAt));

  /* Read receipts are the READER's choice: when the other member turned
     receipts off, your own messages report read=false — the read event is
     still recorded (their unread badge works), it is simply not shown to
     you. Their messages report your own read state normally. */
  const otherId = match.userA === member.id ? match.userB : match.userA;
  const [otherPriv] = await db
    .select({ readReceipts: userPrivateSettings.readReceipts })
    .from(userPrivateSettings)
    .where(eq(userPrivateSettings.userId, otherId))
    .limit(1);
  const receiptsAllowed = otherPriv?.readReceipts ?? true;

  /* Aggregate reactions per message (hold-to-react, double-tap to love). */
  const ids = rows.map((m) => m.id);
  const reactionsByMessage = new Map<
    string,
    Array<{ emoji: string; mine: boolean; count: number }>
  >();
  if (ids.length > 0) {
    const reactionRows = await db
      .select({
        messageId: messageReactions.messageId,
        userId: messageReactions.userId,
        emoji: messageReactions.emoji,
      })
      .from(messageReactions)
      .where(inArray(messageReactions.messageId, ids));
    for (const r of reactionRows) {
      const list = reactionsByMessage.get(r.messageId) ?? [];
      const existing = list.find((x) => x.emoji === r.emoji);
      if (existing) {
        existing.count += 1;
        existing.mine = existing.mine || r.userId === member.id;
      } else {
        list.push({ emoji: r.emoji, mine: r.userId === member.id, count: 1 });
      }
      reactionsByMessage.set(r.messageId, list);
    }
  }

  return Response.json({
    messages: rows.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.senderId === member.id,
      at: m.createdAt,
      read: m.senderId === member.id ? Boolean(m.readAt) && receiptsAllowed : Boolean(m.readAt),
      flagged: Boolean(m.flagged),
      reactions: reactionsByMessage.get(m.id) ?? [],
    })),
  });
}

/** Send a message; the preview-room persona answers shortly after. */
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

  const { match: matchId, text } = (body ?? {}) as { match?: string; text?: string };
  const clean = text?.trim() ?? "";
  if (!matchId || !clean)
    return Response.json({ error: "match and text are required." }, { status: 400 });
  if (clean.length > 2000)
    return Response.json({ error: "Keep messages under 2000 characters." }, { status: 400 });

  const match = await ownsMatch(matchId, member.id);
  if (!match) return Response.json({ error: "Match not found." }, { status: 404 });

  /* Privacy rules keep applying inside an open conversation too. */
  const otherId = match.userA === member.id ? match.userB : match.userA;
  const [other] = await db
    .select({
      displayName: userProfiles.displayName,
      messagePrivacy: userProfiles.messagePrivacy,
    })
    .from(userProfiles)
    .where(eq(userProfiles.id, otherId))
    .limit(1);
  const mp = other?.messagePrivacy ?? "everyone";
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
      const name = other?.displayName ?? "This member";
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

  /* Scam guard: flag recognizable scam patterns so the recipient is warned.
     The flag is also counted against the SENDER, because a warning that the
     recipient dismisses was previously the end of the signal — Bumble's
     Deception Detector acts before the recipient ever sees the profile, and the
     minimum Freeborn can do with the same intent is accumulate the evidence so
     repeat behaviour raises review priority instead of resetting to zero every
     message. It never blocks speech and never auto-acts. */
  const scamFlag = looksLikeScam(clean);
  await db
    .insert(messages)
    .values({ matchId, senderId: member.id, body: clean, flagged: scamFlag });
  if (scamFlag) await recordScamFlag(member.id);
  await db.update(matches).set({ lastMessageAt: new Date() }).where(eq(matches.id, matchId));

  // Read receipts: the other member reads everything you've sent before they
  // answer. Honest read receipts: YOUR messages flip to "read" only when the
  // OTHER member opens the conversation (their GET marks them). Nothing is
  // marked read at send time.

  // No scripted replies. Every message in Freeborn is written by a real
  // member — fake activity is exactly what destroyed the platforms we're
  // here to beat.

  return Response.json({ ok: true });
}

/**
 * DELETE /api/chat/messages?match=<id> — delete the whole conversation.
 * Every message on both sides is removed; the match itself stays open.
 */
export async function DELETE(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const url = new URL(request.url);
  const matchId = url.searchParams.get("match");
  if (!matchId) return Response.json({ error: "match is required." }, { status: 400 });

  const match = await ownsMatch(matchId, member.id);
  if (!match) return Response.json({ error: "Match not found." }, { status: 404 });

  const removed = await db.delete(messages).where(eq(messages.matchId, matchId)).returning({ id: messages.id });
  return Response.json({ ok: true, deleted: removed.length });
}
