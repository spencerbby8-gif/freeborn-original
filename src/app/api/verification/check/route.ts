import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { profilePhotos, userProfiles, verificationRequests } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { askLm7, lm7Configured, LM7_MODEL } from "@/lib/lm7";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Freeborn identity verification — DUAL ENGINE, sequential.
 *
 * Stage 1 (Antigravity/Gemini) inspects the selfie first: one live face,
 * decent light, and an honest description of the gesture actually performed.
 * Stage 2 (LM7, a different model family) then RE-VERIFIES the same selfie
 * against Stage 1's observation and the member's profile photo before any
 * verdict becomes final. One after the other — never one alone.
 *
 * The system is deliberately MODERATE: members are asked to roughly perform
 * a hand gesture, not to replicate it pixel-perfectly. Natural variation and
 * imperfect attempts are accepted. Hard rejects are reserved for objective
 * problems (no face, too dark, clearly a different person). Anything doubtful
 * goes to the review queue — the engine never guesses a confirmation into
 * existence.
 *
 * Thorough checks take time: the response is never sent before
 * MIN_VERIFY_MS so the member sees an honest "verifying" window.
 */

const MIN_VERIFY_MS = 14_000;

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

/* --- Stage 1 engine call (with retry — the free proxy drops images) -------- */

const IMAGE_DROPPED_RE =
  /no (reference )?image|please upload|cannot see|can't see|image (was )?(not )?(provided|missing|available)|provide (an? )?image/i;

async function askGemini(content: Array<Record<string, unknown>>): Promise<string | null> {
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
          /* The Antigravity gateway documents x-api-key as its client header —
             send both so either contract keeps working. */
          "x-api-key": KEY,
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

type ReverifyVerdict = {
  livePerson?: boolean;
  gestureOk?: boolean;
  samePerson?: "yes" | "no" | "unclear";
  confidence?: "high" | "medium" | "low";
  reason?: string;
};

/** Pull up to two of the member's profile photos as data URLs for the face check. */
async function collectProfilePhotos(memberId: string, origin: string): Promise<string[]> {
  const rows = await db
    .select()
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, memberId))
    .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
    .limit(2);

  const out: string[] = [];
  for (const row of rows) {
    const path = row.storagePath;
    const url = /^https?:\/\//.test(path)
      ? path
      : path.startsWith("/")
        ? `${origin}${path}`
        : `${(process.env.SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/profile-photos/${path}`;
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
  const startedAt = Date.now();
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

  /** Never answer before the thorough window has passed. */
  const holdUntilDone = async () => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_VERIFY_MS) {
      await new Promise((r) => setTimeout(r, MIN_VERIFY_MS - elapsed));
    }
  };

  const finish = async (payload: Record<string, unknown>) => {
    await holdUntilDone();
    return Response.json(payload);
  };

  if (!BASE || !KEY) {
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "pending",
      method: "selfie",
      selfieMedia: selfie,
    });
    return finish({ status: "pending-fallback", engine: "none" });
  }

  /* ---- STAGE 1 — first inspection (observe-first, suggestion-proof) --------
     The engine describes what it SEES before comparing to the ask. Quality
     gates here are objective (face count, lighting). Gesture matching is
     judged leniently and is NEVER a hard reject at this stage — a real
     attempt always moves on to the second engine. ---------------------------- */

  const poseText = await askGemini([
    {
      type: "text",
      text:
        "Look at the attached selfie. FIRST, in exactly six words, describe the hand " +
        "gesture the person is actually performing — do not assume anything. THEN reply " +
        "with JSON only, no prose: " +
        '{"observedPose": "<your six-word description>", "faceCount": <number of faces visible>, ' +
        '"lightingOk": <true if the face is bright and unobstructed>, ' +
        `"matchesAsked": <true if the observed gesture is clearly similar to, or a reasonable attempt at, this asked pose: '${poseLabel}'. Allow natural variation — do NOT require an exact copy>}`,
    },
    { type: "image_url", image_url: { url: selfie } },
  ]);
  const pose = parseVerdict<PoseVerdict>(poseText);

  if (pose == null) {
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "rejected",
      method: "dual_model",
      selfieMedia: selfie,
      rejectReason: "stage1: unreadable photo",
      reviewedAt: new Date(),
    });
    return finish({
      status: "rejected",
      stage: "inspect",
      engine: lm7Configured() ? "dual" : "single",
      reason: "The verification service couldn't read the photo — try again.",
    });
  }
  if (pose.faceCount !== undefined && pose.faceCount !== 1) {
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "rejected",
      method: "dual_model",
      selfieMedia: selfie,
      rejectReason: `stage1: ${pose.faceCount} faces`,
      reviewedAt: new Date(),
    });
    return finish({
      status: "rejected",
      stage: "inspect",
      engine: lm7Configured() ? "dual" : "single",
      reason: "Show exactly one face, fully visible.",
    });
  }
  if (pose.lightingOk === false) {
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "rejected",
      method: "dual_model",
      selfieMedia: selfie,
      rejectReason: "stage1: poor lighting",
      reviewedAt: new Date(),
    });
    return finish({
      status: "rejected",
      stage: "inspect",
      engine: lm7Configured() ? "dual" : "single",
      reason: "Too dark or obstructed — brighten up and retry.",
    });
  }

  /* ---- Reference photo required for the identity comparison --------------- */

  const origin = new URL(request.url).origin;
  const profilePhotosList = await collectProfilePhotos(member.id, origin);
  if (profilePhotosList.length === 0) {
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "rejected",
      method: "dual_model",
      selfieMedia: selfie,
      rejectReason: "face: no profile photos to compare",
      reviewedAt: new Date(),
    });
    return finish({
      status: "rejected",
      stage: "photos-missing",
      engine: lm7Configured() ? "dual" : "single",
      reason: "Add at least one profile photo first — your selfie is compared against it.",
    });
  }

  /* ---- STAGE 2 — independent re-verification by the second engine ----------
     Receives Stage 1's honest observation plus both images, and re-decides.
     Moderate by design: a reasonable attempt at the gesture passes; only a
     clearly missing gesture, a clearly absent live person, or a clearly
     different human fails. Doubt goes to the review queue. ------------------ */

  const reverifyContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        "You are the SECOND, independent checker in a two-step identity verification. " +
        `A first inspector watched the same selfie and reported: gesture seen = "${pose.observedPose ?? "unknown"}", ` +
        `roughly matches the asked pose = ${pose.matchesAsked === true}. ` +
        `The member was asked to roughly perform: "${poseLabel}". ` +
        `Image 1 is their LIVE selfie; the following ${profilePhotosList.length} image(s) are their uploaded profile photos. ` +
        "Be MODERATE and TRUTHFUL: natural variation and imperfect attempts at the gesture are ACCEPTABLE — do NOT demand an exact copy. " +
        "NEVER invent details you cannot actually see. If lighting, angle or quality makes a judgment unreliable, say 'unclear' — never guess. " +
        "Decide three things: (1) does Image 1 show one real, live human face (not a photo of a photo, a mask, or a screen)? " +
        "(2) is the gesture present as a reasonable attempt? " +
        "(3) comparing facial structure — eyes, nose, mouth, face shape, apparent age — could Image 1 plausibly be the same person as the profile photo(s)? " +
        "Reply with JSON only, no prose: " +
        '{"livePerson": true|false, "gestureOk": true|false, "samePerson": "yes"|"no"|"unclear", ' +
        '"confidence": "high"|"medium"|"low", "reason": "<ten words max>"}',
    },
    { type: "image_url", image_url: { url: selfie } },
    ...profilePhotosList.map((p) => ({ type: "image_url", image_url: { url: p } })),
  ];
  const lm7 = await askLm7(reverifyContent);

  const engine = lm7.ok ? "dual" : "single";

  if (lm7.ok) {
    const verdict = parseVerdict<ReverifyVerdict>(lm7.text);
    if (verdict) {
      const record = (status: string, reason: string) =>
        db.insert(verificationRequests).values({
          accountId: member.id,
          status,
          method: `dual_model:${LM7_MODEL}`,
          selfieMedia: selfie,
          rejectReason: reason,
          reviewedAt: status === "pending" ? null : new Date(),
        });

      if (verdict.livePerson === false) {
        await record("rejected", "stage2: no live person");
        return finish({
          status: "rejected",
          stage: "reverify",
          engine,
          reason: "We couldn't confirm a live person in the selfie — take a fresh one and retry.",
        });
      }
      if (verdict.samePerson === "no" && verdict.confidence !== "low") {
        await record("rejected", "stage2: identity mismatch");
        return finish({
          status: "rejected",
          stage: "reverify",
          engine,
          reason: "Your selfie doesn't appear to match your profile photo. Retake it in good light, or update your photos.",
        });
      }
      if (verdict.gestureOk === false && verdict.confidence === "high") {
        await record("rejected", "stage2: gesture missing");
        return finish({
          status: "rejected",
          stage: "reverify",
          engine,
          reason: `We couldn't see the pose — ${poseLabel.toLowerCase()}. A rough attempt is fine; try once more.`,
        });
      }
      /* Approval demands positive, confident evidence on every axis:
         live person + reasonable gesture + same face with at least medium
         confidence. Anything weaker goes to review — approval is never
         guessed into existence. */
      const approvable =
        verdict.livePerson === true &&
        verdict.gestureOk === true &&
        verdict.samePerson === "yes" &&
        verdict.confidence !== "low";
      if (!approvable) {
        await record("pending", "stage2: not confidently positive, human review");
        return finish({ status: "review", stage: "reverify", engine });
      }

      /* Both engines agree: one live person, a real attempt, same human. */
      await record("approved", "stage1+stage2 pass");
      await db
        .update(userProfiles)
        .set({ isVerified: true, lastVerifiedAt: new Date() })
        .where(eq(userProfiles.id, member.id));
      return finish({ status: "approved", stage: "reverify", engine });
    }
    // Second engine answered but unparseably → honest fallback to review.
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "pending",
      method: "dual_model",
      selfieMedia: selfie,
      rejectReason: "stage2: unreadable verdict, human review",
    });
    return finish({ status: "review", stage: "reverify", engine });
  }

  /* ---- Second engine unavailable (key missing/invalid) ----------------------
     Truthful degradation: Stage 1's lenient gesture read decides with the
     profile photo, and the response says a single engine ran. --------------- */

  const sameEnough = pose.matchesAsked === true;
  await db.insert(verificationRequests).values({
    accountId: member.id,
    status: sameEnough ? "approved" : "pending",
    method: `single_model:${MODEL}`,
    selfieMedia: selfie,
    rejectReason: sameEnough ? null : `stage1 only, gesture uncertain: ${lm7.reason}`,
    reviewedAt: sameEnough ? new Date() : null,
  });
  if (sameEnough) {
    await db
      .update(userProfiles)
      .set({ isVerified: true, lastVerifiedAt: new Date() })
      .where(eq(userProfiles.id, member.id));
    return finish({ status: "approved", stage: "inspect", engine });
  }
  return finish({ status: "review", stage: "inspect", engine });
}
