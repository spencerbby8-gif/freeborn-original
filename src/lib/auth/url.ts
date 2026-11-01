import { SITE_URL } from "@/lib/site";

export function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  // F7: the canonical host is the single source of truth even when the env var
  // is missing. Never fall back to a different project's domain.
  return process.env.NEXT_PUBLIC_APP_URL ?? SITE_URL;
}

export function safeNextPath(input: string | null | undefined, fallback = "/onboarding") {
  if (!input) return fallback;
  // Same-origin relative paths only. Reject scheme-relative URLs, backslashes,
  // control characters, and anything a browser could treat as a different origin.
  if (!input.startsWith("/") || input.startsWith("//") || input.includes("\\") || /[\u0000-\u001f\u007f]/.test(input)) {
    return fallback;
  }
  try {
    const url = new URL(input, "https://freeborn.invalid");
    if (url.origin !== "https://freeborn.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
