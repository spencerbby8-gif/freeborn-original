import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatSignals, matches, messageReactions, messages, userPrivateSettings, userProfiles, userTrustHistory } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { scoreScamMessage } from "@/lib/scam-guard";
import { decideMatchAccess, severedMessage, type MatchLifecycleStatus } from "@/lib/match-lifecycle";
import { openCase, recordScamFlag, recomputeTrust } from "@/lib/identity-resolve";
import { rejectCrossOrigin } from "@/lib/request-guard";

async function ownsMatch(
  matchId: string,
  memberId: string,
  action: "view_conversation" | "send_message"
) {
  const [row] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) return null;
  if (row.userA !== memberId && row.userB !== memberId) return null;
  /* Read and send are decided separately, on purpose. The member who was unmatched keeps read
     access so they can still quote and report what was sent to them (Bumble documents exactly
     this); the member who ended it loses access to their own copy, because that was their
     choice to make. Neither may send. */
  const decision = decideMatchAccess({
    status: row.status as MatchLifecycleStatus,
    isParticipant: true,
    isActor: row.unmatchedBy === memberId,
    hasMessages: false,
    action,
  });
  if (!decision.allow) return { denied: decision.reason as string, row } as const;
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

  const viewed = await ownsMatch(matchId, member.id, "view_conversation");
  if (!viewed) return Response.json({ error: "Match not found." }, { status: 404 });
  if ("denied" in viewed)
    return Response.json(
      { error: "This conversation isn't available. Unmatching removes it from the member who ended it.", ended: true },
      { status: 403 }
    );
  const match = viewed;

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
    /* `thread` exists because visibility and sendability are DIFFERENT questions, and the client
       cannot derive the second one: `view_conversation` was just granted (so the thread renders)
       while `send_message` may still be denied — that is exactly the read-only-for-report state a
       member keeps after being unmatched. Without this the UI shows a composer into every refusal
       arrives as a 403, which reads to the member like a broken network. Computed by the same
       decideMatchAccess the POST path uses, so there is one table, not two. */
    thread: (() => {
      const send = decideMatchAccess({
        status: match.status as MatchLifecycleStatus,
        isParticipant: true,
        isActor: match.unmatchedBy === member.id,
        hasMessages: rows.length > 0,
        action: "send_message",
      });
      return {
        canSend: send.allow,
        status: match.status,
        reason: send.allow ? null : send.reason,
        notice: send.allow ? null : severedMessage(match.status as MatchLifecycleStatus),
      };
    })(),
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

  const sent = await ownsMatch(matchId, member.id, "send_message");
  if (!sent) return Response.json({ error: "Match not found." }, { status: 404 });
  if ("denied" in sent)
    return Response.json({ error: severedMessage(sent.row.status as MatchLifecycleStatus) }, { status: 403 });
  const match = sent;

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
  /* Scored, not boolean: `recentFlags` is read BEFORE this message is counted, so a
     first-time flag cannot escalate itself, and only a repeat sender crosses the line
     into an enforcement case. The message is still never blocked — the recipient keeps
     the choice, which is the whole point of a warning rather than a shadow filter. */
  const [priorHist] = await db
    .select({ flags: userTrustHistory.scamFlags7d })
    .from(userTrustHistory)
    .where(eq(userTrustHistory.userId, member.id))
    .limit(1);
  const scam = scoreScamMessage(clean, Number(priorHist?.flags ?? 0));
  const scamFlag = scam.shouldWarn;
  const rows = await db
    .insert(messages)
    .values({ matchId, senderId: member.id, body: clean, flagged: scamFlag })
    .returning({ id: messages.id, createdAt: messages.createdAt });
  const [stored] = rows;
  if (scamFlag) await recordScamFlag(member.id);
  if (scam.shouldEscalate) {
    try {
      await openCase({
        userId: member.id,
        email: member.email,
        input: {
          code: "scam_pattern_message",
          violatedClass: "violation_behavior",
          detail: `scam score ${scam.score} across ${scam.categories.join("+")} (repeat: ${Number(priorHist?.flags ?? 0)} flags in 7d)`,
          notes:
            "Several of your recent messages matched patterns used in payment scams. Nothing has been hidden or removed; a person will look, and you can explain here.",
          trustDelta: -6,
          openedBy: "system",
          verified: false,
        },
      });
      await recomputeTrust(member.id).catch(() => undefined);
    } catch {
      /* escalation is a review aid; it must never fail the member's send */
    }
  }
  await db.update(matches).set({ lastMessageAt: new Date() }).where(eq(matches.id, matchId));

  // Read receipts: the other member reads everything you've sent before they
  // answer. Honest read receipts: YOUR messages flip to "read" only when the
  // OTHER member opens the conversation (their GET marks them). Nothing is
  // marked read at send time.

  // No scripted replies. Every message in Freeborn is written by a real
  // member — fake activity is exactly what destroyed the platforms we're
  // here to beat.

  /* REALTIME SIGNAL (2026-10-30) — see db/migrations/2026-10-30-chat-signals.sql.
     A content-free row in `chat_signals` is the only notification path this deployment can
     use: the chat tables are RLS-forced with zero policies, so `postgres_changes` on
     `messages` would deliver nothing to a client, and there is no service-role key to call
     Realtime's broadcast REST API with. It carries the match id and a kind, never message
     text, and it is written AFTER the message is stored — so a client that reacts to the
     signal and refetches cannot read a half-written conversation.

     Whole block is best-effort on purpose: a signal failure must never turn a delivered
     message into a failed send. The recipient's poll (and their resync on wake/online) still
     finds the message, so the worst case is latency. */
  try {
    // One pending 'message' signal per conversation is enough — a signal means "fetch", not
    // "fetch N times". 'severed'/'cleared' rows are never pruned, only appended, because they
    // mark a state change rather than a delta.
    await db.delete(chatSignals).where(
      and(eq(chatSignals.matchId, matchId), eq(chatSignals.kind, "message"))
    );
    await db.insert(chatSignals).values({ matchId, kind: "message" });
  } catch {
    /* notification is an accelerator */
  }

  /* The stored id comes back so the client can retire its optimistic echo by IDENTITY.
     Matching by body text within a window (what this route used to force on the client) makes
     a member's second identical message vanish, and makes a slow server drop the bubble and
     then re-render it. See src/lib/chat-sync.ts:reconcilePending. */
  return Response.json({
    ok: true,
    message: stored
      ? { id: stored.id, at: stored.createdAt instanceof Date ? stored.createdAt.toISOString() : String(stored.createdAt) }
      : null,
  });
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

  const target = await ownsMatch(matchId, member.id, "send_message");
  if (!target) return Response.json({ error: "Match not found." }, { status: 404 });
  if ("denied" in target)
    return Response.json(
      {
        error:
          target.denied === "deny:thread-not-open"
            ? "This conversation has ended, so its history is kept for the member who did not end it. Deleting it here would remove their ability to report what was sent."
            : "This conversation isn't available.",
      },
      { status: 409 }
    );
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* DELETE with no body is fine; a malformed one is not a reason to refuse a member. */
  }
  if (((body ?? {}) as { destructive?: unknown }).destructive !== true)
    return Response.json(
      { error: "Deleting a whole conversation cannot be undone. Confirm first.", needsConfirmation: true },
      { status: 409 }
    );

  const removed = await db.delete(messages).where(eq(messages.matchId, matchId)).returning({ id: messages.id });
  // The other member's open thread has to learn this happened. Same optional-signal contract
  // as the send path: if the insert fails, their poll still refetches and finds an empty
  // conversation — the signal buys immediacy, never correctness. `cleared` is in the table's
  // kind CHECK specifically so a wipe is distinguishable from "there were never messages".
  try {
    await db.insert(chatSignals).values({ matchId, kind: "cleared" });
  } catch (err) {
    console.warn("[chat] cleared signal skipped:", (err as Error).message);
  }
  return Response.json({ ok: true, deleted: removed.length });
}
