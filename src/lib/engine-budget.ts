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
 * The budget every AI-calling route gives one engine call: 20s.
 *
 * WHAT CHANGED (audit follow-up, 2026-10-28)
 * -------------------------------------------
 * This number used to be derived from a platform limit that no longer applies:
 * the comment here cited Netlify's 26s synchronous-function cap, and Netlify was
 * removed from the product on 2026-10-27. The real ceiling is now
 * `export const maxDuration` per route (60s on reports/appeals, 120s on
 * verification and media) plus `statement_timeout: 15_000` on the DB pool.
 *
 * The budget stays 20s deliberately — it is the contract with `callEngine`, which
 * now sizes its own ladder to `budgetMs` instead of walking every
 * model × rung combination to the end. See ENGINE_ATTEMPT_SHARE below.
 */
export const ENGINE_BUDGET_MS = 20_000;

/** Head-room kept back from the budget for DB writes and response assembly. */
export const ENGINE_DEADLINE_SAFETY_MS = 1_500;

/** How much of the budget the ladder may spend before it stops trying. */
export const ENGINE_LADDER_DEADLINE_MS = ENGINE_BUDGET_MS - ENGINE_DEADLINE_SAFETY_MS;

/** The budget is shared across at most this many attempts, so one hanging
    attempt cannot consume the whole window the way a 35s timeout did. */
export const ENGINE_MAX_ATTEMPTS = 3;

/** Per-attempt abort derived from the budget. Floor of 1.5s: below that a
    healthy gateway under normal latency is punished rather than measured. */
export const ENGINE_ATTEMPT_MS = Math.max(
  1_500,
  Math.floor(ENGINE_LADDER_DEADLINE_MS / ENGINE_MAX_ATTEMPTS),
);
