import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthExperience, type AuthScreenMode } from "@/components/auth/auth-experience";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  authStatusMessages,
  type AuthStatusKey,
} from "@/lib/auth/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWebSupabaseConfigured } from "@/lib/supabase/browser";

export const metadata: Metadata = {
  title: "Join Freeborn · Secure Sign In",
  description:
    "Access your values-aligned profile or create a new account on Freeborn.",
  robots: { index: false, follow: true },
};

function parseMode(value?: string): AuthScreenMode {
  if (value === "sign-up") return "sign-up";
  if (value === "reset-password") return "reset-password";
  if (value === "update-password") return "update-password";
  return "sign-in";
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const mode = parseMode(rawMode);

  // Fallback-aware: the config constants survive even when the platform
  // resets .env between rebuilds.
  const configured = isWebSupabaseConfigured;

  let alreadySignedIn = false;
  if (configured) {
    try {
      const supabase = await createSupabaseServerClient();
      const result = await supabase.auth.getClaims();
      alreadySignedIn = Boolean(result.data?.claims);
    } catch {
      // Session check is best-effort; the flow still renders.
    }
  }
  if (alreadySignedIn && mode !== "update-password") {
    redirect("/onboarding");
  }

  const derivedStatus = !configured ? "env-missing" : rawStatus;
  const status =
    derivedStatus && derivedStatus in authStatusMessages
      ? (derivedStatus as AuthStatusKey)
      : undefined;
  const notice = status ? authStatusMessages[status] : undefined;

  return (
    <AuthShell>
      <AuthExperience initialMode={mode} notice={notice} />
    </AuthShell>
  );
}
