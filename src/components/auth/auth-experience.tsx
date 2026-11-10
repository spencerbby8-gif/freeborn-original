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
/* No "confirm password" field. A reveal-password toggle (already built into
   AuthInput) is the modern, lower-friction equivalent: it removes an entire
   error class ("passwords do not match"), removes a step, and takes ~96px off a
   screen that was already forcing people to scroll. */
type Values = { email: string; password: string };
type Errors = Partial<Record<keyof Values, string>>;

const emptyState: Values = { email: "", password: "" };
const switchItems: Array<{ mode: "sign-in" | "sign-up"; label: string }> = [
  { mode: "sign-in", label: "Sign in" },
  { mode: "sign-up", label: "Create account" },
];

/**
 * SINGLE SOURCE OF TRUTH for the human check.
 *
 * Bug this prevents (found live on Production, 2026-11-10): the submit guard
 * required a Turnstile token in EVERY mode, but <TurnstileGate> was rendered
 * only for sign-in/sign-up. On /auth?mode=reset-password the page therefore
 * demanded "complete the human check below" while rendering no check at all and
 * returned early — zero /auth/v1/recover requests were ever sent, so password
 * recovery silently never emailed anyone.
 *
 * Both the guard and the widget now derive from this one predicate, so they
 * cannot drift apart again.
 *
 *  - sign-in / sign-up: challenge (credential stuffing + bulk account creation).
 *  - reset-password:    challenge (it triggers an outbound email = spam vector).
 *  - update-password:   NO challenge. The member arrived through a signed,
 *                       single-use recovery link and already holds a session;
 *                       nothing is emailed, and blocking here would strand them
 *                       at the last step of recovery.
 */
const requiresHumanCheck = (mode: AuthScreenMode): boolean => mode !== "update-password";

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
    /* Hard timeout: a slow/unreachable HIBP must NEVER stall the submit button.
       Fail-open (null) so signup/sign-in never hangs on this external call. */
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    let res: Response;
    try {
      res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, {
        headers: { "Add-Padding": "true" },
        signal: ctl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
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

  /* Server-provided notices (e.g. the post-redirect "check your email" status)
     render inline at the TOP of a long card — off-screen if the user is scrolled
     down. Mirror every notice into the viewport-pinned toast so the outcome is
     always visible without scrolling. */
  useEffect(() => {
    if (!notice) return;
    showToast({
      tone: notice.tone === "error" ? "error" : "success",
      title: notice.title,
      body: notice.body,
    });
  }, [notice]);

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
    /* Drop any token issued for the previous mode; the remounted widget (keyed by
       mode) will supply a fresh one. Prevents submitting a spent token. */
    setCaptchaToken(null);
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
    if (turnstileEnabled() && requiresHumanCheck(mode) && !captchaToken) {
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
        setValues((current) => ({ ...current, password: "" }));
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
        ? "Create your account"
        : mode === "reset-password"
          ? "Reset your password"
          : mode === "update-password"
            ? "Choose a new password"
            : "Welcome back",
    /* Sign-in and sign-up are already self-evident from the tab switcher and the
       field labels, so they get NO marketing paragraph. That paragraph alone was
       126px tall and was the single biggest reason this screen needed scrolling.
       The recovery modes still need one instructional line. */
    description:
      mode === "reset-password"
        ? "We'll email you a secure link to choose a new password."
        : mode === "update-password"
          ? "Set a strong password to finish restoring access."
          : null,
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
      <div className="surface magic-border relative overflow-hidden rounded-[28px] p-5 shadow-[var(--shadow-card-lg)] sm:p-7">
        <div key={mode} className="animate-fade-in">
          {/* Eyebrow as plain micro-type instead of a 51px pill — same brand cue,
              a fraction of the height. */}
          <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.22em] text-[var(--color-sand)]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-gold-500)] shadow-[0_0_10px_rgba(217,167,82,0.5)]" />
            {copy.eyebrow}
          </p>
          <h1
            className="mt-2.5 text-[clamp(1.7rem,6.5vw,2.25rem)] leading-[1.05] tracking-tight text-[var(--color-pearl)]"
            style={{ fontFamily: "var(--font-display-stack)", fontVariationSettings: "'opsz' 144, 'wght' 450" }}
          >
            {copy.title}
          </h1>
          {copy.description ? (
            <p className="mt-2 max-w-[42ch] text-[13.5px] leading-relaxed text-[var(--color-mist)]">
              {copy.description}
            </p>
          ) : null}
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
          <div className="relative mt-5 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
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
                  className={`relative z-10 rounded-xl px-4 py-2.5 text-center text-[14px] font-bold transition-colors duration-300 ${
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
            className="group mt-3 flex h-[50px] w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-[15px] font-bold text-[var(--color-pearl)] transition-all hover:border-white/20 hover:bg-white/[0.08] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GoogleGlyph size={20} />
            {pending === "google" ? "Connecting…" : "Continue with Google"}
          </button>
        ) : null}

        {isAuth ? (
          <div className="my-4 flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--color-ash)]">
            <span className="h-px flex-1 bg-white/5" />
            or use email
            <span className="h-px flex-1 bg-white/5" />
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={(e) => void handleEmailSubmit(e)} noValidate>
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
                enterKeyHint="done"
                placeholder={mode === "sign-in" ? "Enter your password" : "Choose a strong password"}
                value={values.password}
                error={errors.password}
                onChange={(event) => updateField("password", event.target.value)}
              />
              {/* Reserved slot. The strength meter fading in must NOT reflow the
                  page mid-typing — that is exactly what pushed the focused field
                  behind the phone keyboard. Height is identical empty or filled. */}
              {mode !== "sign-in" ? (
                <div className="min-h-[30px]">
                  <PasswordStrength password={values.password} />
                </div>
              ) : null}
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

          {requiresHumanCheck(mode) ? (
            /* key={mode}: a Turnstile token is single-use, so switching tabs must
               mount a fresh widget and issue a fresh token rather than carrying a
               spent one into the next submit. The wrapper reserves min-h-[65px],
               so remounting cannot reflow the page. */
            <TurnstileGate key={mode} onToken={setCaptchaToken} />
          ) : null}

          <button
            type="submit"
            disabled={pending === "email"}
            className="magic-button btn-shine group relative mt-1 flex h-[56px] w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-[var(--color-pearl)] px-5 text-[16px] font-bold text-[var(--color-ink)] shadow-[0_20px_40px_-12px_rgba(251,247,242,0.2)] transition-all hover:-translate-y-px hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {pending === "email" ? <Spinner /> : null}
            {submitLabel}
          </button>
        </form>

        {/* Sign-in / Create-account already have the tab switcher at the top, so a
            second "Already have an account? Sign in" link down here was pure
            duplication - 53px of it. Keep the escape hatch for recovery modes only. */}
        {!isAuth ? (
          <div className="mt-5 text-center text-[14px] font-medium text-[var(--color-mist)]">
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
          </div>
        ) : null}

        {/* One line carrying both the security cue and the community standard,
            instead of two stacked decorative blocks (was 33px + 54px + margins). */}
        <p className="mt-4 flex items-start justify-center gap-1.5 text-[11px] font-medium leading-relaxed text-[var(--color-ash)]">
          <svg className="mt-[2px] shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
            <path d="M8 10.5V7a4 4 0 018 0v3.5" />
          </svg>
          <span>
            Encrypted and private. By continuing you agree to keep Freeborn
            respectful: real photos, honest details.{" "}
            <Link href="/#safety" className="underline decoration-white/20 underline-offset-2 hover:text-[var(--color-sand)]">
              Read the standard
            </Link>
          </span>
        </p>
      </div>
    </div>
  );
}
