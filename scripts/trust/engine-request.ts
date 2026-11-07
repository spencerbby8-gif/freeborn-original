import assert from "node:assert/strict";
import { callEngine, type EngineTarget } from "@/lib/engine-request";
import { withBudget } from "@/lib/engine-budget";

const SYNTHETIC_KEY = "sk-synthetic-test-key-not-a-credential";
let assertions = 0;
function check(name: string, condition: boolean) {
  assert.ok(condition, name);
  assertions++;
  console.log(`ok ${assertions} - ${name}`);
}

function target(name: string, overrides: Partial<EngineTarget> = {}): EngineTarget {
  return {
    name,
    baseUrl: "https://engines.invalid/v1",
    apiKey: SYNTHETIC_KEY,
    models: ["model-a", "model-b"],
    budgetMs: 2_000,
    maxAttempts: 3,
    ...overrides,
  };
}

async function withFetch(mock: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

await withFetch(
  (async () => {
    throw new Error("an unconfigured target must never fetch");
  }) as typeof fetch,
  async () => {
    const result = await callEngine(target("unconfigured", { baseUrl: "", apiKey: "" }), "hello");
    check("unconfigured target fails closed without a network request", !result.ok && result.attempts[0]?.status === -2);
  },
);

await withFetch(
  (async () =>
    new Response(
      JSON.stringify({ error: { message: `provider rejected ${SYNTHETIC_KEY}` } }),
      { status: 401, headers: { "content-type": "application/json" } },
    )) as typeof fetch,
  async () => {
    let calls = 0;
    const countingFetch: typeof fetch = async () => {
      calls++;
      return new Response(
        JSON.stringify({ error: { message: `provider rejected ${SYNTHETIC_KEY}` } }),
        { status: 401, headers: { "content-type": "application/json" } },
      );
    };
    globalThis.fetch = countingFetch;
    const result = await callEngine(target("attempt-cap"), "hello");
    const upstreamAttempts = result.attempts.filter((attempt) => attempt.model !== "-");
    check("the six-combination ladder stops after exactly three upstream attempts", !result.ok && calls === 3 && upstreamAttempts.length === 3);
    check("the omitted fallback combinations are reported explicitly", result.attempts.some((attempt) => attempt.status === -6));
    check("upstream response excerpts never contain the configured credential", result.attempts.every((attempt) => !attempt.error?.includes(SYNTHETIC_KEY)));
  },
);

const observed: Array<{ model: string; rung: string }> = [];
await withFetch(
  (async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: unknown }> };
    observed.push({ model: body.model, rung: Array.isArray(body.messages[0]?.content) ? "image" : "text" });
    return new Response(JSON.stringify({ choices: [{ message: { content: "synthetic answer" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch,
  async () => {
    const first = await callEngine(target("cached-winner"), "hello");
    const second = await callEngine(target("cached-winner"), "hello again");
    check("a successful text result is returned", first.ok && first.text === "synthetic answer");
    check("a cached winning model/rung is reused without another fallback scan", second.ok && observed.length === 2 && observed.every((entry) => entry.model === "model-a" && entry.rung === "text"));
  },
);

await withFetch(
  (async () => {
    throw new Error("a pre-aborted request must never fetch");
  }) as typeof fetch,
  async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await callEngine(target("external-abort"), "hello", { signal: controller.signal });
    check("external cancellation is classified separately and performs no fetch", !result.ok && result.attempts[0]?.status === -4);
  },
);

const timeoutStarted = Date.now();
await withFetch(
  ((_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) reject(signal.reason);
      else signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    })) as unknown as typeof fetch,
  async () => {
    const result = await callEngine(
      target("attempt-timeout", { timeoutMs: 10, budgetMs: undefined, maxAttempts: 1 }),
      "hello",
    );
    check("a stalled provider is aborted at the per-attempt deadline", !result.ok && result.attempts[0]?.status === -5 && Date.now() - timeoutStarted < 500);
  },
);

await withFetch(
  (async () => {
    throw new Error(`synchronous transport failure ${SYNTHETIC_KEY}`);
  }) as typeof fetch,
  async () => {
    const result = await callEngine(target("sync-transport-error", { maxAttempts: 1 }), "hello");
    check("synchronous transport failures return a redacted attempt instead of escaping", !result.ok && result.attempts[0]?.status === -1 && !result.attempts[0]?.error?.includes(SYNTHETIC_KEY));
  },
);

const fallback = await withBudget(
  () => {
    throw new Error("synthetic setup failure");
  },
  50,
  () => "budget fallback",
);
check("the shared engine budget handles synchronous createPromise failures", fallback === "budget fallback");

console.log(`engine request regression tests passed: ${assertions}/${assertions}`);
