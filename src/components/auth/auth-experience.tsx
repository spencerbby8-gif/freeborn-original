"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AuthInput } from "./auth-input";
import { PasswordStrength } from "./password-strength";
import { GoogleGlyph } from "@/components/icons";
import { createSupabaseBrowserClient, isWebSupabaseConfigured } from "@/lib/supabase/browser";
import { getAuthErrorMessage } from "@/lib/auth/messages";
import { getBaseUrl } from "@/lib/auth/url";
import { showToast } from "@/components/toast-host";
import { TurnstileGate, turnstileEnabled } from "./turnstile";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export type AuthScreenMode =
  | "sign-in"
  | "sign-up"
  | "reset-password"
  | "update-password";

type Notice = { tone: "success" | "error"; title: string; body: string };
type Values = { email: string; password: string; confirmPassword: string };
type Errors = Partial<Record<keyof Values, string>>;

const emptyState: Values = { email: "", password: "", confirmPassword: "" };
const switchItems: Array<{ mode: "sign-in" | "sign-up"; label: string }> = [
  { mode: "sign-in", label: "Sign in" },
  { mode: "sign-up", label: "Create account" },
];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * F9: client-side Have I Been Pwned check using the k-anonymity range API.
 * Only the first 5 characters of the SHA-1 hash ever leave the browser.
 * Returns null when the service is unreachable (fail-open) so signup never
 * breaks on a network error; a hit returns true and is rejected.
 */
async function isPwnedPassword(password: string): Promise<boolean | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return null;
    const body = await res.text();
    return body
      .split("\n")
      .some((line) => line.split(":")[0]?.trim().toUpperCase() === hex.slice(5));
  } catch {
    return null;
  }
}

function Spinner() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" className="spin" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function friendlyError(error: unknown): string {
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  if (msg.includes("already registered") || msg.includes("already been registered"))
    return "An account already exists for this email. Switch to the Sign in tab.";
  return getAuthErrorMessage(error);
}

/**
 * Freeborn auth — email + password, the classic way:
 *  - Sign in: email + password.
 *  - Create account: email + password (+ confirm, strength meter).
 *  - Google stays one tap.
 *
 * Hardened against the "stuck loading" bug: the email form is NEVER disabled
 * by the Google button, and coming back from Google (back button, back/forward
 * cache) always resets any stale "Connecting…" state.
 *
 * Every result surfaces as a popup toast pinned at the top of the screen.
 */
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
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  /** Turnstile human-check token (active only when the site key is set). */
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  /* Coming back from the Google redirect (including the browser's back/forward
     cache) must never leave a stale "Connecting…" spinner on the screen. */
  useEffect(() => {
    const clearStaleGoogle = () => setPending((p) => (p === "google" ? null : p));
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) clearStaleGoogle();
      else clearStaleGoogle();
    };
    const onVisibility = () => {
      if (!document.hidden) clearStaleGoogle();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /** Route by onboarding state after any successful auth. */
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
    if (mode !== "update-password" && !EMAIL_PATTERN.test(email)) next.email = "Enter a valid email address.";
    if (mode === "sign-in" && values.password.length === 0) next.password = "Enter your password.";
    if (mode === "sign-up" || mode === "update-password") {
      if (values.password.length < MIN_PASSWORD_LENGTH)
        next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
      else if (!/[A-Z]/.test(values.password)) next.password = "Add at least one uppercase letter.";
      else if (!/[a-z]/.test(values.password)) next.password = "Add at least one lowercase letter.";
      else if (!/[0-9]/.test(values.password)) next.password = "Add at least one number.";
      if (values.confirmPassword.length === 0) next.confirmPassword = "Confirm your password.";
      else if (values.password !== values.confirmPassword) next.confirmPassword = "Passwords do not match.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /* --- Email + password ------------------------------------------------------ */

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    if (pending === "email") return;
    if (!validate()) return;
    if (turnstileEnabled() && !captchaToken) {
      showToast({
        tone: "error",
        title: "One quick check first",
        body: "Complete the human check below, then continue.",
      });
      return;
    }
    // F9: reject breached passwords before creating or changing one.
    if (mode === "sign-up" || mode === "update-password") {
      const pwned = await isPwnedPassword(values.password);
      if (pwned === true) {
        const msg = "This password appeared in a known data breach. Choose a unique one.";
        setErrors({ password: msg });
        showToast({ tone: "error", title: "Choose a different password", body: msg });
        return;
      }
    }
    setPending("email");
    const email = values.email.trim().toLowerCase();

    try {
      if (!supabase) throw new Error("service_unavailable");

      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: values.password,
          options: captchaToken ? { captchaToken } : undefined,
        });
        if (error) throw error;
        const { data: check } = await supabase.auth.getUser();
        if (!check?.user) {
          throw new Error(
            "Signed in, but this browser refused to keep the session. Open this page in its own tab and sign in again."
          );
        }
        showToast({ tone: "success", title: "You're in", body: "Welcome back to Freeborn." });
        await enterAfterAuth();
        return;
      }

      if (mode === "sign-up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: values.password,
          options: {
            emailRedirectTo: `${getBaseUrl()}/auth/callback?next=/onboarding`,
            ...(captchaToken ? { captchaToken } : {}),
          },
        });
        if (error) throw error;
        if (data.session) {
          showToast({ tone: "success", title: "Account created", body: "Welcome to Freeborn. Let's build your profile." });
          await enterAfterAuth();
          return;
        }
        // Email confirmation is required on this project before first sign-in.
        showToast({
          tone: "success",
          title: "One last step",
          body: `We sent a confirmation email to ${email}. Open it once, then come back and sign in with your password.`,
        });
        setValues((current) => ({ ...current, password: "", confirmPassword: "" }));
        setMode("sign-in");
        setPending(null);
        return;
      }

      if (mode === "reset-password") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${getBaseUrl()}/auth/callback?next=/auth%3Fmode%3Dupdate-password`,
        });
        if (error) throw error;
        showToast({
          tone: "success",
          title: "Recovery email sent",
          body: "Open the link from your inbox to choose a new password.",
        });
        setPending(null);
        return;
      }

      // update-password (arrived via the recovery email link)
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
      showToast({
        tone: "success",
        title: "Password updated",
        body: "Your account is secured again. Taking you inside.",
      });
      await enterAfterAuth();
    } catch (error) {
      showToast({ tone: "error", title: "We couldn't finish that", body: friendlyError(error) });
      setPending(null);
    }
  };

  /* --- Google --------------------------------------------------------------------- */

  const handleGoogle = async () => {
    if (pending === "google") return;
    setPending("google");
    try {
      if (!supabase) throw new Error("service_unavailable");
      const origin = typeof window !== "undefined" ? window.location.origin : getBaseUrl();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=/onboarding`,
          queryParams: { prompt: "select_account" },
          ...(captchaToken ? { captchaToken } : {}),
        },
      });
      if (error) throw error;
      // On success Supabase redirects the browser to Google. If you come back
      // here (cancel, back button), the pageshow/visibility listeners above
      // clear the "Connecting…" state so nothing is stuck.
    } catch (error) {
      showToast({ tone: "error", title: "Google sign-in failed", body: friendlyError(error) });
      setPending(null);
    }
  };

  /* --- Copy ------------------------------------------------------------------------- */

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
        ? "Choose an email and a strong password, then step into a relationship platform built for health autonomy, natural living, and long-term intention."
        : mode === "reset-password"
          ? "We'll send a secure link so you can set a new password. No stress."
          : mode === "update-password"
            ? "Set a strong password to finish restoring access to your account."
            : "Sign in to pick up where you left off. Your values-forward profile is right where you left it.",
  };

  const isAuth = mode === "sign-in" || mode === "sign-up";
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
      <div className="surface magic-border relative overflow-hidden rounded-[40px] p-7 shadow-[var(--shadow-card-lg)] sm:p-10">
        <div key={mode} className="animate-fade-in">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-sand)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-gold-500)] shadow-[0_0_10px_rgba(217,167,82,0.5)]" />
            {copy.eyebrow}
          </div>
          <h1
            className="mt-6 text-[clamp(2.1rem,5.5vw,2.9rem)] leading-[1.02] tracking-tight text-[var(--color-pearl)]"
            style={{ fontFamily: "var(--font-display-stack)", fontVariationSettings: "'opsz' 144, 'wght' 450" }}
          >
            {copy.title}
          </h1>
          <p className="mt-4 max-w-[40ch] text-[15.5px] leading-relaxed text-[var(--color-mist)]">
            {copy.description}
          </p>
        </div>

        {notice ? (
          notice.tone === "error" ? (
            <div className="mt-5 rounded-2xl border border-red-400/45 bg-red-500/10 px-4 py-3.5">
              <p className="flex items-center gap-2 text-[13px] font-black text-red-300">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
                  <path d="M12 8v5M12 16.5h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                {notice.title}
              </p>
              <p className="mt-1.5 text-[12.5px] font-semibold leading-relaxed text-red-200/85">{notice.body}</p>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[12.5px] font-semibold leading-relaxed text-[var(--color-mist)]">
              <span className="text-[var(--color-pearl)]">{notice.title}.</span> {notice.body}
            </p>
          )
        ) : null}

        {/* Tabs: Sign in / Create account */}
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
            onClick={() => void handleGoogle()}
            disabled={pending === "google"}
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

        <form className="space-y-6" onSubmit={(e) => void handleEmailSubmit(e)} noValidate>
          {mode !== "update-password" ? (
            <AuthInput
              id="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
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
                enterKeyHint={mode === "sign-in" ? "done" : "next"}
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
                enterKeyHint="done"
                placeholder="Repeat your password"
                value={values.confirmPassword}
                error={errors.confirmPassword}
                onChange={(event) => updateField("confirmPassword", event.target.value)}
              />
            </div>
          ) : null}

          {mode === "sign-in" || mode === "sign-up" ? (
            <TurnstileGate onToken={setCaptchaToken} />
          ) : null}

          <button
            type="submit"
            disabled={pending === "email"}
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

        <div className="mt-5 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ash)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
            <path d="M8 10.5V7a4 4 0 018 0v3.5" />
          </svg>
          Encrypted · private · yours alone
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
