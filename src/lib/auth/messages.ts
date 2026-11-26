import { absolute } from "@/lib/site";

export function getAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login credentials"))
    return "That email and password combination isn't right. Please try again.";
  if (message.includes("email not confirmed"))
    return "Confirm your email before signing in. Check your inbox for the verification link.";
  if (message.includes("already registered") || message.includes("already been registered"))
    return "An account already exists for this email. Try signing in instead.";
  if (message.includes("rate limit") || message.includes("too many"))
    return "Too many attempts. Wait a moment, then try again.";
  if (message.includes("network") || message.includes("fetch"))
    return "We couldn't reach Freeborn. Check your connection and try again.";
  if (message.includes("expired") || message.includes("invalid token"))
    return "This secure link has expired. Request a new one to continue.";
  return "We couldn't complete that request. Please try again.";
}

export const authStatusMessages = {
  "verification-sent": {
    tone: "success" as const,
    title: "Check your inbox",
    body: "If eligible, check your email for instructions to confirm your address.",
  },
  "reset-sent": {
    tone: "success" as const,
    title: "Check your email",
    body: "If the address is eligible, check your inbox for recovery instructions.",
  },
  verified: {
    tone: "success" as const,
    title: "Continue to Freeborn",
    body: "If you have confirmed your email, sign in to continue.",
  },
  recovered: {
    tone: "success" as const,
    title: "Continue account recovery",
    body: "If you opened a recovery link, choose a new password to continue.",
  },
  "password-updated": {
    tone: "success" as const,
    title: "Continue to sign in",
    body: "If you changed your password, sign in with the new one.",
  },
  "signed-out": {
    tone: "success" as const,
    title: "Sign in to continue",
    body: "If you signed out, sign in again to return.",
  },
  "oauth-error": {
    tone: "error" as const,
    title: "Google sign-in could not finish",
    body: "Please try again. If the problem continues, use email sign-in.",
  },
  "google-error": {
    tone: "error" as const,
    title: "Google sign-in could not finish",
    body: "Please try again. If the problem continues, use email sign-in.",
  },
  "link-invalid": {
    tone: "error" as const,
    title: "That link is no longer valid",
    body: "Request a fresh verification or recovery email and try again.",
  },
  "env-missing": {
    tone: "error" as const,
    title: "We can't sign you in right now",
    body: "Something on our end isn't quite ready. Please try again in a moment.",
  },
  "session-lost": {
    tone: "error" as const,
    title: "Your session didn't carry over",
    body: "Sign in again and you'll land back on the exact onboarding screen you left — your answers are saved on your profile, not in this browser. If you're inside a preview panel or iframe and sign-in loops, use 'Open in new tab' (top right).",
  },
  suspended: {
    tone: "error" as const,
    // The URL status is not an authorization verdict. Give a useful next step
    // without asserting that any account has actually been suspended.
    title: "Account access notice",
    body: `If your account is suspended and you believe this is a mistake, you can file an appeal at ${absolute("/appeal")}.`,
  },
};

export type AuthStatusKey = keyof typeof authStatusMessages;
