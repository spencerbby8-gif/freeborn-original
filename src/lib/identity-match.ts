import { callEngine, type EngineResult, type EngineTarget } from "@/lib/engine-request";
/**
 * FREEBORN IDENTITY MATCH GATE
 *
 * The rule, built honestly: a member who already passed live verification
 * uploads a new photo. The photo is checked against their VERIFIED references
 * — the live-verified selfie captured during verification and their existing
 * profile photos — by up to two independent vision engines.
 *
 *   - confident SAME person  → the photo is added and the verification seal
 *     STAYS — no re-verification;
 *   - confident DIFFERENT person → the upload is REJECTED (409) and flagged
 *     to the moderation queue;
 *   - unclear with the engines running → the photo is added but the seal is
 *     revoked until re-verification, so doubt never keeps an unchecked photo
 *     sealed;
 *   - unclear because the engines could not run (error, rate-limited) → the
 *     photo is added and verification is left untouched. Doubt about the check
 *     is not doubt about the member.
 *     Doubt never locks a real member out of their profile.
 *
 * The FACE is the decision axis. Body/appearance is supporting context only:
 * person re-identification research shows clothing changes break any
 * appearance-based body matching, so body similarity is reported but never
 * allowed to reject on its own.
 *
 * Every decision is written to verification_audit_logs — no schema change.
 * Engine payloads are downscaled server-side (sharp) so multi-image calls
 * stay inside the gateway's request-body limit.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  chatMedia,
  profilePhotos,
  verificationAuditLogs,
  verificationRequests,
} from "@/db/schema";
import { ENGINE_BUDGET_MS, withBudget } from "@/lib/engine-budget";

const A_BASE = (process.env.ANTIGRAVITY_BASE_URL ?? "").replace(/\/$/, "");
const A_KEY = process.env.ANTIGRAVITY_FREE_API_KEY ?? "";
const V_BASE = (process.env.VOID_AI_BASE_URL ?? "").replace(/\/$/, "");
const V_KEY = process.env.VOID_AI_API_KEY ?? "";

/** Engine 1: Antigravity/Gemini — vision verified live (data URIs accepted). */
export const MATCH_MODEL_1 = "gemini-3.6-flash-medium";
/** Engine 2: VoidAI — vision currently disabled on the free plan; the call
    fails fast and the gate degrades to single-engine, honestly reported. */
export const MATCH_MODEL_2 = "gpt-4o";

export type MatchVerdict = {
  samePerson: "yes" | "no" | "unclear";
  confidence: "high" | "medium" | "low";
  faceVisible?: boolean;
  bodyConsistent?: "yes" | "no" | "unclear";
  reason?: string;
};

export type EngineReply =
  | { ok: true; verdict: MatchVerdict }
  | { ok: false; reason: string };

export type MatchDecision = "match" | "mismatch" | "unclear";

export type MatchOutcome = {
  decision: MatchDecision;
  /** "error" = engines configured but no verdict inside the budget (the
      route's exception path reports it too). */
  engine: "dual" | "single" | "none" | "error";
  confidence: "high" | "medium" | "low" | "unknown";
  verdicts: { engine1: MatchVerdict | null; engine2: MatchVerdict | null };
  engineReasons: { engine1: string | null; engine2: string | null };
  baselines: number;
  ms: number;
};

const MATCH_PROMPT =
  "You are the identity-consistency checker for a dating app. A VERIFIED member " +
  "just uploaded a NEW photo. Decide whether the new photo shows the SAME human " +
  "as their verified reference image(s).\n\n" +
  "Image 1 is the NEW photo. The remaining images are the member's verified " +
  "references: their live-verified selfie (captured during identity verification) " +
  "and/or their existing profile photos.\n\n" +
  "Compare facial structure — eyes and their spacing, nose, mouth, jawline, face " +
  "shape, apparent age. The FACE is the primary signal. Also note body/appearance " +
  "consistency (build, visible skin tone, hair) as SUPPORTING context only: " +
  "different clothing, background, lighting, camera angle, glasses, hairstyle or " +
  "weight are NORMAL and must NOT count against a match.\n\n" +
  "Be MODERATE and TRUTHFUL. Answer \"no\" only when you can point to clear " +
  "structural differences that indicate a DIFFERENT person. If glare, blur, an " +
  "extreme angle or heavy occlusion makes the judgment unreliable, answer " +
  "\"unclear\" — never guess. If Image 1 shows no visible face, set faceVisible " +
  "to false and answer \"unclear\".\n\n" +
  "Reply with JSON only, no prose: " +
  '{"samePerson":"yes|no|unclear","confidence":"high|medium|low",' +
  '"faceVisible":true|false,"bodyConsistent":"yes|no|unclear","reason":"<ten words max>"}';

/* The free proxy occasionally drops images — recognize and retry. */
const IMAGE_DROPPED_RE =
  /no (reference )?image|please upload|cannot see|can't see|image (was )?(not )?(provided|missing|available)|provide (an? )?image/i;

const VISION_DISABLED_RE = /vision[^\n]{0,60}disabled|vision_disabled/i;
const INVALID_KEY_RE = /invalid|expired|revoked|does not have access/i;

/** Parse a model reply into a validated verdict (exported for tests). */
export function parseMatchVerdict(text: string | null): MatchVerdict | null {
  if (!text) return null;
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as Partial<MatchVerdict>;
    if (!v.samePerson || !["yes", "no", "unclear"].includes(v.samePerson)) return null;
    if (!v.confidence || !["high", "medium", "low"].includes(v.confidence)) return null;
    const out: MatchVerdict = {
      samePerson: v.samePerson,
      confidence: v.confidence,
    };
    if (typeof v.faceVisible === "boolean") out.faceVisible = v.faceVisible;
    if (v.bodyConsistent && ["yes", "no", "unclear"].includes(v.bodyConsistent)) {
      out.bodyConsistent = v.bodyConsistent;
    }
    if (typeof v.reason === "string") out.reason = v.reason.slice(0, 200);
    return out;
  } catch {
    return null;
  }
}

/**
 * The decision core — a pure function, unit-tested without keys.
 * Dual engine: both must agree (and not at low confidence).
 * Single engine: only a HIGH-confidence verdict may keep the seal or reject.
 * No engine: unclear (the route falls back to the pre-gate behavior).
 */
export function decideMatch(
  e1: EngineReply,
  e2: EngineReply
): { decision: MatchDecision; engine: "dual" | "single" | "none"; confidence: MatchOutcome["confidence"] } {
  const v1 = e1.ok ? e1.verdict : null;
  const v2 = e2.ok ? e2.verdict : null;
  const rank = { low: 0, medium: 1, high: 2 } as const;

  if (v1 && v2) {
    if (
      v1.samePerson === "yes" &&
      v2.samePerson === "yes" &&
      v1.confidence !== "low" &&
      v2.confidence !== "low"
    ) {
      return {
        decision: "match",
        engine: "dual",
        confidence: rank[v1.confidence] <= rank[v2.confidence] ? v1.confidence : v2.confidence,
      };
    }
    if (
      v1.samePerson === "no" &&
      v2.samePerson === "no" &&
      v1.confidence !== "low" &&
      v2.confidence !== "low"
    ) {
      return {
        decision: "mismatch",
        engine: "dual",
        confidence: rank[v1.confidence] >= rank[v2.confidence] ? v1.confidence : v2.confidence,
      };
    }
    return { decision: "unclear", engine: "dual", confidence: "unknown" };
  }

  const v = v1 ?? v2;
  if (!v) return { decision: "unclear", engine: "none", confidence: "unknown" };
  const engine = "single";
  if (v.samePerson === "yes" && v.confidence === "high") {
    return { decision: "match", engine, confidence: "high" };
  }
  if (v.samePerson === "no" && v.confidence === "high") {
    return { decision: "mismatch", engine, confidence: "high" };
  }
  return { decision: "unclear", engine, confidence: v.confidence };
}

/* --- Server-side downscale (sharp) — keeps multi-image payloads small ----- */

async function downscaleForEngine(dataUrl: string): Promise<string | null> {
  try {
    const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    const buf = Buffer.from(m[2], "base64");
    if (buf.length <= 350 * 1024) return dataUrl; // already small enough
    const sharp = (await import("sharp")).default;
    const out = await sharp(buf)
      .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

/* --- Baselines: live-verified selfie first, then existing photos ---------- */

async function photoRowToDataUrl(storagePath: string, origin: string): Promise<string | null> {
  const mediaMatch = /^\/api\/chat\/media\/([0-9a-f-]{36})$/i.exec(storagePath);
  if (mediaMatch) {
    const [row] = await db
      .select({ mime: chatMedia.mime, data: chatMedia.data })
      .from(chatMedia)
      .where(eq(chatMedia.id, mediaMatch[1]))
      .limit(1);
    if (!row) return null;
    return `data:${row.mime};base64,${Buffer.from(row.data).toString("base64")}`;
  }
  const url = /^https?:\/\//.test(storagePath)
    ? storagePath
    : storagePath.startsWith("/")
      ? `${origin}${storagePath}`
      : `${(process.env.SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/profile-photos/${storagePath}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6 * 1024 * 1024) return null;
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function collectBaselines(memberId: string, origin: string): Promise<string[]> {
  const out: string[] = [];
  /* Strongest reference: the selfie from the member's latest APPROVED
     verification — captured live, blink-gated, reviewed by the engines. */
  const [approved] = await db
    .select({ selfieMedia: verificationRequests.selfieMedia })
    .from(verificationRequests)
    .where(
      and(
        eq(verificationRequests.accountId, memberId),
        eq(verificationRequests.status, "approved")
      )
    )
    .orderBy(desc(verificationRequests.submittedAt))
    .limit(1);
  if (approved?.selfieMedia) out.push(approved.selfieMedia);

  const rows = await db
    .select()
    .from(profilePhotos)
    .where(eq(profilePhotos.userId, memberId))
    .orderBy(desc(profilePhotos.isPrimary), profilePhotos.position)
    .limit(2);
  for (const row of rows) {
    const dataUrl = await photoRowToDataUrl(row.storagePath, origin);
    if (dataUrl) out.push(dataUrl);
  }
  return [...new Set(out)].slice(0, 3);
}

/* --- Engine calls ---------------------------------------------------------- */

/**
 * Engine targets for the identity match.
 *
 * Each carries a model LIST. The first entry is the configured model; `gemini-2.5-flash`
 * is a fallback confirmed present on the operator's own published gateway model list
 * (2026-10-23) and is not a reasoning-effort tier, so it accepts the conventional
 * request shape if the tiered model is what the gateway is rejecting.
 *
 * The ladder, the response-body capture and the winner cache all live in
 * @/lib/engine-request. Before that module existed this file retried twice with
 * byte-identical parameters, discarded both response bodies, and reported the
 * constant string "unreachable" for every failure mode including a plan limit and an
 * invalid key, which is why a weeks-long outage produced no diagnosable signal.
 */
const MATCH_ENGINE_1: EngineTarget = {
  name: "antigravity",
  baseUrl: A_BASE,
  apiKey: A_KEY,
  /* Ordered by evidence, not by guess. `gemini-3-flash` is the one model the
     operator's own router state file records as live on the antigravity provider
     (free-ai-router-handoff/STATE-OF-PROJECT.md, 2026-10-10: "live for
     gemini-3-flash; Claude 429 quota at last check"). `gemini-2.5-flash` is in the
     gateway catalog but has no recorded live probe, so it ranks second. */
  models: [MATCH_MODEL_1, "gemini-3-flash", "gemini-2.5-flash"],
  /* The gateway documents x-api-key as its client header. Bearer is sent too. */
  sendApiKeyHeader: true,
  budgetMs: ENGINE_BUDGET_MS,
};

const MATCH_ENGINE_2: EngineTarget = {
  name: "voidai",
  baseUrl: V_BASE,
  apiKey: V_KEY,
  models: [MATCH_MODEL_2],
  budgetMs: ENGINE_BUDGET_MS,
};

/**
 * Turn a failed attempt log into the precise reason the flow reports.
 *
 * Preserves the distinctions the decision logic depends on: a plan limit is not a
 * transient outage, and an invalid key is not a gateway failure. Both were previously
 * read from a single response body that was then thrown away. Now they are read from
 * every attempt, and the underlying statuses and the gateway's own message are
 * carried through, so "unreachable" is never again the whole story.
 */
function classifyFailure(result: EngineResult): string {
  const errors = result.attempts.map((a) => a.error ?? "").join(" ");
  if (VISION_DISABLED_RE.test(errors)) return "vision-disabled";
  if (INVALID_KEY_RE.test(errors)) return "invalid-key";
  const statuses = [...new Set(result.attempts.map((a) => a.status))].join(",");
  const last = result.attempts[result.attempts.length - 1];
  const detail = (last?.error ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
  return `unreachable(${statuses})${detail ? `: ${detail}` : ""}`;
}

/**
 * A 200 whose content is unusable (the model ignored the images, or replied in
 * prose instead of the required JSON) is retried once. callEngine caches the winning
 * model and parameter rung, so the retry costs one round trip rather than a fresh
 * ladder walk. Transport-level failures are already retried inside callEngine across
 * every model and rung, so they are not retried again here.
 */
const MAX_CONTENT_ATTEMPTS = 2;

async function askEngine(target: EngineTarget, images: string[]): Promise<EngineReply> {
  let lastReason = "unreachable";
  for (let i = 0; i < MAX_CONTENT_ATTEMPTS; i++) {
    const result = await callEngine(target, MATCH_PROMPT, { images, maxTokens: 220 });
    if (!result.ok) return { ok: false, reason: classifyFailure(result) };
    const text = result.text ?? "";
    /* The model answered but ignored the images. Reported distinctly because it is a
       capability gap, not an outage, and must not be retried into a false verdict. */
    if (IMAGE_DROPPED_RE.test(text)) { lastReason = "image-dropped"; continue; }
    const verdict = parseMatchVerdict(text);
    if (verdict) return { ok: true, verdict };
    lastReason = "unparseable";
  }
  return { ok: false, reason: lastReason };
}

async function askEngine1(images: string[]): Promise<EngineReply> {
  if (!A_BASE || !A_KEY) return { ok: false, reason: "unconfigured" };
  return askEngine(MATCH_ENGINE_1, images);
}

async function askEngine2(images: string[]): Promise<EngineReply> {
  if (!V_BASE || !V_KEY) return { ok: false, reason: "unconfigured" };
  /* VoidAI documents its key format as sk-voidai-… — fail fast otherwise. */
  if (!V_KEY.startsWith("sk-voidai-")) return { ok: false, reason: "invalid-key" };
  return askEngine(MATCH_ENGINE_2, images);
}

/* --- In-memory rate limit (per account) ------------------------------------ */

const matchLog = new Map<string, number[]>();

export function matchRateLimited(accountId: string, max = 8, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const hits = (matchLog.get(accountId) ?? []).filter((t) => now - t < windowMs);
  matchLog.set(accountId, hits);
  if (hits.length >= max) return true;
  hits.push(now);
  return false;
}

/* --- Orchestration ---------------------------------------------------------- */

async function runIdentityMatchInner(
  memberId: string,
  newPhotoDataUrl: string,
  origin: string,
  started: number
): Promise<MatchOutcome> {
  const baselines = await collectBaselines(memberId, origin);
  if (baselines.length === 0) {
    return {
      decision: "unclear",
      engine: "none",
      confidence: "unknown",
      verdicts: { engine1: null, engine2: null },
      engineReasons: { engine1: "no-baselines", engine2: "no-baselines" },
      baselines: 0,
      ms: Date.now() - started,
    };
  }

  const newPhoto = await downscaleForEngine(newPhotoDataUrl);
  const refs = (await Promise.all(baselines.map(downscaleForEngine))).filter(
    (x): x is string => Boolean(x)
  );
  if (!newPhoto || refs.length === 0) {
    return {
      decision: "unclear",
      engine: "none",
      confidence: "unknown",
      verdicts: { engine1: null, engine2: null },
      engineReasons: { engine1: "image-prep-failed", engine2: "image-prep-failed" },
      baselines: refs.length,
      ms: Date.now() - started,
    };
  }

  const images = [newPhoto, ...refs];
  const [e1, e2] = await Promise.all([askEngine1(images), askEngine2(images)]);
  const decided = decideMatch(e1, e2);
  return {
    ...decided,
    verdicts: {
      engine1: e1.ok ? e1.verdict : null,
      engine2: e2.ok ? e2.verdict : null,
    },
    engineReasons: {
      engine1: e1.ok ? null : e1.reason,
      engine2: e2.ok ? null : e2.reason,
    },
    baselines: refs.length,
    ms: Date.now() - started,
  };
}

/**
 * Budgeted entry point. Netlify caps functions at 26s; a hanging engine must
 * degrade to the gate's designed fallback (photo added, audit row written,
 * seal revoked only if a check actually ran) — never to a platform-killed 502
 * that skips the fallback.
 */
export async function runIdentityMatch(
  memberId: string,
  newPhotoDataUrl: string,
  origin: string
): Promise<MatchOutcome> {
  const started = Date.now();
  return withBudget(
    runIdentityMatchInner(memberId, newPhotoDataUrl, origin, started),
    ENGINE_BUDGET_MS,
    (): MatchOutcome => ({
      decision: "unclear",
      engine: "error",
      confidence: "unknown",
      verdicts: { engine1: null, engine2: null },
      engineReasons: { engine1: "budget-exceeded", engine2: "budget-exceeded" },
      baselines: 0,
      ms: Date.now() - started,
    })
  );
}

/** Audit trail — verification_audit_logs, no schema change. Never throws. */
export async function logIdentityCheck(memberId: string, outcome: MatchOutcome): Promise<void> {
  try {
    await db.insert(verificationAuditLogs).values({
      userId: memberId,
      backendDecision: `photo-identity-${outcome.decision}`,
      eventType: "PHOTO_IDENTITY_MATCH",
      consistencyConfidence:
        outcome.confidence === "high"
          ? "0.9"
          : outcome.confidence === "medium"
            ? "0.6"
            : outcome.confidence === "low"
              ? "0.3"
              : "0.5",
      metadata: {
        engine: outcome.engine,
        confidence: outcome.confidence,
        baselines: outcome.baselines,
        ms: outcome.ms,
        verdicts: outcome.verdicts,
        engineReasons: outcome.engineReasons,
      },
    });
  } catch {
    /* audit must never break the upload */
  }
}
