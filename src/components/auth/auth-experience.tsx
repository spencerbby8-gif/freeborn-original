"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { AuthInput } from "./auth-input";
import { AuthNotice } from "./auth-notice";
import { PasswordStrength } from "./password-strength";
import { GoogleGlyph } from "@/components/icons";
import { createSupabaseBrowserClient, isWebSupabaseConfigured } from "@/lib/supabase/browser";
import { getAuthErrorMessage } from "@/lib/auth/messages";
import { getBaseUrl } from "@/lib/auth/url";

export type AuthScreenMode =
  | "sign-in"
  | "sign-up"
  | "reset-password"
  | "update-password";

type Notice = { tone: "success" | "error"; title: string; body: string };
type Values = { email: string; password: string; confirmPassword: string };
type Errors = Partial<Record<keyof Values, string>>;

const emptyState: Values = { email: "", password: "", confirmPassword: "" };

const switchItems: Array<{ mode: AuthScreenMode; label: string }> = [
  { mode: "sign-in", label: "Sign in" },
  { mode: "sign-up", label: "Create account" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Spinner() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" className="spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function AuthExperience({
  initialMode,
  notice,
}: {
  initialMode: AuthScreenMode;
  notice?: Notice;
}) {
  const supabase = useMemo(
    () => (isWebSupabaseConfigured ? createSupabaseBrowserClient() : null),
    []
  );

  const [mode, setMode] = useState<AuthScreenMode>(initialMode);
  const [values, setValues] = useState<Values>(emptyState);
  const [errors, setErrors] = useState<Errors>({});
  const [localNotice, setLocalNotice] = useState<Notice | null>(notice ?? null);
  const [pending, setPending] = useState<"email" | "google" | null>(null);

  const isAuth = mode === "sign-in" || mode === "sign-up";

  /**
   * After a successful auth, route by onboarding state: finished members go
   * straight into the app shell (/app, tabs included); everyone else starts
   * (or resumes) onboarding. This avoids flashing the onboarding screen at
   * members who are already done.
   */
  const enterAfterAuth = async () => {
    try {
      if (supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const res = await fetch("/api/onboarding/state", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = (await res.json()) as { completed?: boolean };
            window.location.assign(json.completed ? "/app" : "/onboarding");
            return;
          }
        }
      }
    } catch {
      /* fall back to onboarding */
    }
    window.location.assign("/onboarding");
  };

  const updateField = (field: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const changeMode = (next: AuthScreenMode) => {
    if (next === mode) return;
    setMode(next);
    setErrors({});
    setLocalNotice(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("mode", next);
      url.searchParams.delete("status");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const validate = (): boolean => {
    const next: Errors = {};
    const email = values.email.trim().toLowerCase();

    if (mode !== "update-password" && !EMAIL_PATTERN.test(email)) {
      next.email = "Enter a valid email address.";
    }

    if ((mode === "sign-in") && values.password.length === 0) {
      next.password = "Enter your password.";
    }

    if (mode === "sign-up" || mode === "update-password") {
      if (values.password.length < 8) next.password = "Use at least 8 characters.";
      else if (!/[A-Z]/.test(values.password)) next.password = "Add at least one uppercase letter.";
      else if (!/[a-z]/.test(values.password)) next.password = "Add at least one lowercase letter.";
      else if (!/[0-9]/.test(values.password)) next.password = "Add at least one number.";

      if (values.confirmPassword.length === 0) {
        next.confirmPassword = "Confirm your password.";
      } else if (values.password !== values.confirmPassword) {
        next.confirmPassword = "Passwords do not match.";
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalNotice(null);
    setErrors({});
    if (!validate()) return;
    setPending("email");

    try {
      if (!supabase) throw new Error("service_unavailable");
      const email = values.email.trim().toLowerCase();

      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: values.password,
        });
        if (error) throw error;
        // Verify the session is actually readable before navigating, so a
        // storage problem surfaces here instead of a silent bounce loop.
        const { data: check } = await supabase.auth.getUser();
        if (!check?.user) {
          throw new Error(
            "Signed in, but this browser refused to keep the session. Open this page in its own tab (button top-right) and sign in again."
          );
        }
        await enterAfterAuth();
        return;
      }

      if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: values.password,
          options: {
            emailRedirectTo: `${getBaseUrl()}/auth/callback?next=/onboarding`,
          },
        });
        if (error) throw error;
        if (data.session) {
          // Email confirmation disabled on the project — straight in.
          await enterAfterAuth();
          return;
        }
        setLocalNotice({
          tone: "success",
          title: "Check your inbox",
          body: "We sent a secure confirmation link. Open it in this same browser to activate your Freeborn account — it lands you right back here, signed in. (Check spam if it hides; Supabase limits emails to a few per hour.)",
        });
        setValues((current) => ({ ...current, password: "", confirmPassword: "" }));
        return;
      }

      if (mode === "reset-password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${getBaseUrl()}/auth/callback?next=/auth%3Fmode%3Dupdate-password`,
        });
        if (error) throw error;
        setLocalNotice({
          tone: "success",
          title: "Recovery link sent",
          body: "Open the link from your inbox to choose a new password.",
        });
        return;
      }

      // update-password (arrived via the recovery email link)
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
      setLocalNotice({
        tone: "success",
        title: "Password updated",
        body: "Your account is secured again. Taking you inside.",
      });
      await enterAfterAuth();
    } catch (error) {
      setLocalNotice({
        tone: "error",
        title: "We couldn't finish that",
        body: getAuthErrorMessage(error),
      });
      setPending(null);
    }
  };

  const handleGoogle = async () => {
    setLocalNotice(null);
    setPending("google");
    try {
      if (!supabase) throw new Error("service_unavailable");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${getBaseUrl()}/auth/callback?next=/onboarding`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) throw error;
      // On success Supabase redirects the browser to Google.
    } catch (error) {
      setLocalNotice({
        tone: "error",
        title: "Google sign-in failed",
        body: getAuthErrorMessage(error),
      });
      setPending(null);
    }
  };

  const copy = {
    eyebrow:
      mode === "sign-up"
        ? "Values-aligned and private"
        : mode === "reset-password"
          ? "Account recovery"
          : mode === "update-password"
            ? "Recovery confirmed"
            : "Welcome back",
    title:
      mode === "sign-up"
        ? "Create your Freeborn account"
        : mode === "reset-password"
          ? "Reset your password"
          : mode === "update-password"
            ? "Choose a new password"
            : "Welcome back",
    description:
      mode === "sign-up"
        ? "Start with email, confirm it's really you via the secure link we send, and step into a relationship platform built for health autonomy, natural living, and long-term intention."
        : mode === "reset-password"
          ? "We'll send a secure link so you can set a new password — no stress."
          : mode === "update-password"
            ? "Set a strong password to finish restoring access to your account."
            : "Sign in to pick up where you left off. Your values-forward profile is right where you left it.",
  };

  const submitLabel =
    pending === "email"
      ? mode === "sign-in"
        ? "Signing in…"
        : mode === "sign-up"
          ? "Creating account…"
          : mode === "reset-password"
            ? "Sending link…"
            : "Updating password…"
      : mode === "sign-in"
        ? "Sign in"
        : mode === "sign-up"
          ? "Create account"
          : mode === "reset-password"
            ? "Send reset link"
            : "Update password";

  return (
    <div className="w-full max-w-[480px]">
      <div className="surface magic-border relative overflow-hidden rounded-[40px] p-8 shadow-[var(--shadow-card-lg)] sm:p-10">
        <div key={mode} className="animate-fade-in">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-sand)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-gold-500)] shadow-[0_0_10px_rgba(217,167,82,0.5)]" />
            {copy.eyebrow}
          </div>
          <h1
            className="mt-6 text-[clamp(2.25rem,6vw,3rem)] leading-[0.95] tracking-tight text-[var(--color-pearl)]"
            style={{ fontFamily: "var(--font-display-stack)", fontVariationSettings: "'opsz' 144, 'wght' 450" }}
          >
            {copy.title}
          </h1>
          <p className="mt-4 max-w-[40ch] text-[16px] leading-relaxed text-[var(--color-mist)]">
            {copy.description}
          </p>
        </div>

        {localNotice ? (
          <div className="mt-6">
            <AuthNotice {...localNotice} />
          </div>
        ) : null}

        {isAuth ? (
          <div className="relative mt-8 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
            <span
              className="absolute inset-y-1.5 w-[calc(50%-6px)] rounded-xl bg-[var(--gradient-ember-warm)] shadow-[0_8px_20px_-8px_rgba(239,94,94,0.8)] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
              style={{ left: mode === "sign-up" ? "calc(50% + 1.5px)" : "4.5px" }}
              aria-hidden
            />
            {switchItems.map((item) => {
              const active = item.mode === mode;
              return (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() => changeMode(item.mode)}
                  className={`relative z-10 rounded-xl px-4 py-3 text-center text-[14px] font-bold transition-colors duration-300 ${
                    active ? "text-white" : "text-[var(--color-mist)] hover:text-[var(--color-pearl)]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {isAuth ? (
          <button
            type="button"
            onClick={handleGoogle}
            disabled={pending !== null}
            className="group mt-6 flex h-[56px] w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-[15px] font-bold text-[var(--color-pearl)] transition-all hover:border-white/20 hover:bg-white/[0.08] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleGlyph size={20} />
            {pending === "google" ? "Connecting…" : "Continue with Google"}
          </button>
        ) : null}

        {isAuth ? (
          <div className="my-8 flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--color-ash)]">
            <span className="h-px flex-1 bg-white/5" />
            or use email
            <span className="h-px flex-1 bg-white/5" />
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleEmailSubmit} noValidate>
          {mode !== "update-password" ? (
            <AuthInput
              id="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="you@example.com"
              value={values.email}
              error={errors.email}
              onChange={(event) => updateField("email", event.target.value)}
            />
          ) : null}

          {mode !== "reset-password" ? (
            <div className="space-y-2">
              <AuthInput
                id="password"
                label={mode === "update-password" ? "New password" : "Password"}
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                placeholder={mode === "sign-in" ? "Enter your password" : "Choose a strong password"}
                value={values.password}
                error={errors.password}
                onChange={(event) => updateField("password", event.target.value)}
              />
              {mode === "sign-in" ? (
                <div className="flex justify-end px-1">
                  <button
                    type="button"
                    onClick={() => changeMode("reset-password")}
                    className="text-[13px] font-bold text-[var(--color-sand)] transition-colors hover:text-[var(--color-pearl)]"
                  >
                    Forgot password?
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === "sign-up" || mode === "update-password" ? (
            <div className="space-y-6">
              {mode === "sign-up" ? <PasswordStrength password={values.password} /> : null}
              <AuthInput
                id="confirmPassword"
                label={mode === "update-password" ? "Confirm new password" : "Confirm password"}
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={values.confirmPassword}
                error={errors.confirmPassword}
                onChange={(event) => updateField("confirmPassword", event.target.value)}
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={pending !== null}
            className="magic-button btn-shine group relative mt-2 flex h-[60px] w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-[var(--color-pearl)] px-5 text-[16px] font-bold text-[var(--color-ink)] shadow-[0_20px_40px_-12px_rgba(251,247,242,0.2)] transition-all hover:-translate-y-px hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {pending === "email" ? <Spinner /> : null}
            {submitLabel}
          </button>
        </form>

        <div className="mt-8 text-center text-[14px] font-medium text-[var(--color-mist)]">
          {mode === "sign-in" ? (
            <p>
              New to Freeborn?{" "}
              <button
                type="button"
                onClick={() => changeMode("sign-up")}
                className="font-bold text-[var(--color-pearl)] underline decoration-white/20 underline-offset-4 transition-all hover:decoration-white/60"
              >
                Create your account
              </button>
            </p>
          ) : null}
          {mode === "sign-up" ? (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => changeMode("sign-in")}
                className="font-bold text-[var(--color-pearl)] underline decoration-white/20 underline-offset-4 transition-all hover:decoration-white/60"
              >
                Sign in
              </button>
            </p>
          ) : null}
          {mode === "reset-password" || mode === "update-password" ? (
            <p>
              Remembered it?{" "}
              <button
                type="button"
                onClick={() => changeMode("sign-in")}
                className="font-bold text-[var(--color-pearl)] underline decoration-white/20 underline-offset-4 transition-all hover:decoration-white/60"
              >
                Back to sign in
              </button>
            </p>
          ) : null}
        </div>

        <p className="mt-6 text-center text-[11px] font-medium leading-relaxed text-[var(--color-ash)]">
          By continuing you agree to keep Freeborn respectful: real photos, honest
          details, and health autonomy honored.{" "}
          <Link href="/#safety" className="underline decoration-white/20 underline-offset-2 hover:text-[var(--color-sand)]">
            Read the standard
          </Link>
        </p>
      </div>
    </div>
  );
}
