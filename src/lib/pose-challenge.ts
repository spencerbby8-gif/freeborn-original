import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { verificationChallenges } from "@/db/schema";
import { POSES, POSE_TTL_SECONDS, poseIdFor, type Pose, type PoseState } from "@/lib/pose-pool";
export { POSES, POSE_TTL_SECONDS, poseIdFor, poseTag } from "@/lib/pose-pool";
export type { Pose, PoseState } from "@/lib/pose-pool";

/**
 * SERVER-ASSIGNED POSE CHALLENGE.
 *
 * WHY THIS EXISTS
 * ---------------
 * `verification/check` asked a vision model whether the selfie matched the pose, but
 * it took the pose from the request: `poseLabel` arrived in the JSON body, was
 * echoed straight into the prompt, and "raise an open hand" was therefore whatever
 * the submitting client said it was. The pose step decided nothing, so it could not
 * be replayed against — and the label doubled as unvalidated text interpolated into a
 * model prompt.
 *
 * `public.verification_challenges` already existed with exactly the right shape
 * (`pose_id`, `gesture`, `head_direction`, `expression_cue`, a UNIQUE `challenge_token`
 * that binds to a liveness token, `active|consumed|expired`), and it had 7 rows dated
 * 2026-07-13, all still `active`. Nothing in the app read or wrote it: the pipeline was
 * provisioned and never wired. This module wires it.
 *
 * WHAT THIS PROVES, and only this
 * -------------------------------
 *   - the pose was chosen by the server, seconds ago, and shown to nobody else;
 *   - it can be satisfied once, inside the TTL, by the member it was issued to;
 *   - therefore a staged/replayed photograph must beat a pose chosen AFTER it exists.
 * It does NOT prove a live human was present. A scripted client can still perform the
 * pose on camera, and a good enough deepfake can still satisfy a still-image judge.
 * Frame-level server-side analysis is the only thing that would close that, and it is
 * recorded as a limitation rather than claimed here.
 *
 * FAILURE MODE IS DELIBERATELY SOFT
 * ---------------------------------
 * If the pose row cannot be written or read, the attempt is still recorded and routed
 * to a human; only the badge is withheld. An unavailable control must never become an
 * outage for honest members — the same rule `liveness-challenge.ts` follows.
 */

export interface AssignedPose {
  pose: Pose;
  poseId: string;
  expiresIn: number;
}

/**
 * Issue the pose for one liveness token. Idempotent per token: an honest client that
 * re-opens the camera sees the SAME pose again rather than being re-rolled, which
 * would otherwise make a retry impossible to satisfy.
 */
export async function assignPoseChallenge(
  userId: string,
  challengeToken: string
): Promise<AssignedPose> {
  const [existing] = await db
    .select({
      poseId: verificationChallenges.poseId,
      gesture: verificationChallenges.gesture,
      expiresAt: verificationChallenges.expiresAt,
    })
    .from(verificationChallenges)
    .where(
      and(
        eq(verificationChallenges.challengeToken, challengeToken),
        eq(verificationChallenges.status, "active")
      )
    )
    .limit(1);

  if (existing) {
    const known = POSES.find((p) => p.label === existing.gesture);
    const pose: Pose = known ?? { label: existing.gesture, demo: POSES[0].demo };
    const liveMs = existing.expiresAt
      ? Math.max(0, existing.expiresAt.getTime() - Date.now())
      : POSE_TTL_SECONDS * 1000;
    return {
      pose,
      poseId: existing.poseId,
      expiresIn: Math.max(1, Math.round(liveMs / 1000)),
    };
  }

  /* Avoid re-serving the pose this member just failed, when they have one on record. */
  const [last] = await db
    .select({ poseId: verificationChallenges.poseId })
    .from(verificationChallenges)
    .where(eq(verificationChallenges.userId, userId))
    .orderBy(desc(verificationChallenges.createdAt))
    .limit(1);

  const candidates = POSES.filter((p) => poseIdFor(p.label) !== last?.poseId);
  const pool = candidates.length > 0 ? candidates : [...POSES];
  const pose = pool[Math.floor(Math.random() * pool.length)] ?? POSES[0];

  /* Hygiene: a member who retries would otherwise leave one `active` row per aborted
     attempt forever, because re-issuing expires the liveness token but not the pose.
     Expire this member's OTHER stale rows first. Order matters: the idempotent lookup
     above has already run, so the caller's own row is deliberately excluded here — it
     was just returned, and expiring it before the insert would make every re-entry to
     the camera step re-roll the pose, leaving the member posing for a prompt that no
     longer exists. */
  await db
    .update(verificationChallenges)
    .set({ status: "expired" })
    .where(
      and(
        eq(verificationChallenges.userId, userId),
        eq(verificationChallenges.status, "active"),
        /* text = text: the live column is TEXT (see the note in db/schema.ts), so no
           cast belongs here. */
        sql`challenge_token <> ${challengeToken}`
      )
    );

  await db.insert(verificationChallenges).values({
    userId,
    poseId: poseIdFor(pose.label),
    gesture: pose.label,
    /* The two extra columns exist in the live table and are NOT NULL. They are filled
       from the same label the model is asked about: the pose set is hand-gesture based,
       so head/expression are explicitly unconstrained rather than silently invented. */
    headDirection: "any",
    expressionCue: "any",
    challengeToken,
    challengePayload: { demo: pose.demo, issuedBy: "server" },
    status: "active",
    expiresAt: sql`timezone('utc', now()) + interval '${sql.raw(String(POSE_TTL_SECONDS))} seconds'`,
  });

  return { pose, poseId: poseIdFor(pose.label), expiresIn: POSE_TTL_SECONDS };
}

export interface PoseOutcome {
  state: PoseState;
  /** The pose the SERVER asked for. Only ever present when the row was found. */
  label?: string;
  detail: string;
}

/**
 * Consume the pose bound to a liveness token.
 *
 * `claim` is the pose the client says it performed. It is NOT used to prompt the
 * model and NOT trusted; it is compared, so that a mismatch is a recorded signal
 * about the client rather than a silent pass. Consumption is a compare-and-set on
 * `status='active'`, so two submissions cannot both satisfy one pose.
 */
export async function consumePoseChallenge(
  userId: string,
  challengeToken: string,
  claim: string | undefined
): Promise<PoseOutcome> {
  const [row] = await db
    .select({
      id: verificationChallenges.id,
      userId: verificationChallenges.userId,
      gesture: verificationChallenges.gesture,
      status: verificationChallenges.status,
      expiresAt: verificationChallenges.expiresAt,
    })
    .from(verificationChallenges)
    .where(eq(verificationChallenges.challengeToken, challengeToken))
    .limit(1);

  if (!row) {
    return { state: "absent", detail: "no server pose for this token" };
  }
  if (String(row.userId) !== String(userId)) {
    /* Same answer a mismatch gives, on purpose: an attacker probing whether someone
       else holds a live challenge learns nothing distinguishable. */
    return { state: "mismatch", detail: "pose belongs to a different member" };
  }
  if (row.status === "consumed") {
    return { state: "mismatch", detail: "pose already used" };
  }
  if (row.status === "expired") {
    return { state: "expired", detail: "pose expired" };
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await db
      .update(verificationChallenges)
      .set({ status: "expired" })
      .where(
        and(
          eq(verificationChallenges.id, row.id),
          eq(verificationChallenges.status, "active")
        )
      );
    return { state: "expired", detail: "pose issued too long ago" };
  }

  const [consumed] = await db
    .update(verificationChallenges)
    .set({ status: "consumed" })
    .where(
      and(
        eq(verificationChallenges.id, row.id),
        eq(verificationChallenges.status, "active")
      )
    )
    .returning({ id: verificationChallenges.id });

  if (!consumed) return { state: "mismatch", detail: "lost the consume race" };

  const label = row.gesture;
  if (typeof claim === "string" && claim.trim() !== "" && claim.trim() !== label) {
    /* The member claims a different pose than the one we served. The engine will be
       shown OUR pose, so this becomes visible as a failed match, not a pass. */
    return { state: "mismatch", label, detail: `client claimed "${claim.slice(0, 60)}"` };
  }

  return { state: "verified", label, detail: "server-assigned pose consumed once" };
}

