/**
 * SECOND ENGINE — Freeborn's independent identity re-verifier (voidai.app).
 *
 * Stage 1 runs on Antigravity/Gemini; this engine re-verifies the same selfie
 * afterwards, one after the other, before any verdict is final.
 *
 * Model chain selected by live accuracy testing against Freeborn's own pose
 * guides (peace sign / OK sign / thumbs up / hand-under-chin), in order of
 * measured reliability on the account:
 *   gpt-4.1  — 3/3 correct, fastest, clean JSON discipline (primary)
 *   gpt-4o   — 3/3 correct (fallback)
 *   kimi-k3, gemini-3.5-flash — last resort
 *
 * If nothing in the chain answers, the engine reports so honestly and the
 * flow degrades to the single-engine path — it never pretends a second
 * opinion happened when it didn't.
 *
 * NOTE: voidai sits behind Cloudflare and rejects the default Node fetch
 * user-agent (error 1010) — every call MUST carry our custom User-Agent.
 */

const VOID_BASE = (process.env.VOID_AI_BASE_URL ?? "").replace(/\/$/, "");
const VOID_KEY = process.env.VOID_AI_API_KEY ?? "";
/* Legacy env names kept as a safety net if the account ever rotates. */
const LEGACY_BASE = (process.env.LM7_BASE_URL ?? "").replace(/\/$/, "");
const LEGACY_KEY = process.env.LM7_API_KEY ?? "";

const BASE = VOID_BASE || LEGACY_BASE;
const KEY = VOID_KEY || LEGACY_KEY;

export const LM7_MODEL = "gpt-4.1";
export const LM7_VISION_CHAIN = ["gpt-4.1", "gpt-4o", "kimi-k3", "gemini-3.5-flash"];

export function lm7Configured(): boolean {
  return Boolean(BASE && KEY);
}

export type Lm7Reply =
  | { ok: true; text: string }
  | { ok: false; reason: "unconfigured" | "invalid-key" | "vision-disabled" | "unreachable" };

const INVALID_KEY_RE = /invalid|expired|revoked|does not have access/i;
/* VoidAI free plans disable vision/OCR outright — a plan state, not a
   transient failure: fail fast instead of walking the whole model chain. */
const VISION_DISABLED_RE = /vision[^\n]{0,60}disabled|vision_disabled/i;

async function callOnce(model: string, content: Array<Record<string, unknown>>): Promise<Lm7Reply> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
        /* Cloudflare in front of voidai bans default clients — required. */
        "User-Agent": "freeborn-verify/1.0",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        max_tokens: 400,
        temperature: 0,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      error?: { message?: string };
    } | null;
    const text = json?.choices?.[0]?.message?.content ?? "";
    if (text) return { ok: true, text };
    const errMsg = json?.error?.message ?? "";
    if (VISION_DISABLED_RE.test(errMsg)) return { ok: false, reason: "vision-disabled" };
    if (INVALID_KEY_RE.test(errMsg)) return { ok: false, reason: "invalid-key" };
    return { ok: false, reason: "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** Walk the vision chain. Honest about why nothing worked. */
export async function askLm7(content: Array<Record<string, unknown>>): Promise<Lm7Reply> {
  if (!lm7Configured()) return { ok: false, reason: "unconfigured" };
  /* VoidAI documents its key format as sk-voidai-… (docs.voidai.app/authentication).
     A key that doesn't match can never authenticate — fail fast with a clear
     reason instead of surfacing an opaque gateway 500. Legacy LM7_* keys are
     exempt (their format predates this convention). */
  if (VOID_KEY && !VOID_KEY.startsWith("sk-voidai-")) {
    return { ok: false, reason: "invalid-key" };
  }
  let last: Lm7Reply = { ok: false, reason: "unreachable" };
  for (const model of LM7_VISION_CHAIN) {
    const reply = await callOnce(model, content);
    if (reply.ok) return reply;
    last = reply;
    if (reply.reason === "invalid-key" || reply.reason === "vision-disabled") return reply; // plan-wide state — stop early
  }
  return last;
}
