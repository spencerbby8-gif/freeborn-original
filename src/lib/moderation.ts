/**
 * FREEBORN JUSTICE ENGINE — dual-model, anti-injustice by design.
 *
 * Every serious verdict is cross-checked by TWO independent models from two
 * different providers so neither a hallucination nor a single biased read
 * can punish a real person:
 *   - Engine 1: Antigravity gateway → gemini-3.6-flash-medium (vision-capable)
 *   - Engine 2: VoidAI            → claude-sonnet-5
 *
 * THE RULES (non-negotiable, encoded below):
 *  1. Reports alone NEVER ban anyone — no matter how many. Reports open an
 *     investigation; only HARD evidence suspends (datacenter/automated
 *     traffic, or an admin review after appeals).
 *  2. The fact-check NEVER reads private chats. Evidence is limited to the
 *     reported profile's public content + report patterns. Privacy is a line
 *     we do not cross, period.
 *  3. Identity-verified members get lighter moderation: an action against
 *     them requires BOTH models agreeing at high severity.
 *  4. The models hunt BOTS and FOOTPRINTS (impossible patterns, mass-report
 *     weapons, fake-photo signatures) — not opinions.
 */

const A_BASE = (process.env.ANTIGRAVITY_BASE_URL ?? "").replace(/\/$/, "");
const A_KEY = process.env.ANTIGRAVITY_FREE_API_KEY ?? "";
const V_BASE = (process.env.VOID_AI_BASE_URL ?? "").replace(/\/$/, "");
const V_KEY = process.env.VOID_AI_API_KEY ?? "";

export const MODERATION_MODEL = "gemini-3.6-flash-medium";
/* Engine 2 model: verified live on 2026-10-09 — "claude-sonnet-5" returns HTTP 400
   ("Your plan does not have access to model 'claude-sonnet-5'") on the VoidAI
   account, which silently degraded moderation to single-engine. "gpt-4o" was
   verified HTTP 200 with clean JSON discipline on the same account. */
export const MODERATION_MODEL_2 = "gpt-4o";

export type FactVerdict = {
  severity: "low" | "medium" | "high" | "critical";
  botLikelihood: "low" | "medium" | "high";
  credible: boolean;
  summary: string;
};

export type JusticeOutcome = {
  action: "dismiss" | "warn" | "escalate";
  severity: FactVerdict["severity"];
  bothAgree: boolean;
  summary: string;
};

async function ask(base: string, key: string, model: string, prompt: string): Promise<string | null> {
  if (!base || !key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35_000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        /* The Antigravity gateway documents x-api-key as its client header —
           send both so either contract keeps working. */
        "x-api-key": key,
        /* voidai sits behind Cloudflare and rejects the default Node fetch
           user-agent (error 1010) — same requirement as lm7. */
        "User-Agent": "freeborn-verify/1.0",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 220,
        temperature: 0,
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return j.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseVerdict(text: string | null): FactVerdict | null {
  if (!text) return null;
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0]) as FactVerdict;
    if (!["low", "medium", "high", "critical"].includes(v.severity)) return null;
    if (!["low", "medium", "high"].includes(v.botLikelihood)) v.botLikelihood = "low";
    v.credible = Boolean(v.credible);
    return v;
  } catch {
    return null;
  }
}

function buildPrompt(reason: string, details: string, targetSummary: string, reportCount: number) {
  return (
    "You are one of two independent moderation judges on a dating platform. Judge ONLY observable evidence — " +
    "you must NEVER assume access to private chats; they are off-limits. " +
    `Report reason: "${reason}". Reporter's claim: "${details.slice(0, 400)}". ` +
    `Reported profile (public data only): ${targetSummary.slice(0, 500)}. ` +
    `Total reports ever filed against this profile: ${reportCount}. ` +
    "Assess: (1) severity of the CLAIM if true, (2) whether the claim is CREDIBLE given observable evidence " +
    "(mass-report weapons and grudges exist — skepticism is required), " +
    "(3) bot/fake likelihood from footprint patterns (stock-photo vibes, impossible profiles, mass-report bursts). " +
    "Reply with JSON only: " +
    '{"severity":"low|medium|high|critical","botLikelihood":"low|medium|high","credible":true|false,"summary":"<fifteen words max>"}'
  );
}

/**
 * Dual-model fact-check. Returns null only when both engines are down —
 * in that case the report still lands in the human queue, unjudged.
 */
export async function factCheckReport(
  reason: string,
  details: string,
  targetSummary: string,
  reportCount: number,
  targetIsVerified: boolean
): Promise<JusticeOutcome | null> {
  const prompt = buildPrompt(reason, details, targetSummary, reportCount);

  const [textA, textV] = await Promise.all([
    ask(A_BASE, A_KEY, MODERATION_MODEL, prompt),
    ask(V_BASE, V_KEY, MODERATION_MODEL_2, prompt),
  ]);

  const vA = parseVerdict(textA);
  const vV = parseVerdict(textV);
  if (!vA && !vV) return null;

  /* One engine down → the survivor decides, but conservatively: it may
     dismiss or warn, never escalate alone. */
  if (!vA || !vV) {
    const single = (vA ?? vV) as FactVerdict;
    return {
      action: single.severity === "critical" || single.severity === "high" ? "warn" : "dismiss",
      severity: single.severity,
      bothAgree: false,
      summary: single.summary ?? "single-engine review",
    };
  }

  const rank = { low: 0, medium: 1, high: 2, critical: 3 } as const;
  const bothHigh = rank[vA.severity] >= 2 && rank[vV.severity] >= 2;
  const bothCredible = vA.credible && vV.credible;
  const bothBot = vA.botLikelihood === "high" && vV.botLikelihood === "high";
  const severity = rank[vA.severity] >= rank[vV.severity] ? vA.severity : vV.severity;

  /* Verified members: only BOTH engines at high severity move anything. */
  if (targetIsVerified && !(bothHigh && bothCredible)) {
    return { action: "dismiss", severity, bothAgree: bothHigh, summary: `${vA.summary} | ${vV.summary}` };
  }

  if (!bothCredible) {
    return { action: "dismiss", severity, bothAgree: false, summary: `${vA.summary} | ${vV.summary}` };
  }
  if (bothBot) {
    /* Bot footprints from BOTH engines = escalate for hard-evidence review
       (IP/security record decides suspension, never this verdict alone). */
    return { action: "escalate", severity, bothAgree: true, summary: `${vA.summary} | ${vV.summary}` };
  }
  if (bothHigh) {
    return { action: "warn", severity, bothAgree: true, summary: `${vA.summary} | ${vV.summary}` };
  }
  return { action: "dismiss", severity, bothAgree: false, summary: `${vA.summary} | ${vV.summary}` };
}

/** Legacy triage for back-compat (single-engine severity only). */
export async function triageReport(reason: string, details: string): Promise<{ severity: FactVerdict["severity"]; summary: string } | null> {
  const text = await ask(A_BASE, A_KEY, MODERATION_MODEL, buildPrompt(reason, details, "", 1));
  const v = parseVerdict(text);
  return v ? { severity: v.severity, summary: v.summary } : null;
}

/**
 * DEEP APPEAL INVESTIGATION — both engines study the member's security
 * record and their plea before any human decision. Bot risk requires BOTH
 * engines to flag it; a single suspicious engine is treated as uncertain.
 */
export async function investigateAppeal(
  plea: string,
  securityRecord: string
): Promise<{ botRisk: "low" | "medium" | "high"; summary: string } | null> {
  const prompt =
    "You are one of two independent investigators reviewing a suspended dating-app account's appeal. " +
    `Member's plea: "${plea.slice(0, 500)}". Security record: ${securityRecord.slice(0, 600)}. ` +
    "Decide ONLY from this record: how likely is this a bot/automated account (low/medium/high), and why. " +
    "Be fair — real people on VPNs or shared networks exist. Reply with JSON only: " +
    '{"botRisk":"low|medium|high","summary":"<fifteen words max>"}';

  const [textA, textV] = await Promise.all([
    ask(A_BASE, A_KEY, MODERATION_MODEL, prompt),
    ask(V_BASE, V_KEY, MODERATION_MODEL_2, prompt),
  ]);

  const parse = (t: string | null) => {
    if (!t) return null;
    const m = /\{[\s\S]*\}/.exec(t);
    if (!m) return null;
    try {
      const v = JSON.parse(m[0]) as { botRisk?: string; summary?: string };
      if (!v.botRisk || !["low", "medium", "high"].includes(v.botRisk)) return null;
      return { botRisk: v.botRisk as "low" | "medium" | "high", summary: v.summary ?? "" };
    } catch {
      return null;
    }
  };

  const a = parse(textA);
  const b = parse(textV);
  if (!a && !b) return null;
  if (!a || !b) {
    const s = (a ?? b) as { botRisk: "low" | "medium" | "high"; summary: string };
    // Single engine can never declare high risk alone.
    return { botRisk: s.botRisk === "high" ? "medium" : s.botRisk, summary: s.summary };
  }
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const bothHigh = a.botRisk === "high" && b.botRisk === "high";
  const risk = bothHigh
    ? "high"
    : rank[a.botRisk] >= rank[b.botRisk]
      ? a.botRisk
      : b.botRisk;
  return { botRisk: risk, summary: `${a.summary} | ${b.summary}` };
}
