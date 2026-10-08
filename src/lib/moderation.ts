/**
 * FREEBORN MODERATION ENGINE — Antigravity gateway.
 *
 * Model picked from the gateway's live list: gemini-3.6-flash-medium.
 * Why this one: vision-capable (photo moderation), fast, and a DIFFERENT
 * tier than the verification engine (gemini-3.6-flash-high) so the two
 * never fight over the same rate limits. claude-sonnet-4-6 is the fallback
 * for judgment-heavy triage.
 */

const BASE = (process.env.ANTIGRAVITY_BASE_URL ?? "").replace(/\/$/, "");
const KEY = process.env.ANTIGRAVITY_FREE_API_KEY ?? "";

export const MODERATION_MODEL = "gemini-3.6-flash-medium";
export const MODERATION_FALLBACK_MODEL = "claude-sonnet-4-6";

export type TriageVerdict = {
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
};

async function ask(model: string, prompt: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
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

/** Classify a member report. Returns null when the engine is unavailable —
    the report still lands in the queue for humans, untriaged. */
export async function triageReport(reason: string, details: string): Promise<TriageVerdict | null> {
  if (!BASE || !KEY) return null;
  const prompt =
    "You are the moderation triage engine of a dating platform. Classify this member report. " +
    `Reason: "${reason}". Details: "${details.slice(0, 500)}". ` +
    "Reply with JSON only: " +
    '{"severity": "low"|"medium"|"high"|"critical", "summary": "<twelve words max>"}';
  for (const model of [MODERATION_MODEL, MODERATION_FALLBACK_MODEL]) {
    const text = await ask(model, prompt);
    if (!text) continue;
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) continue;
    try {
      const v = JSON.parse(m[0]) as TriageVerdict;
      if (["low", "medium", "high", "critical"].includes(v.severity)) return v;
    } catch {
      /* try next model */
    }
  }
  return null;
}
