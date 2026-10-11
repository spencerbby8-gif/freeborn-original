import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/health/engines
 *
 * Operator evidence that the AI stack is alive IN PRODUCTION — the same
 * engines, keys and header contracts the moderation and verification flows
 * use. Safe to call publicly: it reports status codes, latencies and
 * one-way key fingerprints (sha256, first 16 hex) — never key values, never
 * model replies, never user data.
 *
 *   engine1.text   → powers moderation verdicts (stage 1) + report triage
 *   engine1.vision → powers verification stage 1 + the photo identity gate
 *   engine2.text   → powers moderation verdicts (second opinion) + appeals
 *   engine2.vision → powers verification stage 2 (currently 400 on the
 *                    VoidAI free plan: vision/OCR disabled there)
 */

const A_BASE = (process.env.ANTIGRAVITY_BASE_URL ?? "").replace(/\/$/, "");
const A_KEY = process.env.ANTIGRAVITY_FREE_API_KEY ?? "";
const V_BASE = (process.env.VOID_AI_BASE_URL ?? "").replace(/\/$/, "");
const V_KEY = process.env.VOID_AI_API_KEY ?? "";

const UA = "freeborn-verify/1.0";
/** 64×64 test PNG — just enough for the vision path to accept the request. */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3RQQ2AQBDAQNYTJs4EipCDCGQh4h4Tko6CJp33uY8/m3NdumHLdADrgNYBrQNaB7QOaB3QOqB1QOuA1gGtA1oHtA5oHdA6oHVA64DWAa0DWge0Dmgd0DqgdUDrgNYBrQNaB7QOaB3QPqylXKF37X2YAAAAAElFTkSuQmCC";

const fp = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

type Probe = { status: number; ms: number };

async function probe(url: string, headers: Record<string, string>, body: unknown): Promise<Probe> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, ms: Date.now() - t0 };
  } catch {
    return { status: -1, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/* Soft rate limit: one full check per 10s per instance. */
let lastCall = 0;

export async function GET() {
  if (Date.now() - lastCall < 10_000) {
    return Response.json(
      { error: "Engine checks are rate-limited — retry in a few seconds." },
      { status: 429 }
    );
  }
  lastCall = Date.now();

  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const textBody = (model: string) => ({
    model,
    messages: [{ role: "user", content: "Reply with exactly: PONG" }],
    max_tokens: 8,
    temperature: 0,
  });
  const visionBody = (model: string) => ({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Reply with exactly: PONG" },
          { type: "image_url", image_url: { url: TINY_PNG } },
        ],
      },
    ],
    max_tokens: 8,
    temperature: 0,
  });

  const authA = { Authorization: `Bearer ${A_KEY}`, "x-api-key": A_KEY, "User-Agent": UA };
  const authV = { Authorization: `Bearer ${V_KEY}`, "User-Agent": UA };

  const [e1text, e1vision, e2text, e2vision] = await Promise.all([
    A_BASE && A_KEY
      ? probe(`${A_BASE}/chat/completions`, authA, textBody("gemini-3.6-flash-medium"))
      : Promise.resolve({ status: -2, ms: 0 }),
    A_BASE && A_KEY
      ? probe(`${A_BASE}/chat/completions`, authA, visionBody("gemini-3.6-flash-medium"))
      : Promise.resolve({ status: -2, ms: 0 }),
    V_BASE && V_KEY
      ? probe(`${V_BASE}/chat/completions`, authV, textBody("gpt-4o"))
      : Promise.resolve({ status: -2, ms: 0 }),
    V_BASE && V_KEY
      ? probe(`${V_BASE}/chat/completions`, authV, visionBody("gpt-4o"))
      : Promise.resolve({ status: -2, ms: 0 }),
  ]);

  return Response.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    db: dbOk,
    engine1: {
      name: "antigravity",
      configured: Boolean(A_BASE && A_KEY),
      keySha256: A_KEY ? fp(A_KEY) : null,
      text: e1text,
      vision: e1vision,
    },
    engine2: {
      name: "voidai",
      configured: Boolean(V_BASE && V_KEY),
      keySha256: V_KEY ? fp(V_KEY) : null,
      text: e2text,
      vision: e2vision,
    },
    moderationAI: {
      dualEngineReady: e1text.status === 200 && e2text.status === 200,
      note: "Text verdicts from both engines power report triage and appeal investigations.",
    },
    verificationAI: {
      stage1VisionReady: e1vision.status === 200,
      stage2VisionReady: e2vision.status === 200,
      note:
        e2vision.status === 400
          ? "Engine 2 vision returned 400 — on the VoidAI free plan vision/OCR is disabled, so verification stage 2 degrades to single-engine (reported honestly, never faked)."
          : e2vision.status === 200
            ? "Both stages have vision — dual-engine verification active."
            : "Engine 2 vision unreachable — verification stage 2 degrades to single-engine.",
    },
  });
}
