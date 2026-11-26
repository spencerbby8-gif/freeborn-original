/** One-time, tab-local auth feedback. Never stores a member name, email, token or free text. */
export const AUTH_ENTRY_KEY = "freeborn.auth-entry.v1";
const MAX_AGE_MS = 120_000;
const FUTURE_SKEW_MS = 5_000;

export const AUTH_ENTRY_COPY = {
  signedIn: { tone: "success", title: "You're in", body: "Welcome back to Freeborn." },
  accountCreated: { tone: "success", title: "Welcome to Freeborn", body: "You’re signed in." },
  emailConfirmed: { tone: "success", title: "Email confirmed", body: "Welcome to Freeborn." },
  passwordUpdated: { tone: "success", title: "Password updated", body: "Your password has been updated." },
} as const;
export type AuthEntryKind = keyof typeof AUTH_ENTRY_COPY;
export type AuthEntryTarget = "/app" | "/onboarding";

type Entry = { kind: AuthEntryKind; memberId: string; target: AuthEntryTarget; createdAt: number };

/** Best effort. An unavailable storage API must never prevent authentication. */
export function queueAuthEntry(kind: AuthEntryKind, memberId: string, target: AuthEntryTarget): boolean {
  if (typeof window === "undefined" || !memberId || memberId.length > 128) return false;
  try {
    const entry: Entry = { kind, memberId, target, createdAt: Date.now() };
    window.sessionStorage.setItem(AUTH_ENTRY_KEY, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

/** Peek first, then compare-and-consume after session validation; safe under effect re-runs. */
export function peekAuthEntry(path: string): { raw: string; entry: Entry } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_ENTRY_KEY);
    if (!raw) return null;
    const discard = () => { window.sessionStorage.removeItem(AUTH_ENTRY_KEY); return null; };
    if (raw.length > 1024) return discard();
    let entry: Entry;
    try { entry = JSON.parse(raw) as Entry; } catch { return discard(); }
    if (!entry || typeof entry !== "object" || !Object.hasOwn(AUTH_ENTRY_COPY, entry.kind) ||
        typeof entry.memberId !== "string" || !entry.memberId || entry.memberId.length > 128 ||
        (entry.target !== "/app" && entry.target !== "/onboarding") ||
        typeof entry.createdAt !== "number" || !Number.isFinite(entry.createdAt) ||
        Date.now() - entry.createdAt > MAX_AGE_MS || entry.createdAt - Date.now() > FUTURE_SKEW_MS) return discard();
    if (entry.target !== path) return null;
    return { raw, entry };
  } catch {
    return null;
  }
}

/** Do not erase a newer event if another action replaced the stored value. */
export function consumeAuthEntry(raw: string): boolean {
  try {
    if (window.sessionStorage.getItem(AUTH_ENTRY_KEY) !== raw) return false;
    window.sessionStorage.removeItem(AUTH_ENTRY_KEY);
    return true;
  } catch {
    return false;
  }
}
