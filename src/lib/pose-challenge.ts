import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { verificationChallenges } from "@/db/schema";
import { POSES, POSE_TTL_SECONDS, poseIdFor, type Pose, type PoseState } from "@/lib/pose-pool";
import {
  assignPose,
  consumePose,
  type AssignedPose,
  type PoseOutcome,
  type PoseStore,
} from "@/lib/pose-store";
import type { PoseRow } from "@/lib/pose-pool";

export { POSES, POSE_TTL_SECONDS, poseIdFor, poseTag } from "@/lib/pose-pool";
export type { Pose, PoseState, PoseRow } from "@/lib/pose-pool";

/**
 * SERVER-ASSIGNED POSE CHALLENGE.
 *
 * WHY THIS EXISTS
 * ---------------
 * `verification/check` asked a vision model whether the selfie matched the pose, but
 * it took the pose from the request: `poseLabel` arrived in the JSON body, was
 * echoed straight into the prompt, and "raise an open hand" was therefore whatever
 * the submitting client said it was. The pose step decided nothing, so it could not
 * be replayed against — and the same string was interpolated into a single-quoted
 * prompt literal, which is a prompt-injection path.
 *
 * `public.verification_challenges` already existed with exactly the right shape
 * (`pose_id`, `gesture`, `head_direction`, `expression_cue`, a UNIQUE `challenge_token`
 * binding to a liveness token, `active|consumed|expired`), and it had 7 rows all still
 * `active` since 2026-07-13: provisioned, never wired. This module wires it.
 *
 * WHAT THIS PROVES, and only this
 * -------------------------------
 *   - the pose was chosen by the server, seconds ago, and shown to nobody else;
 *   - it can be satisfied once, inside the TTL, by the member it was issued to;
 *   - therefore a staged or replayed photograph must beat a pose chosen AFTER it exists.
 * It does NOT prove a live human was present. A scripted client can still perform the
 * pose on camera, and a strong deepfake can still satisfy a still-image judge.
 * Frame-level server-side analysis is the only thing that would close that, and it is
 * recorded as a limitation rather than claimed here.
 *
 * WHY THE STORE IS INJECTED
 * -------------------------
 * The interesting properties here are ORDERING properties — look up before expiring,
 * compare-and-set rather than read-then-write, never re-roll a pose a member is holding.
 * None of them are visible to a test that only reads source text, and two of them were
 * broken in the first draft of this file for exactly that reason. So the rules live in
 * `assignPose`/`consumePose` below, which run against any `PoseStore`; `drizzlePoseStore`
 * is the production adapter and the offline harness exercises the same functions against
 * a deterministic fake. Both paths execute the same code.
 */

export * from "@/lib/pose-store";
/* ------------------------------------------------------------------ *
 * Production adapter. Nothing above this line touches the database. *
 * ------------------------------------------------------------------ */

export const drizzlePoseStore: PoseStore = {
  async findActiveByToken(token) {
    const [row] = await db
      .select({
        id: verificationChallenges.id,
        userId: verificationChallenges.userId,
        poseId: verificationChallenges.poseId,
        gesture: verificationChallenges.gesture,
        status: verificationChallenges.status,
        expiresAt: verificationChallenges.expiresAt,
        challengeToken: verificationChallenges.challengeToken,
      })
      .from(verificationChallenges)
      .where(
        and(
          eq(verificationChallenges.challengeToken, token),
          eq(verificationChallenges.status, "active")
        )
      )
      .limit(1);
    return (row as PoseRow) ?? null;
  },

  async findByToken(token) {
    const [row] = await db
      .select({
        id: verificationChallenges.id,
        userId: verificationChallenges.userId,
        poseId: verificationChallenges.poseId,
        gesture: verificationChallenges.gesture,
        status: verificationChallenges.status,
        expiresAt: verificationChallenges.expiresAt,
        challengeToken: verificationChallenges.challengeToken,
      })
      .from(verificationChallenges)
      .where(eq(verificationChallenges.challengeToken, token))
      .limit(1);
    return (row as PoseRow) ?? null;
  },

  async latestPoseId(userId) {
    const [row] = await db
      .select({ poseId: verificationChallenges.poseId })
      .from(verificationChallenges)
      .where(eq(verificationChallenges.userId, userId))
      .orderBy(desc(verificationChallenges.createdAt))
      .limit(1);
    return row?.poseId ?? null;
  },

  async expireOtherActive(userId, keepToken) {
    await db
      .update(verificationChallenges)
      .set({ status: "expired" })
      .where(
        and(
          eq(verificationChallenges.userId, userId),
          eq(verificationChallenges.status, "active"),
          /* text = text. The live column is TEXT with a UNIQUE index on it (verified via
             information_schema); adding a `::uuid` cast here throws 42883 on every call. */
          sql`challenge_token <> ${keepToken}`
        )
      );
  },

  async insert(row) {
    await db.insert(verificationChallenges).values({
      userId: row.userId,
      poseId: row.poseId,
      gesture: row.gesture,
      /* The two extra NOT NULL columns exist in the live table. They are filled from the
         same label the model is asked about: this pose set is hand-gesture based, so head
         and expression are explicitly unconstrained rather than silently invented. */
      headDirection: "any",
      expressionCue: "any",
      challengeToken: row.challengeToken,
      challengePayload: { demo: row.demo, issuedBy: "server" },
      status: "active",
      expiresAt: sql`timezone('utc', now()) + interval '${sql.raw(String(row.ttlSeconds))} seconds'`,
    });
  },

  async consume(id) {
    const [won] = await db
      .update(verificationChallenges)
      .set({ status: "consumed" })
      .where(
        and(
          eq(verificationChallenges.id, id),
          eq(verificationChallenges.status, "active")
        )
      )
      .returning({ id: verificationChallenges.id });
    return Boolean(won);
  },

  async markExpired(id) {
    await db
      .update(verificationChallenges)
      .set({ status: "expired" })
      .where(
        and(
          eq(verificationChallenges.id, id),
          eq(verificationChallenges.status, "active")
        )
      );
  },
};

/** Route-facing wrapper: the production store, with the token shape guarded. */
export async function assignPoseChallenge(
  userId: string,
  challengeToken: string
): Promise<AssignedPose> {
  return assignPose(userId, challengeToken, drizzlePoseStore);
}

export async function consumePoseChallenge(
  userId: string,
  challengeToken: string,
  claim: string | undefined
): Promise<PoseOutcome> {
  if (typeof challengeToken !== "string" || !/^[0-9a-f-]{36}$/i.test(challengeToken)) {
    return { state: "absent", detail: "token malformed" };
  }
  return consumePose(userId, challengeToken, claim, drizzlePoseStore);
}
