import {
  POSES,
  POSE_TTL_SECONDS,
  poseIdFor,
  type Pose,
  type PoseRow,
  type PoseState,
} from "@/lib/pose-pool";

/**
 * The pose state machine, with NO database import, so the offline harness can execute
 * it rather than pattern-match its source. `pose-challenge.ts` supplies the production
 * Drizzle adapter and re-exports everything here, so there is still one import path for
 * callers. This split exists because the properties that matter are ORDERING properties
 * (look up before expiring, compare-and-set rather than read-then-write) and a test that
 * only reads text cannot see order — two such bugs shipped in the first draft.
 */
export interface PoseStore {
  findActiveByToken(token: string): Promise<PoseRow | null>;
  findByToken(token: string): Promise<PoseRow | null>;
  latestPoseId(userId: string): Promise<string | null>;
  expireOtherActive(userId: string, keepToken: string): Promise<void>;
  insert(row: {
    userId: string;
    poseId: string;
    gesture: string;
    challengeToken: string;
    demo: string;
    ttlSeconds: number;
  }): Promise<void>;
  /** Compare-and-set. Returns false if the row was no longer `active`. */
  consume(id: string): Promise<boolean>;
  markExpired(id: string): Promise<void>;
}

export interface AssignedPose {
  pose: Pose;
  poseId: string;
  expiresIn: number;
}

/**
 * Issue the pose for one liveness token. Idempotent per token: an honest client that
 * re-opens the camera sees the SAME pose again rather than being re-rolled, which
 * would otherwise leave it holding a prompt nothing will accept.
 */
export async function assignPose(
  userId: string,
  challengeToken: string,
  store: PoseStore,
  pick: (pool: readonly Pose[]) => Pose = defaultPick,
  now: () => number = Date.now
): Promise<AssignedPose> {
  const existing = await store.findActiveByToken(challengeToken);
  /* An expired pose must NOT be re-served: the row is kept for the audit trail, so the
     guard below is what lets a genuinely late re-entry roll a fresh pose. */
  if (existing && !(existing.expiresAt && existing.expiresAt.getTime() <= now())) {
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
  const last = await store.latestPoseId(userId);
  const candidates = POSES.filter((p) => poseIdFor(p.label) !== last);
  const pool = candidates.length > 0 ? candidates : [...POSES];
  const pose = pick(pool) ?? POSES[0];

  /* Hygiene, AFTER the idempotent lookup above: a member who retries would otherwise
     accumulate one `active` row per aborted attempt forever, because re-issuing expires
     the liveness token but not the pose. Their own row must be excluded — expiring it
     first would re-roll the pose on every re-entry to the camera step. */
  await store.expireOtherActive(userId, challengeToken);

  await store.insert({
    userId,
    poseId: poseIdFor(pose.label),
    gesture: pose.label,
    challengeToken,
    demo: pose.demo,
    ttlSeconds: POSE_TTL_SECONDS,
  });

  return { pose, poseId: poseIdFor(pose.label), expiresIn: POSE_TTL_SECONDS };
}

function defaultPick(pool: readonly Pose[]): Pose {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0]!;
}

export interface PoseOutcome {
  state: PoseState;
  /** The pose the SERVER asked for. Only present when the row was found. */
  label?: string;
  detail: string;
}

/**
 * Consume the pose bound to a liveness token.
 *
 * `claim` is the pose the client says it performed. It is NOT used to prompt the model
 * and NOT trusted; it is compared, so a mismatch becomes a recorded signal about the
 * client rather than a silent pass.
 */
export async function consumePose(
  userId: string,
  challengeToken: string,
  claim: string | undefined,
  store: PoseStore,
  now: () => number = Date.now
): Promise<PoseOutcome> {
  if (!challengeToken) return { state: "absent", detail: "no liveness token presented" };

  const row = await store.findByToken(challengeToken);
  if (!row) return { state: "absent", detail: "no server pose for this token" };

  if (String(row.userId) !== String(userId)) {
    /* Deliberately the same shape a mismatch gives: a caller must not learn whether
       someone else holds a live challenge. Logged server-side with the real reason. */
    return { state: "mismatch", detail: "pose belongs to a different member" };
  }
  if (row.status === "consumed") return { state: "mismatch", detail: "pose already used" };
  if (row.status === "expired") return { state: "expired", detail: "pose expired" };
  if (row.expiresAt && row.expiresAt.getTime() <= now()) {
    await store.markExpired(row.id);
    return { state: "expired", detail: "pose issued too long ago" };
  }

  const won = await store.consume(row.id);
  if (!won) return { state: "mismatch", detail: "lost the consume race" };

  const label = row.gesture;
  if (typeof claim === "string" && claim.trim() !== "" && claim.trim() !== label) {
    /* The member claims a different pose than the one we served. The engine is shown
       OUR pose, so this surfaces as a failed match rather than a pass. */
    return { state: "mismatch", label, detail: `client claimed "${claim.slice(0, 60)}"` };
  }

  return { state: "verified", label, detail: "server-assigned pose consumed once" };
}

