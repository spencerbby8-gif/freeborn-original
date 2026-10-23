import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { callEngine, describeWinners, resetWinners, type EngineTarget } from "@/lib/engine-request";
import { MODERATION_MODEL, MODERATION_MODEL_2 } from "@/lib/moderation";
import { MATCH_MODEL_1, MATCH_MODEL_2 } from "@/lib/identity-match";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/health/engines
 *
 * Operator evidence that the AI stack is alive in production, exercising the SAME
 * code path the moderation and verification flows use rather than a separate
 * hand-written probe.
 *
 * WHY IT CHANGED
 * --------------
 * The previous version built its own fetch calls and recorded only
 * `{ status, ms }`. It never read the response body, so when Antigravity returned
 * 502 on every call for weeks there was nothing anywhere that said why. It also
 * probed with `max_tokens: 8` while production sent 220, so the probe and the
 * product were not even testing the same request.
 *
 * It now calls callEngine() from @/lib/engine-request, exactly as moderation.ts and
 * identity-match.ts do, and reports the full attempt log: every model tried, every
 * parameter rung tried, the status, the latency, and the first 300 characters of the
 * gateway's own error message. When a combination works it reports which one, so a
 * fix can be promoted from "whatever the ladder stumbled into" to a deliberate
 * configuration.
 *
 * SAFE TO CALL PUBLICLY
 * ---------------------
 * Reports status codes, latencies, model names and gateway error text. Never key
 * values: error bodies are scrubbed of both keys before they leave, because a
 * gateway that echoes a malformed request could otherwise reflect an Authorization
 * header back to an anonymous caller. Key fingerprints are one-way sha256, first 16
 * hex characters.
 *
 *   engine1.text   → moderation verdicts (stage 1) and report triage
 *   engine1.vision → verification stage 1 and the photo identity gate
 *   engine2.text   → moderation second opinion and appeals
 *   engine2.vision → verification stage 2
 */

const A_BASE = (process.env.ANTIGRAVITY_BASE_URL ?? "").replace(/\/$/, "");
const A_KEY = process.env.ANTIGRAVITY_FREE_API_KEY ?? "";
const V_BASE = (process.env.VOID_AI_BASE_URL ?? "").replace(/\/$/, "");
const V_KEY = process.env.VOID_AI_API_KEY ?? "";

/** 64×64 test PNG, just enough for a vision path to accept the request. */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3RQQ2AQBDAQNYTJs4EipCDCGQh4h4Tko6CJr33uY8/m3NdumHLtADrgNYBrQNaB7QOaB3QOqB1QOuA1gGtA1oHtA5oHdA6oHVA64DWAa0DWge0Dmgd0DqgdUDrgNYBrQNaB7QOaB3QPqylXKF37X2YAAAAAElFTkSuQmCC";

const fp = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * Scrub both keys out of any text before it is returned. Belt and braces: the keys
 * should never appear in a gateway error, but this route is unauthenticated and a
 * reflected credential would be a serious leak.
 */
function scrub(text: string | undefined): string | undefined {
  if (!text) return text;
  let out = text;
  for (const secret of [A_KEY, V_KEY]) {
    if (secret && secret.length > 6) out = out.split(secret).join("[redacted]");
  }
  return out.slice(0, 300);
}

/* Mirrors the production targets exactly, including the fallback model list, so a
   result here predicts a result in the product. */
const ENGINE_1: EngineTarget = {
  name: "antigravity",
  baseUrl: A_BASE,
  apiKey: A_KEY,
  models: [MATCH_MODEL_1, "gemini-2.5-flash"],
  sendApiKeyHeader: true,
  timeoutMs: 20_000,
};

const ENGINE_2: EngineTarget = {
  name: "voidai",
  baseUrl: V_BASE,
  apiKey: V_KEY,
  models: [MATCH_MODEL_2],
  timeoutMs: 20_000,
};

const PROBE_PROMPT = "Reply with exactly: PONG";

/**
 * Soft rate limit. One full check per 30s per instance.
 *
 * Raised from 10s because a failing engine now walks a ladder of models and
 * parameter rungs, so one request can issue several upstream calls. This route is
 * unauthenticated, and without a limit an anonymous caller could drive that cost.
 * It is per-instance, so with several instances running the real ceiling is a
 * multiple of this; that is acceptable for an operator diagnostic and is noted here
 * rather than left implicit.
 */
let lastCall = 0;

type ProbeReport = {
  ok: boolean;
  ms: number;
  model?: string;
  rung?: string;
  attempts: Array<{
    model: string;
    rung: string;
    status: number;
    ms: number;
    error?: string;
  }>;
};

async function probe(target: EngineTarget, images?: string[]): Promise<ProbeReport> {
  const t0 = Date.now();
  if (!target.baseUrl || !target.apiKey) {
    return {
      ok: false,
      ms: 0,
      attempts: [{ model: "-", rung: "-", status: -2, ms: 0, error: "unconfigured" }],
    };
  }
  const result = await callEngine(target, PROBE_PROMPT, { images, maxTokens: 16 });
  return {
    ok: result.ok,
    ms: Date.now() - t0,
    model: result.model,
    rung: result.rung,
    attempts: result.attempts.map((a) => ({ ...a, error: scrub(a.error) })),
  };
}

async function handleGet(request: Request) {
  /* `?fresh=1` clears the cached winning combination so the ladder runs from
     scratch. Use it after changing a model or a gateway setting, otherwise the
     cached winner is reported and the new configuration is never exercised. */
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  if (fresh) resetWinners();

  if (Date.now() - lastCall < 30_000) {
    return Response.json(
      {
        error: "Engine checks are rate-limited. Retry in a few seconds.",
        retryAfterMs: 30_000 - (Date.now() - lastCall),
      },
      { status: 429 },
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

  const [e1text, e1vision, e2text, e2vision] = await Promise.all([
    probe(ENGINE_1),
    probe(ENGINE_1, [TINY_PNG]),
    probe(ENGINE_2),
    probe(ENGINE_2, [TINY_PNG]),
  ]);

  return Response.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    db: dbOk,
    engine1: {
      name: "antigravity",
      configured: Boolean(A_BASE && A_KEY),
      keySha256: A_KEY ? fp(A_KEY) : null,
      /* What production is configured to ask for, versus what actually answered. */
      configuredModels: { moderation: MODERATION_MODEL, verification: MATCH_MODEL_1 },
      text: e1text,
      vision: e1vision,
    },
    engine2: {
      name: "voidai",
      configured: Boolean(V_BASE && V_KEY),
      keySha256: V_KEY ? fp(V_KEY) : null,
      configuredModels: { moderation: MODERATION_MODEL_2, verification: MATCH_MODEL_2 },
      text: e2text,
      vision: e2vision,
    },
    /* The combination each engine settled on, cached per serverless instance. When
       this disagrees with configuredModels the ladder found something better and the
       constant in source should be updated to match. */
    resolvedCombinations: describeWinners(),
    moderationAI: {
      dualEngineReady: e1text.ok && e2text.ok,
      note: "Text verdicts from both engines power report triage and appeal investigations.",
    },
    verificationAI: {
      stage1VisionReady: e1vision.ok,
      stage2VisionReady: e2vision.ok,
      note: !e1vision.ok && !e2vision.ok
        ? "Neither engine has working vision, so identity verification cannot complete. Every attempt and its gateway error is listed above."
        : !e2vision.ok
          ? "Engine 2 vision is unavailable, so verification stage 2 degrades to single-engine. Reported honestly, never faked."
          : !e1vision.ok
            ? "Engine 1 vision is unavailable, so verification stage 1 degrades to single-engine."
            : "Both stages have vision. Dual-engine verification is active.",
    },
  });
}

export async function GET(request: Request) {
  try {
    return await handleGet(request);
  } catch (err) {
    /* A crash must be diagnosable JSON, not an HTML error page. */
    return Response.json(
      { error: "Engine check failed.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
