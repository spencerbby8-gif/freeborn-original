import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { humanChallenges } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { assignPoseChallenge } from "@/lib/pose-challenge";

export const dynamic = "force-dynamic";

/**
 * POST /api/verification/challenge
 *
 * WHAT THIS IS FOR, stated precisely, because overclaiming liveness is how
 * dating apps end up with a "verified" badge a scripted client can buy.
 *
 * Freeborn's selfie check accepted `liveness.blink === true` from the browser
 * (verification/check/route.ts:247 builds a `blinkTag` straight from it). MediaPipe
 * runs on-device and the server never saw the frames, so that boolean was, and still
 * is, unverifiable — any client can send `true` without moving a face.
 *
 * This route does NOT fix that. It fixes the strictly narrower, still-real problem:
 * pre-computing or replaying a selfie. A verification attempt now has to carry a
 * token the server issued seconds ago, bound to this member's email, usable once.
 * Consequences that are true and worth having:
 *   - a captured/reused photo cannot be replayed: its challenge is consumed;
 *   - an attacker cannot pre-generate a batch of "blink-verified" submissions
 *     offline and upload them on a schedule;
 *   - the issued/consumed trail in `human_challenges` is itself an audit record of
 *     how often one member attempts verification, which previously left no trace.
 * What it still cannot do: prove a live human was present. That needs frame-level
 * server-side analysis, which is recorded as a limitation, not claimed here.
 *
 * Deliberately NOT proof-of-work. PoW buys bot-cost; this buys freshness and
 * single-use. Charging every honest member 18 bits of hashing for that would be a
 * worse trade than the hole, so difficulty is unused for this purpose and the
 * control is the 5-minute expiry plus one-shot consumption.
 *
 * Abuse control: one live challenge per (member, purpose) — re-issuing expires the
 * previous row, so the endpoint cannot be used to mint an unbounded pile of tokens.
 */
const TTL_SECONDS = 300;

export async function POST(request: Request) {
  const corsReject = rejectCrossOrigin(request);
  if (corsReject) return corsReject;

  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const email = member.email.toLowerCase();
  const nonce = randomBytes(16).toString("hex");

  let issued: {
    row: { id: string; expiresAt: Date };
    pose: { label: string; demo: string; poseId: string } | null;
    poseWarning: string | null;
  };
  try {
    issued = await db.transaction(async tx => {
      // Same order for every issuer: serialize both the email's live token and
      // the account's active poses, including email changes / reused emails.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('verification-email:' || ${email}::text, 0))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('verification-user:' || ${member.id}::text, 0))`);
      await tx.update(humanChallenges).set({ status: "expired" }).where(and(
        eq(humanChallenges.email, email), eq(humanChallenges.purpose, "verification"), eq(humanChallenges.status, "issued")
      ));
      const [row] = await tx.insert(humanChallenges).values({
        email,
        purpose: "verification",
        nonce,
        tokenHash: createHash("sha256").update(`freeborn-liveness-v1:${nonce}`).digest().subarray(0, 8).toString("hex"),
        status: "issued",
        difficultyBits: 0,
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
      }).returning({ id: humanChallenges.id, expiresAt: humanChallenges.expiresAt });
      if (!row) throw new Error("No challenge row returned");

      // A savepoint preserves the existing pose-store outage fallback without
      // committing partial pose changes when assignment fails. The outer lock
      // stays held until the challenge and its optional pose are committed.
      let pose: { label: string; demo: string; poseId: string } | null = null;
      let poseWarning: string | null = null;
      try {
        const assigned = await tx.transaction(inner => assignPoseChallenge(member.id, row.id, inner));
        pose = { label: assigned.pose.label, demo: assigned.pose.demo, poseId: assigned.poseId };
      } catch {
        poseWarning = "The pose challenge could not be prepared.";
      }
      return { row, pose, poseWarning };
    });
  } catch {
    // The transaction may have committed even if its response was lost.
    return Response.json({ error: "We couldn't prepare a verification check. Please try again." }, { status: 503 });
  }
  const { row, pose, poseWarning } = issued;

  return Response.json(
    {
      livenessToken: row.id,
      /* the nonce is returned so an honest client can prove it holds the challenge;
         it is not a secret and grants nothing by itself */
      nonce,
      expiresIn: TTL_SECONDS,
      expiresAt: row.expiresAt,
      /** Server-assigned pose. Perform THIS one; a client-supplied label is ignored. */
      pose,
      poseRequired: pose !== null,
      ...(poseWarning ? { poseWarning } : {}),
      rule: pose
        ? `POST /api/verification/check with livenessToken. One use, ${TTL_SECONDS} seconds. The pose above is the only pose that counts. A missing or consumed token means the attempt is recorded but the badge is not granted.`
        : `POST /api/verification/check with livenessToken. One use, ${TTL_SECONDS} seconds. A missing or consumed token means the attempt is recorded but the badge is not granted.`,
    },
    { headers: { "cache-control": "private, no-store" } }
  );
}
