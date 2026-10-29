/**
 * The pose LIBRARY and its pure helpers — deliberately free of any database import so
 * the offline harness can import the same list the server serves instead of grepping
 * for it. `pose-challenge.ts` owns issuance/consumption; this owns what a pose IS.
 */
export type Pose = { label: string; demo: string };

/** The live row shape, kept here so the pure modules share one definition. */
export interface PoseRow {
  id: string;
  userId: string;
  /** TEXT in the live table: the id of the human_challenges row this pose is bound to. */
  challengeToken: string;
  poseId: string;
  gesture: string;
  status: "active" | "consumed" | "expired";
  expiresAt: Date | null;
}

export type PoseState = "verified" | "mismatch" | "expired" | "absent" | "unavailable";

/**
 * The canonical pose library. `demo` points at Freeborn's own uniform illustration
 * set, so a server-chosen pose always has artwork the member can copy. The modal
 * imports this same list: client and server cannot disagree about what a pose is
 * called, which is the whole basis for comparing them.
 */
export const POSES: readonly Pose[] = [
  { label: "Show a peace sign beside your eye", demo: "/images/verify/pose-1.jpg" },
  { label: "Touch your cheek with your index finger", demo: "/images/verify/pose-2.jpg" },
  { label: "Place one hand under your chin", demo: "/images/verify/pose-3.jpg" },
  { label: "Touch your cheek and smile at the camera", demo: "/images/verify/pose-6.jpg" },
  { label: "Make an OK sign beside your chin", demo: "/images/verify/pose-7.jpg" },
  { label: "Raise an open palm beside your face", demo: "/images/verify/pose-8.jpg" },
  { label: "Give a thumbs-up next to your face", demo: "/images/verify/pose-9.jpg" },
  { label: "Place one hand over your heart", demo: "/images/verify/pose-10.jpg" },
];

/** Pose rows expire with the liveness token that carries them. */
export const POSE_TTL_SECONDS = 300;

/** Deterministic short id for a pose, stored in `pose_id` so a review can name the
 *  pose without depending on the wording surviving a copy edit. */
export function poseIdFor(label: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `p${h.toString(16).padStart(8, "0")}`;
}


/** Written into `verification_requests.method`, so the audit row says which pose path
 *  a decision came through. Never inferred from the badge alone. */
export function poseTag(state: PoseState): string {
  return state === "verified" ? "+pose" : `+pose:${state}`;
}
