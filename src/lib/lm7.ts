/**
 * SECOND ENGINE — independent identity re-verification.
 *
 * Uses the same bounded caller as stage 1, moderation, and identity matching.
 * At most three upstream attempts share ENGINE_BUDGET_MS; there is no longer a
 * separate 4 x 20 second chain that can outlive the route's budget.
 */
import { ENGINE_BUDGET_MS } from "@/lib/engine-budget";
import { callEngine, type EngineTarget } from "@/lib/engine-request";

const VOID_BASE = (process.env.VOID_AI_BASE_URL ?? "").replace(/\/$/, "");
const VOID_KEY = process.env.VOID_AI_API_KEY ?? "";
const LEGACY_BASE = (process.env.LM7_BASE_URL ?? "").replace(/\/$/, "");
const LEGACY_KEY = process.env.LM7_API_KEY ?? "";
const BASE = VOID_BASE || LEGACY_BASE;
const KEY = VOID_KEY || LEGACY_KEY;

export const LM7_MODEL = "gpt-4.1";
export const LM7_VISION_CHAIN = ["gpt-4.1", "gpt-4o", "kimi-k3", "gemini-3.5-flash"];

const TARGET: EngineTarget = {
  name: "voidai-verification",
  baseUrl: BASE,
  apiKey: KEY,
  models: LM7_VISION_CHAIN,
  budgetMs: ENGINE_BUDGET_MS,
  maxAttempts: 3,
};

export function lm7Configured(): boolean {
  return Boolean(BASE && KEY);
}

export type Lm7Reply =
  | { ok: true; text: string }
  | { ok: false; reason: "unconfigured" | "invalid-key" | "vision-disabled" | "timeout" | "unreachable"; detail?: string };

const INVALID_KEY_RE = /invalid[^\n]{0,50}(api[ _-]?key|key|token)|expired[^\n]{0,50}(key|token)|revoked[^\n]{0,50}(key|token)|does not have access/i;
const VISION_DISABLED_RE = /vision[^\n]{0,60}disabled|vision_disabled/i;

export async function askLm7(content: Array<Record<string, unknown>>, signal?: AbortSignal): Promise<Lm7Reply> {
  if (!lm7Configured()) return { ok: false, reason: "unconfigured" };
  if (VOID_KEY && !VOID_KEY.startsWith("sk-voidai-")) return { ok: false, reason: "invalid-key" };
  const prompt = content
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? ""))
    .join("\n");
  const images = content
    .filter((part) => part.type === "image_url")
    .map((part) => (part.image_url as { url?: unknown } | undefined)?.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  const result = await callEngine(TARGET, prompt, { images, maxTokens: 400, signal });
  if (result.ok) return { ok: true, text: result.text ?? "" };
  const errors = result.attempts.map((a) => a.error ?? "").join(" ");
  const statuses = [...new Set(result.attempts.map((a) => a.status))];
  const detail = `statuses=${statuses.join(",")}`;
  if (VISION_DISABLED_RE.test(errors)) return { ok: false, reason: "vision-disabled", detail };
  if (statuses.some((s) => s === 401 || s === 403) || INVALID_KEY_RE.test(errors)) {
    return { ok: false, reason: "invalid-key", detail };
  }
  if (statuses.some((s) => [-3, -4, -5].includes(s))) return { ok: false, reason: "timeout", detail };
  return { ok: false, reason: "unreachable", detail };
}
