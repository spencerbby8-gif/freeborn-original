/**
 * Browser-side proof-of-work solver for /api/human/verify.
 *
 * WHY THIS FILE EXISTS, and why it is deliberately boring.
 * The appeal challenge existed server-side for a day with no client that could answer a
 * 428: `FREEBORN_HUMAN_CHALLENGE=enforce` would therefore have refused every appeal in the
 * product. Enabling that flag without this file would have been a false success — a control
 * that is "on" and makes the feature unreachable.
 *
 * MEASURED FEASIBILITY (2026-10-29, this sandbox, WebCrypto `crypto.subtle.digest`, the
 * async-per-hash cost every browser pays; a phone is slower than a laptop, not faster):
 *   - 18-bit target: ~262,144 candidates expected. At the measured ~8,500 hash/s that is
 *     ~31 s average, and a run given the server's full 4,000,000-candidate budget did NOT
 *     solve in 242 s. Unacceptable for a human, so the appeal tier is not 18 bits.
 *   - 12-bit target: ~4,096 candidates expected => ~0.5-2 s. Acceptable.
 * The strength trade is stated plainly in RE-MECHANICS: a 12-bit puzzle deters a browser
 * script flooding the appeal queue; it does not stop a GPU. That is the right size for the
 * actual threat (Tinder's `appealChallengeToken` guards the queue, not the account), and it
 * is why the higher tiers are kept for signup/reset, which no browser code has to solve here.
 *
 * The difficulty predicate below is a byte-for-byte copy of the server's `meetsDifficulty`
 * semantics, re-derived against the same string form (`sha256(nonce + ":" + solution)`) so
 * the two cannot drift. The harness asserts agreement on random inputs.
 */

const enc = new TextEncoder();

/** Hex-digit-prefix difficulty test, matching src/app/api/human/issue/route.ts exactly. */
export function meetsDifficultyHex(nonce: string, solution: string, bits: number, hex: string): boolean {
  const full = Math.floor(bits / 4);
  if (hex.slice(0, full) !== "0".repeat(full)) return false;
  if (bits % 4 === 0) return true;
  return parseInt(hex[full], 16) < 1 << (4 - (bits % 4));
}

function toHexPrefix(bytes: Uint8Array, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

export interface SolveOptions {
  bits: number;
  budget: number;
  /** Called every `yieldEvery` candidates so the tab keeps painting. */
  onProgress?: (tried: number, elapsedMs: number) => void;
  yieldEvery?: number;
  signal?: AbortSignal;
}

export type SolveOutcome =
  | { ok: true; solution: string; tried: number; ms: number }
  | { ok: false; reason: "exhausted" | "aborted" | "no-webcrypto"; tried: number; ms: number };

/**
 * Search solution = "0", "1", "2", … for a digest whose hex prefix has `bits` leading zeros.
 * Returns the first candidate that satisfies the SAME predicate the server checks.
 */
export async function solveChallenge(nonce: string, opts: SolveOptions): Promise<SolveOutcome> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof globalThis.crypto.subtle.digest !== "function") {
    return { ok: false, reason: "no-webcrypto", tried: 0, ms: 0 };
  }
  /* Only the first ceil(bits/4) hex digits matter, i.e. at most 5 bytes for a 20-bit max.
     Hashing the digest and reading a prefix is what the server does; doing the same here
     removes any chance of an acceptance mismatch between "solved locally" and "accepted". */
  const hexLen = Math.floor(opts.bits / 4) + 1;
  const bytesNeeded = Math.ceil(hexLen / 2);
  const prefix = enc.encode(`${nonce}:`);
  const buf = new ArrayBuffer(64);
  const view = new Uint8Array(buf);
  view.set(prefix);
  const base = prefix.length;

  const started = Date.now();
  const yieldEvery = opts.yieldEvery ?? 2048;
  for (let n = 0; n < opts.budget; n++) {
    if (opts.signal?.aborted) return { ok: false, reason: "aborted", tried: n, ms: Date.now() - started };
    const s = String(n);
    for (let i = 0; i < s.length; i++) view[base + i] = s.charCodeAt(i);
    const digest = new Uint8Array(await subtle.digest("SHA-256", new Uint8Array(buf, 0, base + s.length)));
    if (meetsDifficultyHex(nonce, s, opts.bits, toHexPrefix(digest, bytesNeeded))) {
      return { ok: true, solution: s, tried: n + 1, ms: Date.now() - started };
    }
    if (n % yieldEvery === 0) {
      opts.onProgress?.(n, Date.now() - started);
      /* Yield to the event loop so the appeal form stays responsive; without this a
         2-second puzzle reads as a frozen page, which members report as a crash. */
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return { ok: false, reason: "exhausted", tried: opts.budget, ms: Date.now() - started };
}

/**
 * Full client flow for one challenge: issue -> solve -> verify -> token.
 * `onStatus` lets the caller show what is happening; a member staring at a spinner with no
 * explanation is indistinguishable from a broken app.
 */
export async function runHumanChallenge(
  purpose: string,
  fetchImpl: typeof fetch = fetch,
  opts: { risk?: string; onStatus?: (s: string) => void } = {}
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const h = { "Content-Type": "application/json" };
  let issue: Response;
  try {
    issue = await fetchImpl("/api/human/issue", { method: "POST", headers: h, body: JSON.stringify({ purpose, risk: opts.risk }) });
  } catch {
    return { ok: false, error: "network" };
  }
  if (!issue.ok) return { ok: false, error: `issue-${issue.status}` };
  const c = (await issue.json().catch(() => ({}))) as {
    nonce?: string; difficultyBits?: number; solverBudget?: number;
  };
  if (!c.nonce || !c.difficultyBits) return { ok: false, error: "malformed-challenge" };

  opts.onStatus?.("Checking you are human…");
  const solved = await solveChallenge(c.nonce, { bits: c.difficultyBits, budget: c.solverBudget ?? 4_000_000 });
  if (!solved.ok) return { ok: false, error: solved.reason };

  let res: Response;
  try {
    res = await fetchImpl("/api/human/verify", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ nonce: c.nonce, solution: solved.solution }),
    });
  } catch {
    return { ok: false, error: "network" };
  }
  const j = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !j.token) return { ok: false, error: j.error ?? `verify-${res.status}` };
  return { ok: true, token: j.token };
}
