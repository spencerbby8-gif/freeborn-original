/**
 * Resilient OpenAI-compatible engine caller.
 *
 * WHY THIS EXISTS
 * ---------------
 * Antigravity returned HTTP 502 for both text and vision on every call, in
 * production, for weeks, and nothing anywhere recorded why. Two reasons:
 *
 *   1. `moderation.ts` did `if (!res.ok) return null;` and discarded the response
 *      body. `identity-match.ts` did `throw new Error(`http ${res.status}`)`,
 *      retried twice with identical parameters, discarded both, and reported the
 *      constant string "unreachable". The gateway's own error message, which is the
 *      only thing that explains a 502, was thrown away at every layer.
 *
 *   2. Both callers sent one fixed parameter set: `temperature: 0` and a small
 *      `max_tokens` (220 in production, 8 in the health probe). The configured model
 *      is `gemini-3.6-flash-medium`, and the operator's own model list confirms the
 *      gateway serves effort tiers (`-low`, `-medium`, `-high`, `-tiered`).
 *      Reasoning-tier models commonly reject a non-default temperature and need
 *      `max_tokens` headroom for internal reasoning before any visible output. With
 *      `max_tokens: 8` there is no room for reasoning at all.
 *
 * The comparison that makes this concrete: VoidAI's `gpt-4o` returns 200 with the
 * identical parameters, because gpt-4o is not a reasoning model. Same body, same
 * headers, different model class, different outcome. And the operator reports the
 * same Antigravity key working in a chat application, which is what you would expect
 * if the key is valid and the parameters are the problem: a chat UI does not send
 * `temperature: 0`.
 *
 * A 502 rather than a 400 also matters. An invalid key yields 401/403; an
 * inaccessible model yields 400, which is exactly what VoidAI returns with the
 * message "Your plan does not have access to model 'claude-sonnet-5'". A 502 means
 * the gateway accepted the request and its upstream failed, which points at request
 * shape rather than credentials.
 *
 * WHAT THIS DOES
 * --------------
 * Walks a bounded ladder of parameter sets and models, keeps the response body from
 * every failure, and CACHES the first combination that works so only the initial
 * call pays the discovery cost. Nothing is guessed and nothing is hidden: the full
 * attempt log is returned to the caller and surfaced by /api/health/engines.
 *
 * This does not assume which hypothesis is correct. It finds out, and then remembers.
 */

/** A parameter rung. Tried in order for each model. */
type Rung = {
  id: string;
  build: (messages: unknown[], maxTokens: number) => Record<string, unknown>;
};

/**
 * Ordered from most conventional to most permissive.
 *
 * `strict` is what the code sent before, so a gateway that already works keeps
 * working on the first attempt and nothing regresses.
 *
 * `reasoning` drops `temperature` entirely and gives the model room to think. It is
 * the rung expected to fix a reasoning-tier model, and it is what a chat UI
 * effectively sends.
 *
 * `minimal` drops both `temperature` and `max_tokens`, leaving every generation
 * parameter at the gateway's default. It is the last resort and the most likely to
 * be accepted by anything, at the cost of less predictable output length.
 */
const RUNGS: Rung[] = [
  {
    id: "strict",
    build: (messages, maxTokens) => ({
      messages,
      max_tokens: maxTokens,
      temperature: 0,
    }),
  },
  {
    id: "reasoning",
    build: (messages, maxTokens) => ({
      messages,
      /* Reasoning tokens come out of the same budget as visible output on most
         gateways, so a caller asking for 220 tokens of answer needs far more than
         220 total. 8x with a floor is enough for a short JSON verdict. */
      max_tokens: Math.max(2048, maxTokens * 8),
    }),
  },
  {
    id: "minimal",
    build: (messages) => ({ messages }),
  },
];

export type EngineTarget = {
  /** Label used in diagnostics. Never contains a secret. */
  name: string;
  /** Origin plus any path prefix, no trailing slash. `/chat/completions` is appended. */
  baseUrl: string;
  apiKey: string;
  /** Tried in order. The first entry is the configured model. */
  models: string[];
  /** Send `x-api-key` alongside `Authorization: Bearer`. Antigravity documents it. */
  sendApiKeyHeader?: boolean;
  /** Per-attempt timeout in ms. Overridden by the budget-derived cap. */
  timeoutMs?: number;
  /**
   * Total wall-clock the whole ladder may spend. When `budgetMs` is set it wins
   * over `timeoutMs`: the ladder stops as soon as the deadline is reached, so a
   * route wrapped in `withBudget(promise, ENGINE_BUDGET_MS, …)` can no longer be
   * resolved by its own fallback while the ladder keeps burning a 35s attempt.
   */
  budgetMs?: number;
};

export type Attempt = {
  model: string;
  rung: string;
  status: number;
  ms: number;
  /** First 400 characters of a non-OK response body, or the thrown error. */
  error?: string;
};

export type EngineResult = {
  ok: boolean;
  text?: string;
  model?: string;
  rung?: string;
  attempts: Attempt[];
};

/**
 * Cache of the combination that worked, per engine name plus a vision/text flag.
 *
 * Module scope, so it lives as long as the serverless instance. Without it every
 * request would re-walk the ladder and pay three round trips. With it, discovery
 * happens once per instance and every later call goes straight to the answer.
 *
 * A failed discovery is deliberately NOT cached, so a transient gateway outage does
 * not pin an engine to a bad combination for the life of the instance.
 */
const winners = new Map<string, { model: string; rung: Rung }>();

function cacheKey(target: string, vision: boolean) {
  return `${target}:${vision ? "vision" : "text"}`;
}

/** Build the OpenAI-compatible `content` field for a text or vision request. */
export function buildContent(prompt: string, images?: string[]): unknown {
  if (!images || images.length === 0) return prompt;
  return [
    { type: "text", text: prompt },
    ...images.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
}

/** Read a short, safe excerpt of a response body for diagnostics. */
async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 400);
  } catch {
    return "<unreadable body>";
  }
}

/**
 * Call an engine, walking the parameter ladder until something answers.
 *
 * Returns the reply text plus a full attempt log. `ok: false` always comes with the
 * reason, so a caller can never again reduce a failure to a bare null.
 */
export async function callEngine(
  target: EngineTarget,
  prompt: string,
  opts: { images?: string[]; maxTokens?: number } = {},
): Promise<EngineResult> {
  const { images, maxTokens = 220 } = opts;
  const attempts: Attempt[] = [];

  if (!target.baseUrl || !target.apiKey) {
    return {
      ok: false,
      attempts: [{ model: "-", rung: "-", status: -2, ms: 0, error: "unconfigured" }],
    };
  }

  const vision = Boolean(images && images.length > 0);
  const key = cacheKey(target.name, vision);
  const messages = [{ role: "user", content: buildContent(prompt, images) }];
  /* Budget wins over a hand-picked per-attempt timeout. With no budget the old
     timeoutMs is honoured, so any caller that has not been migrated behaves
     exactly as before. */
  const ladderDeadlineMs = target.budgetMs ? Math.max(2_000, target.budgetMs - 1_500) : 0;
  const timeoutMs = target.budgetMs
    ? Math.max(1_500, Math.floor((target.budgetMs - 1_500) / 3))
    : (target.timeoutMs ?? 30_000);
  const ladderStartedAt = Date.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${target.apiKey}`,
    /* Node's default fetch user-agent is rejected by Cloudflare-fronted gateways
       with error 1010, which presents as an opaque failure. */
    "User-Agent": "freeborn-verify/1.0",
  };
  if (target.sendApiKeyHeader) headers["x-api-key"] = target.apiKey;

  /* A previously discovered winner goes first. If it has stopped working the ladder
     still runs in full afterwards, so a gateway change self-heals. */
  const cached = winners.get(key);
  const plan: Array<{ model: string; rung: Rung }> = [];
  if (cached) plan.push({ model: cached.model, rung: cached.rung });
  for (const model of target.models) {
    for (const rung of RUNGS) {
      if (cached && cached.model === model && cached.rung.id === rung.id) continue;
      plan.push({ model, rung });
    }
  }

  for (const step of plan) {
    /* Stop walking the ladder once the budget is spent. Before this, a route
       awaiting callEngine inside withBudget() kept burning upstream attempts after
       its own fallback had already been returned — wasted spend and, on the
       health probe, a function that could outlive maxDuration. */
    if (ladderDeadlineMs && Date.now() - ladderStartedAt >= ladderDeadlineMs) {
      attempts.push({
        model: step.model,
        rung: step.rung.id,
        status: -3,
        ms: Date.now() - ladderStartedAt,
        error: `ladder deadline ${ladderDeadlineMs}ms reached; ${plan.length - plan.indexOf(step)} attempt(s) not tried`,
      });
      break;
    }
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${target.baseUrl}/chat/completions`, {
        method: "POST",
        signal: ctrl.signal,
        headers,
        body: JSON.stringify({ model: step.model, ...step.rung.build(messages, maxTokens) }),
      });

      if (!res.ok) {
        attempts.push({
          model: step.model,
          rung: step.rung.id,
          status: res.status,
          ms: Date.now() - t0,
          error: await readErrorBody(res),
        });
        continue;
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text) {
        attempts.push({
          model: step.model,
          rung: step.rung.id,
          status: res.status,
          ms: Date.now() - t0,
          error: json.error?.message ?? "200 but empty content",
        });
        continue;
      }

      attempts.push({ model: step.model, rung: step.rung.id, status: res.status, ms: Date.now() - t0 });
      winners.set(key, { model: step.model, rung: step.rung });
      return { ok: true, text, model: step.model, rung: step.rung.id, attempts };
    } catch (err) {
      attempts.push({
        model: step.model,
        rung: step.rung.id,
        status: -1,
        ms: Date.now() - t0,
        error: err instanceof Error ? err.message.slice(0, 400) : String(err).slice(0, 400),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, attempts };
}

/**
 * The combination currently believed to work, for surfacing in diagnostics.
 * Exposed so /api/health/engines can report what production actually settled on
 * rather than only what it was configured with.
 */
export function describeWinners(): Record<string, { model: string; rung: string }> {
  const out: Record<string, { model: string; rung: string }> = {};
  for (const [k, v] of winners) out[k] = { model: v.model, rung: v.rung.id };
  return out;
}

/** Clear the cache. Used by the diagnostics route to force a fresh discovery. */
export function resetWinners(): void {
  winners.clear();
}
