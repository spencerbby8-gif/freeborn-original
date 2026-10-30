import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { profilePhotos, securityEvents, userProfiles, verificationRequests } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { deriveAnchor } from "@/lib/photo-hash";
import { findSharedAnchor, openCase, recomputeTrust, upsertFingerprint } from "@/lib/identity-resolve";
import { clientIp } from "@/lib/ip-reputation";
import {
  evaluateIntegrity,
  persistableDetail,
  type BrowserObservations,
} from "@/lib/browser-integrity";
import { ENGINE_BUDGET_MS } from "@/lib/engine-budget";
import { askLm7, lm7Configured, LM7_MODEL } from "@/lib/lm7";
import { consumeLivenessChallenge, freshnessTag } from "@/lib/liveness-challenge";
import { consumePoseChallenge, poseTag, type PoseOutcome } from "@/lib/pose-challenge";

/* afterVerificationSuccess — post-approval identity bookkeeping.
   Writes the member's photo-set anchor, checks whether another account holds the same
   anchor (the non-biometric analogue of "one face, many accounts"), and recomputes the
   trust score so a successful verification actually MOVES the number. Never throws: a
   verification that the engines approved must not be failed by this layer. */
async function afterVerificationSuccess(
  userId: string,
  decision: "match" | "mismatch" | "unclear",
  confidence: "high" | "medium" | "low"
): Promise<void> {
  try {
    const photos = await db
      .select({ d: profilePhotos.phashD, a: profilePhotos.phashA })
      .from(profilePhotos)
      .where(eq(profilePhotos.userId, userId));
    const usable = photos
      .filter((r) => typeof r.d === "string")
      .map((r) => ({ d: r.d as string, a: typeof r.a === "string" ? r.a : undefined }));
    const anchor = await deriveAnchor(usable);
    if (anchor) {
      await upsertFingerprint({
        userId,
        source: "verification",
        hashes: usable.length ? { d: usable[0].d, a: usable[0].a ?? "", bytes: "", width: 0, height: 0 } : null,
        anchor,
        engine: { decision, confidence },
      });
      const shared = await findSharedAnchor(userId, anchor);
      if (shared.users.length) {
        await openCase({
          userId,
          email: null,
          input: {
            code: "identity_anchor_shared",
            violatedClass: "violation_identity",
            detail:
              "Verified anchor is also held by " +
              shared.users.slice(0, 5).join(", ") +
              " (" + shared.users.length + " accounts, " + shared.suspended + " suspended).",
            notes:
              "Your photos match another Freeborn account. If it is yours, say so in the appeal; if it is not, this is why the profile is under review.",
            trustDelta: -28,
            openedBy: "identity_engine",
          },
        });
      }
    }
    await recomputeTrust(userId);
  } catch {
    /* never fail a verification because the dedup layer had a bad day */
  }
}

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

/* Audit finding F-E (2026-10-28): this route was the one engine path with no
 * budget. `askGemini` retried 3 times with a 20s abort each, and the route also
 * holds the response open for MIN_VERIFY_MS — 60s of engine waiting plus a 14s
 * UX hold inside a function capped at maxDuration=120. A platform cancellation
 * mid-hold loses the verdict the member waited for, so the attempt timeout is now
 * derived from the same ENGINE_BUDGET_MS the rest of the product uses, and the
 * hold runs concurrently with the engine call rather than after it. */
const ATTEMPT_TIMEOUT_MS = Math.max(3_000, Math.floor((ENGINE_BUDGET_MS - 1_500) / 3));
const MAX_ATTEMPTS = 2;

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
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
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
      /* Back off for at most the time the remaining budget allows. */
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
  const { selfie, poseLabel, liveness, livenessToken: bodyLivenessToken, browser } = (body ?? {}) as {
    selfie?: string;
    poseLabel?: string;
    liveness?: { gate?: string; blink?: boolean; singleFace?: boolean };
    livenessToken?: string;
    /** What the page was asked to report about itself. Optional, and its absence is
     *  deliberately NOT suspicious — see the note above `evaluateIntegrity`. */
    browser?: BrowserObservations;
  };

  /* ---- BROWSER INTEGRITY — an observation, never a verdict -------------------
     Bumble/Hinge/Tinder all run a client-side consistency check; what their shipped
     bundles do (canvas + WebGL + fonts + plugins + a persisted device id) is a
     fingerprint, and Freeborn will not copy that part. Here the client reports four
     coarse facts and the server compares them against the headers its OWN edge
     received, so the value comes from the disagreement between two views of the same
     request rather than from anything identifying.

     Three properties this block exists to preserve, each pinned by a test:
       - advisory only. No branch below reads `integrity` to decide anything, so these
         signals cannot ban, cannot un-verify, and cannot deny a badge;
       - recorded for every attempt, including the clean ones (`detail='none'`), so a
         reviewer can see the absence of contradictions instead of guessing at it;
       - only the NAMES of the rules that fired are persisted — never the timezone,
         language, platform or the observation object itself. */
  const integrity = evaluateIntegrity(browser ?? {}, {
    acceptLanguage: request.headers.get("accept-language"),
    userAgent: request.headers.get("user-agent"),
    secChUaPlatform: request.headers.get("sec-ch-ua-platform"),
    secChUa: request.headers.get("sec-ch-ua"),
  });
  /* Failures here are invisible to the member on purpose: a moderation-adjacent
     bookkeeping write must never be the reason a legitimate verification 500s. */
  await db
    .insert(securityEvents)
    .values({
      email: member.email.toLowerCase(),
      ip: clientIp(request),
      kind: "browser_integrity",
      detail: persistableDetail(integrity),
    })
    .catch(() => undefined);

  /* POSE ENFORCEMENT MODE — see the gate in stage 2. Default `review`: an attempt whose
     pose we cannot prove we served is recorded and held for a human, and nothing else.
     `legacy` is an operator-set escape hatch for a pose-store outage ONLY. */
  const poseMode = process.env.FREEBORN_POSE_ENFORCEMENT === "legacy" ? "legacy" : "review";

  if (!selfie || !/^data:image\/(jpeg|png|webp);base64,/.test(selfie)) {

    return Response.json({ error: "A live selfie is required." }, { status: 400 });
  }
  if (!poseLabel || poseLabel.length > 120) {
    return Response.json({ error: "A pose prompt is required." }, { status: 400 });
  }
  /* On-device liveness evidence: when the face gate ran client-side, a
     captured blink is required. The request is client-controlled, so this
     is evidence layered UNDER the dual-engine review — never a substitute. */
  if (liveness?.gate === "ok" && liveness.blink !== true) {
    return Response.json(
      { error: "Blink challenge not completed. Blink once when prompted, then take the selfie." },
      { status: 400 }
    );
  }
  const blinkTag = liveness?.blink === true ? "+blink" : "";

  /* FRESHNESS GATE. `blink` and `gate` are client-asserted and always have been; the
     only thing we can verify server-side is that this attempt was initiated moments ago
     with a token we issued and that it is being presented for the first time. Consumed
     here, once, before any engine call, so a replayed submission cannot burn a second
     engine budget either. */
  const freshness = await consumeLivenessChallenge(member.email, bodyLivenessToken).catch(
    () => ({ state: "missing" as const, detail: "challenge lookup failed" })
  );

  /* POSE PROVENANCE. `poseLabel` used to be the only source of the pose, and it came
     from this request body, so the "prove you are live" step verified a pose the
     submitter chose. Here we look up the pose WE served against that same token,
     consume it once, and use the SERVER's wording from here down. Note the deliberate
     name: `pose` below is the engine's verdict object, `poseChallenge` is ours.
     Side effect that matters: `askedPose` is no longer attacker-controlled text, which
     also closes the prompt-injection path created by interpolating `poseLabel` into a
     single-quoted prompt literal. */
  const poseChallenge = await consumePoseChallenge(
    member.id,
    typeof bodyLivenessToken === "string" ? bodyLivenessToken : "",
    poseLabel
  ).catch((): PoseOutcome => ({ state: "unavailable", detail: "pose lookup failed" }));
  const askedPose =
    poseChallenge.label ??
    (typeof poseLabel === "string" ? poseLabel.replace(/['"\`\n\r]/g, " ").slice(0, 120) : "");
  const poseServed = poseChallenge.state === "verified";

  /* THE TWO PROOFS, computed once for both engine chains so a decision cannot depend on
     which branch happened to define them. `freshnessProven`: we issued this token to this
     member moments ago and it had not been used. `poseProven`: the pose being graded is the
     one WE served. `challengeProven` is both together — what an approval needs unless the
     bounded legacy hatch below is deliberately open. */
  const freshnessProven = freshness.state === "verified";
  const poseProven = poseMode === "legacy" ? true : poseServed;
  const challengeProven = freshnessProven && poseServed;
  if (rateLimited(member.id, 6, 60 * 60 * 1000)) {
    return Response.json(
      { error: "Too many verification attempts. Please try again in an hour." },
      { status: 429 }
    );
  }

  /* Privacy Policy clause 7. Every attempt INSERTS its own row rather than
     updating the previous one, so an abandoned undecided attempt would keep its
     photograph forever. A new attempt supersedes the old one, so the superseded
     images are released here. That bounds what we hold to at most one undecided
     selfie per member: the one belonging to the attempt now in flight.

     This matters more than it looks, because the engine-unavailable fallback
     below records "pending" and is the path every request currently takes.
     Without this statement each retry added another stored face, which is how
     eight requests came to hold 707 kB of selfies with no purge anywhere in the
     codebase. The verdicts and reasons on those rows are left untouched. */
  await db
    .update(verificationRequests)
    .set({ selfieMedia: null })
    .where(
      and(
        eq(verificationRequests.accountId, member.id),
        eq(verificationRequests.status, "pending")
      )
    );

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
        `"matchesAsked": <true if the observed gesture is clearly similar to, or a reasonable attempt at, this asked pose: '${askedPose}'. Allow natural variation — do NOT require an exact copy>}`,
    },
    { type: "image_url", image_url: { url: selfie } },
  ]);
  const pose = parseVerdict<PoseVerdict>(poseText);

  if (pose == null) {
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "rejected",
      method: `dual_model${freshnessTag(freshness.state)}${poseTag(poseChallenge.state)}`,
      /* Privacy Policy clause 7. A rejected request's selfie has no further use,
         so it is never written to the database in the first place: appeals do not
         read it, re-verification creates a fresh request with a fresh image, and
         only an APPROVED selfie is read back later (identity-match.ts re-reads it
         to confirm a newly uploaded photograph is still the same person). Storing
         a face that has already been refused is biometric data with no purpose. */
      selfieMedia: null,
      rejectReason: "stage1: unreadable photo",
      reviewedAt: new Date(),
    });
    return finish({
      status: "rejected",
      stage: "inspect",
      engine: lm7Configured() ? "dual" : "single",
      reason: "The verification service couldn't read the photo. Please try again.",
    });
  }
  if (pose.faceCount !== undefined && pose.faceCount !== 1) {
    await db.insert(verificationRequests).values({
      accountId: member.id,
      status: "rejected",
      method: "dual_model",
      /* Clause 7: a refused selfie is never stored. Rationale on the first
         stage-1 rejection insert above. */
      selfieMedia: null,
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
      /* Clause 7: a refused selfie is never stored. Rationale on the first
         stage-1 rejection insert above. */
      selfieMedia: null,
      rejectReason: "stage1: poor lighting",
      reviewedAt: new Date(),
    });
    return finish({
      status: "rejected",
      stage: "inspect",
      engine: lm7Configured() ? "dual" : "single",
      reason: "Too dark or obstructed. Brighten up and retry.",
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
      /* Clause 7: a refused selfie is never stored. Rationale on the first
         stage-1 rejection insert above. */
      selfieMedia: null,
      rejectReason: "face: no profile photos to compare",
      reviewedAt: new Date(),
    });
    return finish({
      status: "rejected",
      stage: "photos-missing",
      engine: lm7Configured() ? "dual" : "single",
      reason: "Add at least one profile photo first. Your selfie is compared against it.",
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
        (liveness
          ? `The member's own device ran an on-device live check during capture — blink ${
              liveness.blink === true ? "captured" : "not captured"
            }, single face ${liveness.singleFace === true ? "confirmed" : "unconfirmed"}. Treat this as supporting evidence, never proof. `
          : "") +
        `A first inspector watched the same selfie and reported: gesture seen = "${pose.observedPose ?? "unknown"}", ` +
        `roughly matches the asked pose = ${pose.matchesAsked === true}. ` +
        `The member was asked to roughly perform: "${askedPose}". ` +
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
  /* HONEST DEGRADATION. `engine:"single"` alone could not distinguish "no second engine is
     configured" (nothing to fix) from "a second engine is configured and it refused us"
     (a bad key, a disabled vision capability — a one-minute fix an operator would never
     look for, because the audit row looks like a design choice). Both the response and the
     audit row carry which one it was. */
  const degradationTag = lm7.ok ? "" : `+lm7:${lm7.reason ?? "unavailable"}`;
  const engineReason = lm7.ok ? null : (lm7.reason ?? "unavailable");
  /** Why the review is happening, for the response only — `lm7.reason` is a provider
   *  condition ("invalid-key"), not anything the member did. */
  const reviewExtras = engineReason ? { engineReason } : {};

  if (lm7.ok) {
    const verdict = parseVerdict<ReverifyVerdict>(lm7.text);
    if (verdict) {
      const record = (status: string, reason: string, methodSuffix = "") =>
        db.insert(verificationRequests).values({
          accountId: member.id,
          status,
          method: `dual_model:${LM7_MODEL}${blinkTag}${freshnessTag(freshness.state)}${poseTag(poseChallenge.state)}${methodSuffix}`,
          /* Rejections are stored without the image (see the note on the stage-1
             inserts). A PENDING request keeps it, because a human reviewer needs
             the photograph in order to make the call. */
          selfieMedia: status === "rejected" ? null : selfie,
          rejectReason: reason,
          reviewedAt: status === "pending" ? null : new Date(),
        });

      if (verdict.livePerson === false) {
        await record("rejected", "stage2: no live person");
        return finish({
          status: "rejected",
          stage: "reverify",
          engine,
          reason: "We couldn't confirm a live person in the selfie. Take a fresh one and retry.",
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
          reason: `We couldn't see the pose: ${poseLabel.toLowerCase()}. A rough attempt is fine; try once more.`,
        });
      }
      /* Approval demands positive, confident evidence on every axis:
         live person + reasonable gesture + same face with at least medium
         confidence. Anything weaker goes to review — approval is never
         guessed into existence.
         What this deliberately is NOT: server-side proof of anything. `approvable`
         is the two models' opinion, and that is the whole limit of it — a favourable
         opinion can be produced by a photo, a deepfake, or a prompt aimed at the
         grader. The proof that the attempt was initiated here, seconds ago, and
         against a pose WE served is the `freshnessProven` / `poseProven` pair below,
         and it has to be able to veto a unanimous model verdict. */
      const approvable =
        verdict.livePerson === true &&
        verdict.gestureOk === true &&
        verdict.samePerson === "yes" &&
        verdict.confidence !== "low";

      /** What the approval row will say. Kept out of the gate below so the legacy-hatch
       *  grant and the clean grant share one insert, one seal and one bookkeeping call —
       *  the difference between them must be a word in the record, not a second code path
       *  that can drift. */
      /* THE GATE IS A VETO, NOT A MODE SWITCH. Everything the operator can relax is expressed
         once, in `poseProven`; the refusal below therefore has no branch of its own, and the
         approval after it has no hatch of its own to forget.
           - freshness is NEVER waived: an absent, spent, forged or expired token means nobody
             initiated this attempt inside our own flow minutes ago, and granting anyway would turn
             "prove you are a live person" into "post a convincing body". A first version of this
             gate relaxed both halves and the e2e caught it approving a request whose token had
             never existed;
           - pose provenance may be waived only by `FREEBORN_POSE_ENFORCEMENT=legacy`, because the
             pose row is written by /api/verification/challenge BEFORE the member touches the
             camera, so a migration or pool fault there would otherwise strand every honest member
             in the review queue while both engines are working fine. */
      if (!approvable || !freshnessProven || !poseProven) {
        await record(
          "pending",
          approvable
            ? `stage2 pass, challenge unproven (freshness: ${freshness.detail}; pose: ${poseChallenge.detail}); held for human review`
            : "stage2: not confidently positive, human review",
          degradationTag
        );
        return finish({ status: "review", stage: "reverify", engine, ...reviewExtras });
      }

      /* Reaching the approval with the challenge unproven is possible in exactly one
         configuration — the hatch, open, pose unproven, freshness proven, both engines
         positive — and BOTH halves of the record have to say it. Getting this wrong once
         produced a row whose method carried "+unproven:legacy-pose" while its reason claimed a
         clean pass, i.e. an audit trail that contradicts itself about whether a control was
         bypassed. One variable now drives the prose and the marker, so they cannot disagree.
         `method like '%unproven%'` is the list of every such grant, which is the point: a
         temporary relaxation an operator can also REVOKE and re-verify afterwards. */
      const grantedUnproven = !challengeProven;
      await record(
        "approved",
        grantedUnproven
          ? "stage1+stage2 pass, badge granted by the legacy hatch"
          : "stage1+stage2 pass",
        `${degradationTag}${grantedUnproven ? "+unproven:legacy-pose" : ""}`
      );
      await db
        .update(userProfiles)
        .set({ isVerified: true, lastVerifiedAt: new Date() })
        .where(eq(userProfiles.id, member.id));
      await afterVerificationSuccess(member.id, "match", "high");
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

  /* A single-engine pass with no fresh challenge is exactly the shape a scripted client
     produces (pre-computed selfie, blink:true, no token), so it does not self-serve a
     badge any more. It is still recorded and routed to a person, never discarded. */
  const sameEnough =
    /* `pose.matchesAsked` is the ENGINE judging the pose; `poseProven` is the SERVER
       confirming this is the pose it issued, to this member, once. Both are required, so
       a client that supplies its own favourable prompt can no longer self-serve a badge
       off a single engine. Freshness is required unconditionally, exactly as in the
       two-engine path: the legacy hatch covers pose provenance and nothing else, so one
       control has one meaning whichever engine chain ran. */
    pose.matchesAsked === true && freshnessProven && poseProven;
  await db.insert(verificationRequests).values({
    accountId: member.id,
    status: sameEnough ? "approved" : "pending",
    method: `single_model:${MODEL}${blinkTag}${freshnessTag(freshness.state)}${poseTag(poseChallenge.state)}${degradationTag}${
      sameEnough && !(challengeProven && poseProven) ? "+unproven:legacy-pose" : ""
    }`,
    selfieMedia: selfie,
    rejectReason: sameEnough
      ? poseServed
        ? null
        : "stage1 pass, badge granted by the legacy hatch (pose unproven)"
      : pose.matchesAsked === true
        ? `stage1 agreed but challenge unproven (freshness: ${freshness.detail}; pose: ${poseChallenge.detail}); held for human review`
        : `stage1 only, gesture uncertain: ${lm7.reason}`,
    reviewedAt: sameEnough ? new Date() : null,
  });
  if (sameEnough) {
    await db
      .update(userProfiles)
      .set({ isVerified: true, lastVerifiedAt: new Date() })
      .where(eq(userProfiles.id, member.id));
    /* Single-engine pass is still a pass, and it is recorded as one: medium
       confidence, so a later cross-account finding on top of a single-engine
       seal weighs more than one on top of a unanimous seal. */
    await afterVerificationSuccess(member.id, "match", "medium");
    return finish({ status: "approved", stage: "inspect", engine });
  }
  /* The same honesty as the two-engine path: when a second engine exists and refused us, the
     member-facing answer stays vague but the caller — the review queue, and the operator reading
     a bug report — is told which condition produced "single". The e2e found this missing here
     after it had been added to the other branch, which is the case for running both chains. */
  return finish({ status: "review", stage: "inspect", engine, ...reviewExtras });
}
