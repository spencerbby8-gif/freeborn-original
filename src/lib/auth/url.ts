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
  if (!input) {
    return fallback;
  }
  return input.startsWith("/") ? input : fallback;
}
