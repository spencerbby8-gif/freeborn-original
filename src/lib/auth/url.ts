export function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function safeNextPath(input: string | null | undefined, fallback = "/onboarding") {
  if (!input) {
    return fallback;
  }
  return input.startsWith("/") ? input : fallback;
}
