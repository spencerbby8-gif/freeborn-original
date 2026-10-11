/**
 * ENGINE CALL BUDGET
 *
 * Netlify caps synchronous functions at 26 seconds on paid plans (10s on
 * free). Every AI-calling route on Freeborn must therefore finish — or
 * fail over to its designed fallback — well inside that window, or the
 * platform kills the function mid-flight and the client sees a 502 even
 * though the work (a filed report, an uploaded photo) may have partially
 * happened.
 *
 * withBudget() races a promise against a deadline and resolves with a
 * caller-supplied fallback value when the deadline wins. The design rule:
 * the fallback must be the SAME state the route already produces when an
 * engine is unavailable — never a silent success, never a crash.
 *
 * The losing promise keeps running server-side until its own abort fires;
 * its result is simply discarded. Callers must not let the losing promise
 * write to the database after the race is lost (keep DB writes outside the
 * raced promise, or make them idempotent).
 */

export function withBudget<T>(
  promise: Promise<T>,
  ms: number,
  fallback: () => T
): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback());
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallback());
      }
    );
  });
}

/**
 * The budget every AI-calling route uses: 20s. Leaves ~4s of headroom under
 * the 26s platform cap for DB round-trips, inserts and response overhead.
 * Warm engine calls answer in 2-13s, so the budget only bites when an engine
 * is genuinely hanging — exactly the case the fallbacks exist for.
 */
export const ENGINE_BUDGET_MS = 20_000;
