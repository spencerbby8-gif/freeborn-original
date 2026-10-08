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
    body: "We sent a verification link so you can confirm your email and unlock your session.",
  },
  "reset-sent": {
    tone: "success" as const,
    title: "Recovery email sent",
    body: "Open the reset link from your email to choose a new password.",
  },
  verified: {
    tone: "success" as const,
    title: "Email confirmed",
    body: "Your account is now verified. You can continue into Freeborn.",
  },
  recovered: {
    tone: "success" as const,
    title: "Recovery confirmed",
    body: "Choose a new password to finish restoring your account.",
  },
  "password-updated": {
    tone: "success" as const,
    title: "Password updated",
    body: "Your account is secured again. Taking you into Freeborn.",
  },
  "signed-out": {
    tone: "success" as const,
    title: "Signed out",
    body: "You've been securely signed out of Freeborn.",
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
    body: "If you're inside a preview panel or iframe, your browser may block its cookies. Use 'Open in new tab' (top right) and sign in there — that always works.",
  },
  suspended: {
    tone: "error" as const,
    title: "Account suspended",
    body: "This account was suspended under Freeborn's Privacy & Safety Policy — our checks found datacenter or automated traffic behind it. Real members connect from real devices. If this is a mistake, file an appeal at freeborn.app/appeal — investigators review every case and results come within 2 days.",
  },
};

export type AuthStatusKey = keyof typeof authStatusMessages;
