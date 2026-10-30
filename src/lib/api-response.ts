/**
 * Reading API responses without lying to the member when the server is unhappy.
 *
 * Two mechanisms, both taken from what the competitors' shipped clients actually do
 * (re/analysis-2026-10-30/rea/MINING-API-STATE.json, cited by byte offset):
 *
 *   * Tinder's transport wraps every parse in a try/catch that RETURNS THE RAW
 *     RESPONSE when the body is not JSON (`k=async e=>{let t;try{t=await e.json()}catch(t){return e}
 *     return t}`, tinder.main-…js@~350 300 region) — because a 502 from a proxy is an HTML
 *     page, and `await res.json()` on it throws a SyntaxError that reaches the member as
 *     "unexpected end of JSON input" instead of "the service is down".
 *   * Rate limits are given a floor, not a guess: on 429 Tinder defers by 60 s (`429===t&&
 *     (o.all=s+6e4)`) and suppresses its own error telemetry for that status so a throttle
 *     storm does not drown real faults. Hinge's image layer retries with a bounded default
 *     and a caller-supplied predicate (`maxRetries||5`, `retryDelay`, `shouldRetry`,
 *     `attemptNumber` — 132-4be892819dbac6b1.js@35202, @35299).
 *
 * Nothing here retries blindly: only GET, and only 429/5xx/network. Retrying a POST on a
 * 502 would duplicate a like, a report or a message — which is a worse bug than the one
 * this fixes.
 */

export type ParseResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const GENERIC: Record<number, string> = {
  400: "That didn't look right to the server.",
  401: "You're signed out. Sign in and try again.",
  403: "You don't have access to that.",
  404: "That's no longer here.",
  409: "That changed underneath you. Refresh and try again.",
  413: "That file is too large.",
  429: "Slow down a moment — too many requests at once.",
  500: "The service hiccuped. Please try again.",
  502: "The service is unreachable right now.",
  503: "The service is busy. Try again in a moment.",
};

/** `res.json()` that cannot throw. `null` means "no JSON body", which is normal for 204s
 *  and for proxy error pages; the caller decides whether that is a failure. */
export async function readJsonSafe<T = unknown>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The message a member should see: the server's own if it sent a human one, otherwise a
 *  status-specific line, otherwise a generic one. Never a raw provider string, and never
 *  the empty string that `res.json()` failures used to produce. */
export async function describeFailure(res: Response): Promise<{ status: number; message: string }> {
  const body = await readJsonSafe<{ error?: string; message?: string }>(res);
  const mine = typeof body?.error === "string" && body.error.trim() ? body.error.trim()
    : typeof body?.message === "string" && body.message.trim() ? body.message.trim() : "";
  return { status: res.status, message: mine || GENERIC[res.status] || "Something went wrong." };
}

export function isRateLimited(res: { status: number }): boolean {
  return res.status === 429;
}

/**
 * How long to wait before attempt `attempt` (1-based). `Retry-After` wins — the server
 * knows its own window — with a 60 s floor for 429 when it sends none (Tinder's 6e4), and
 * exponential backoff with jitter otherwise. Clamped so a hostile or buggy header cannot
 * park a member's screen for an hour.
 */
export function retryDelayMs(opts: {
  status?: number;
  retryAfterHeader?: string | null;
  attempt: number;
  baseMs?: number;
  capMs?: number;
  jitter?: number;
  nowMs?: number;
}): number {
  const base = opts.baseMs ?? 400;
  const cap = opts.capMs ?? 20_000;
  const raw = opts.retryAfterHeader?.trim();
  if (raw) {
    const secs = Number(raw);
    if (Number.isFinite(secs) && secs >= 0 && secs <= 120) return Math.min(Math.max(secs * 1000, 250), 120_000);
    // A number outside the sane band is an unusable header, NOT a date to try parsing:
    // Date.parse("99999") succeeds in V8 as a year, which would resolve to the ceiling and
    // turn "the server said nothing useful" into a two-minute wait. HTTP-date form is only
    // attempted for a genuinely non-numeric value.
    if (!Number.isFinite(secs)) {
      const at = parseHttpDateMs(raw, opts.nowMs ?? Date.now());
      if (at !== null) return Math.min(Math.max(at, 250), 120_000);
    }
  }
  if (opts.status === 429) {
    // The 60s throttle floor is deliberately NOT clamped by `cap`: `cap` bounds the
    // exponential 5xx ladder (20s by default), and min(60s, 20s) would quietly turn the
    // measured floor back into hammering a server that just asked to be left alone.
    // Only the same 120s ceiling that bounds a hostile Retry-After applies here.
    return Math.min(Math.max(60_000, base), 120_000);
  }
  const exp = Math.min(cap, base * 2 ** Math.max(0, opts.attempt - 1));
  const jitter = opts.jitter ?? 0;
  return Math.round(exp * (1 + jitter));
}

function parseHttpDateMs(value: string, nowMs: number): number | null {
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - nowMs);
}

export type RetryPolicy = {
  maxAttempts?: number;
  /** Default: GET only, and only 429 / 5xx / network error. */
  shouldRetry?: (err: unknown, res: Response | null, attempt: number) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; status: number | null }) => void;
  sleep?: (ms: number) => Promise<void>;
  baseMs?: number;
  capMs?: number;
};

const RETRYABLE_STATUS = (s: number) => s === 429 || s >= 500;

/**
 * Bounded retry around a fetch. Returns the final Response (possibly a failed one) plus
 * the attempt count, so callers keep their own status handling rather than inheriting a
 * throw. `fetchImpl` is injectable so this is testable without a network.
 */
export async function fetchWithRetry(
  input: string,
  init: RequestInit = {},
  policy: RetryPolicy = {},
  fetchImpl: typeof fetch = fetch
): Promise<{ res: Response | null; attempts: number; error?: unknown }> {
  const maxAttempts = Math.max(1, Math.min(policy.maxAttempts ?? 5, 10));
  const method = (init.method ?? "GET").toUpperCase();
  const retryable = method === "GET";
  const shouldRetry =
    policy.shouldRetry ??
    ((_err: unknown, res: Response | null) => retryable && (res === null || RETRYABLE_STATUS(res.status)));
  const sleep = policy.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let attempts = 0;
  let lastError: unknown;
  let lastRes: Response | null = null;
  while (attempts < maxAttempts) {
    attempts++;
    lastError = undefined;
    try {
      lastRes = await fetchImpl(input, init);
      if (lastRes.ok || !shouldRetry(lastError, lastRes, attempts) || attempts >= maxAttempts) {
        return { res: lastRes, attempts };
      }
    } catch (err) {
      lastError = err;
      lastRes = null;
      if (!shouldRetry(err, null, attempts) || attempts >= maxAttempts) return { res: null, attempts, error: err };
    }
    const retryAfter = lastRes?.headers?.get?.("retry-after") ?? null;
    const delayMs = retryDelayMs({
      status: lastRes?.status,
      retryAfterHeader: retryAfter,
      attempt: attempts,
      baseMs: policy.baseMs,
      capMs: policy.capMs,
    });
    // 429 is deliberately not reported upward as a fault — the same reason Tinder skips
    // its own logging for it: a throttle is expected load, not an error worth alarming over.
    policy.onRetry?.({ attempt: attempts, delayMs, status: lastRes?.status ?? null });
    await sleep(delayMs);
  }
  return { res: lastRes, attempts, ...(lastError === undefined ? {} : { error: lastError }) };
}

/** Cache-busting parameter for re-requesting a media URL the browser already failed on.
 *  Only same-origin paths — a signed or third-party URL must not be rewritten. */
export function retrySrcFor(src: string, attempt: number): string | null {
  if (attempt < 1) return null;
  if (!src.startsWith("/") || src.startsWith("//")) return null;
  if (/\?/.test(src)) {
    if (/[?&]r=\d+(&|$)/.test(src)) return src.replace(/([?&]r=)\d+/, `$1${attempt}`);
    return `${src}&r=${attempt}`;
  }
  return `${src}?r=${attempt}`;
}
