import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { profilePhotos, userProfiles, verificationRequests } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Freeborn identity verification engine (Bumble-style, AI-run).
 *
 * Stage 1 — POSE CHECK: the live selfie must show exactly one clear face
 * performing the prompted pose, in good lighting.
 * Stage 2 — FACE MATCH: only if the pose passes, the face is compared
 * against the member's uploaded profile photos.
 * Pass both → teal seal. Fail either → rejected with a reason + fresh pose
 * on retry. Every verdict is stored in verification_requests.
 */

const MODEL = "gemini-3.6-flash-high";
const BASE = (process.env.ANTIGRAVITY_BASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.ANTIGRAVITY_FREE_API_KEY ?? "";

/* --- In-memory rate limiting ------------------------------------------------ */

const hits = new Map<string, number[]>();
function rateLimited(accountId: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(accountId) ?? []).filter((t) => now - t < windowMs);
  hits.set(accountId, recent);
  if (recent.length >= max) return true;
  recent.push(now);
  return false;
}

/* --- Gemini call with retry (the free proxy drops images sometimes) -------- */

const IMAGE_DROPPED_RE =
  /no (reference )?image|please upload|cannot see|can't see|image (was )?(not )?(provided|missing|available)|provide (an? )?image/i;

async function askGemini(
  content: Array<Record<string, unknown>>
): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content }],
          max_tokens: 220,
          temperature: 0,
        }),
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("empty");
      if (IMAGE_DROPPED_RE.test(text)) throw new Error("image-dropped");
      return text;
    } catch {
      await new Promise((r) => setTimeout(r, 700));
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function parseVerdict<T>(text: string | null): T | null {
  if (!text) return null;
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

type PoseVerdict = {
  faceCount?: number;
  observedPose?: string;
  lightingOk?: boolean;
  matchesAsked?: boolean;
};
type FaceDesc = {
  gender?: string;
  hairColor?: string;
  hairLength?: string;
  glasses?: boolean;
  facialHair?: boolean;
  ageBand?: string;
};

const DESC_PROMPT =
  "Describe the person in this photo for an identity system. Reply with JSON only, no prose: " +
  '{"gender":"female|male|unclear","hairColor":"blonde|brown|black|red|gray|bald|other",' +
  '"hairLength":"short|medium|long|bald","glasses":true|false,"facialHair":true|false,' +
  '"ageBand":"teens|20s|30s|40s|50s|60plus"}';

/**
 * Rules-engine comparison of two face descriptors. Hard conflicts (gender,
 * facial hair, hair color) reject; soft mismatches lower the score;
 * middle scores go to the human-style review queue instead of guessing.
 */
function compareDesc(a: FaceDesc | null, b: FaceDesc | null) {
  if (!a || !b) return { score: -1, conflicts: [] as string[] };
  let score = 0;
  const conflicts: string[] = [];

  const neutral = (v?: string) => !v || v === "unclear" || v === "other";

  if (neutral(a.gender) || neutral(b.gender)) score += 0.5;
  else if (a.gender === b.gender) score += 1;
  else conflicts.push("gender presentation differs");

  if (neutral(a.hairColor) || neutral(b.hairColor)) score += 0.5;
  else if (a.hairColor === b.hairColor) score += 1;
  else conflicts.push("hair color differs");

  if (a.hairLength && b.hairLength && a.hairLength === b.hairLength) score += 1;
  if (a.glasses === b.glasses) score += 1;
  if (a.facialHair === b.facialHair) score += 1;
  else conflicts.push("facial hair differs");
  if (a.ageBand && b.ageBand && a.ageBand === b.ageBand) score += 1;

  return { score, conflicts };
}

/** Pull up to two profile photos as data URLs for the face-match stage. */
async function collectProfilePhotos(memberId: string, origin: string) {
  const rows = await db
    .select()
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, memberId))
    .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
    .limit(2);

  const out: string[] = [];
  for (const row of rows) {
    const path = row.storagePath;
    const url = /^https?:\/\//.test(path) ? path : `${origin}${path}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 4 * 1024 * 1024) continue;
      const mime = res.headers.get("content-type") ?? "image/jpeg";
      out.push(`data:${mime};base64,${buf.toString("base64")}`);
    } catch {
      /* skip unreachable photo */
    }
  }
  return out;
}

export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { selfie, poseLabel } = (body ?? {}) as { selfie?: string; poseLabel?: string };
  if (!selfie || !/^data:image\/(jpeg|png|webp);base64,/.test(selfie)) {
    return Response.json({ error: "A live selfie is required." }, { status: 400 });
  }
  if (!poseLabel || poseLabel.length > 120) {
    return Response.json({ error: "A pose prompt is required." }, { status: 400 });
  }
  if (rateLimited(member.id, 6, 60 * 60 * 1000)) {
    return Response.json(
      { error: "Too many verification attempts — try again in an hour." },
      { status: 429 }
    );
  }

  if (!BASE || !KEY) {
    // Engine not configured → fall back to the manual review queue.
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "pending",
      method: "selfie",
      selfieMedia: selfie,
    });
    return Response.json({ status: "pending-fallback" });
  }

  /* ---- Stage 1: pose check (observe-first, suggestion-proof) --------------
     The model describes what it SEES before being told what was asked, which
     prevents it from hallucinating the requested pose into the answer. ------ */

  const poseText = await askGemini([
    {
      type: "text",
      text:
        "Look at the attached selfie. FIRST, in exactly six words, describe the hand " +
        "gesture the person is actually performing — do not assume anything. THEN reply " +
        "with JSON only, no prose: " +
        '{"observedPose": "<your six-word description>", "faceCount": <number of faces visible>, ' +
        '"lightingOk": <true if the face is bright and unobstructed>, ' +
        `"matchesAsked": <true ONLY if the observed gesture is essentially the same as this asked pose: '${poseLabel}'>}`,
    },
    { type: "image_url", image_url: { url: selfie } },
  ]);
  const pose = parseVerdict<PoseVerdict>(poseText);

  const posePass =
    pose != null &&
    pose.faceCount === 1 &&
    pose.lightingOk !== false &&
    pose.matchesAsked === true;

  if (!posePass) {
    const reason =
      pose == null
        ? "The verification service couldn't read the photo — try again."
        : pose.faceCount !== 1
          ? "Show exactly one face, fully visible."
          : pose.lightingOk === false
            ? "Too dark or obstructed — brighten up and retry."
            : `We saw "${pose.observedPose ?? "a different pose"}" — that doesn't match yet.`;
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "rejected",
      method: "ai_pose_face",
      selfieMedia: selfie,
      rejectReason: `pose: ${reason}`,
      reviewedAt: new Date(),
    });
    return Response.json({ status: "rejected", stage: "pose", reason, verdict: pose });
  }

  /* ---- Stage 2: face match against profile photos ---------------------------
     Single-image descriptor calls (reliable) + a deterministic rules engine.
     Clear match → approve. Clear conflict → reject. Anything in between goes
     to the review queue — the engine never guesses a badge into existence. -- */

  const origin = new URL(request.url).origin;
  const photos = await collectProfilePhotos(member.id, origin);
  if (photos.length === 0) {
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "rejected",
      method: "ai_pose_face",
      selfieMedia: selfie,
      rejectReason: "face: no profile photos to compare",
      reviewedAt: new Date(),
    });
    return Response.json({
      status: "rejected",
      stage: "photos-missing",
      reason: "Add at least one profile photo first — your selfie is compared against it.",
    });
  }

  const selfieDesc = parseVerdict<FaceDesc>(
    await askGemini([
      { type: "text", text: DESC_PROMPT },
      { type: "image_url", image_url: { url: selfie } },
    ])
  );
  const photoDesc = parseVerdict<FaceDesc>(
    await askGemini([
      { type: "text", text: DESC_PROMPT },
      { type: "image_url", image_url: { url: photos[0] } },
    ])
  );

  const { score, conflicts } = compareDesc(selfieDesc, photoDesc);

  if (score < 0) {
    // The checker couldn't read one of the images — don't guess: review queue.
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "pending",
      method: "ai_pose_face",
      selfieMedia: selfie,
      rejectReason: "face: unreadable image, sent to review",
    });
    return Response.json({ status: "review", stage: "face" });
  }

  if (conflicts.length > 0) {
    const reason = `Your selfie doesn't match your profile photo — ${conflicts.join("; ")}.`;
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "rejected",
      method: "ai_pose_face",
      selfieMedia: selfie,
      rejectReason: `face: ${conflicts.join("; ")}`,
      reviewedAt: new Date(),
    });
    return Response.json({ status: "rejected", stage: "face", reason });
  }

  if (score < 4) {
    // Soft mismatches only — ambiguous, so it goes to human-style review.
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "pending",
      method: "ai_pose_face",
      selfieMedia: selfie,
      rejectReason: `face: ambiguous match score ${score.toFixed(1)}, sent to review`,
    });
    return Response.json({ status: "review", stage: "face" });
  }

  /* ---- Pose passed AND face clearly matches → seal granted ------------------ */

  await db.insert(verificationRequests).values({
    accountId: member.id,
    status: "approved",
    method: "ai_pose_face",
    selfieMedia: selfie,
    reviewedAt: new Date(),
  });
  await db
    .update(userProfiles)
    .set({ isVerified: true })
    .where(eq(userProfiles.id, member.id));

  return Response.json({ status: "approved", pose: pose?.observedPose ?? "matched", score });
}
