/**
 * The ONLY place in Freeborn's client that reads anything about the device, and it reads four
 * coarse facts. Keeping it in its own module (rather than inline in verify-modal.tsx, which
 * legitimately uses canvas for selfie encoding and localStorage for the draft form) is what
 * makes the privacy promise checkable: the adversarial suite can assert that THIS file touches
 * nothing else, which is a statement we can actually keep true.
 *
 * Read `NEVER_COLLECTED` in browser-integrity.ts for what is deliberately absent, and the test
 * in scripts/trust/harness.ts [14] that enforces it against this exact file.
 */
import type { BrowserObservations } from "@/lib/browser-integrity";

/**
 * Collect the observations. Wrapped in a try/catch that returns `{}` — a browser that will not
 * answer is not punished, because the checks are comparisons and a missing side of a comparison
 * yields no opinion, not a suspicion.
 */
export function browserObservations(): BrowserObservations {
  try {
    const nav = navigator as Navigator & {
      userAgentData?: { platform?: string };
      permissions?: unknown;
    };
    return {
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      language: nav.language,
      maxTouchPoints: nav.maxTouchPoints,
      claimedPlatform: nav.userAgentData?.platform,
      hasCameraApi: Boolean(nav.mediaDevices?.getUserMedia),
      hasPermissionsApi: typeof nav.permissions?.query === "function",
      /* Camera capture requires a secure context, so `false` here means the page is not the one
         we shipped — a real signal that costs nothing to disclose and cannot identify anyone. */
      secureContext: window.isSecureContext === true,
    };
  } catch {
    return {};
  }
}

/**
 * The request header the browser already sends. We do not add anything to it and we never read
 * it back: it is sent so the SERVER can compare its own copy against `browserObservations()`.
 */
export function integrityRequestHeaders(): Record<string, string> {
  /* Nothing to do. Client Hints (`Sec-CH-UA-*`) and `Accept-Language` are set by the browser,
     not by us — and `fetch` refuses to let a page override them anyway, which is why this
     comparison is worth anything at all. Present as a comment because a future reader will look
     for a header here and must not "helpfully" add one. */
  return {};
}
