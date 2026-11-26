"use client";

import { Button } from "@/components/ui/button";

import Link from "next/link";
import { clearSecurityCheckCache } from "@/lib/auth/security-check-cache";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmailCodeScreen } from "./email-code-screen";
import { AuthInput } from "./auth-input";
import { PasswordStrength } from "./password-strength";
import { GoogleGlyph } from "@/components/icons";
import { createSupabaseBrowserClient, isWebSupabaseConfigured } from "@/lib/supabase/browser";
import { getAuthErrorMessage } from "@/lib/auth/messages";
import { signupOutcome, EXISTING_ACCOUNT_MESSAGE } from "@/lib/auth/signup-outcome";
import { getBaseUrl } from "@/lib/auth/url";
import { showToast } from "@/components/toast-host";
import { AUTH_ENTRY_COPY, queueAuthEntry, type AuthEntryKind, type AuthEntryTarget } from "@/lib/auth/entry-toast";
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



function friendlyError(error: unknown): string {
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  if (msg.includes("already registered") || msg.includes("already been registered"))
    return "An account already exists for this email. Switch to the Sign in tab.";
  /* A spent or server-rejected Turnstile token must never read as a credentials
     problem: the password was fine, the human check simply expired between the
     tick and the submit (slow connections, long form fills). */
  if (msg.includes("captcha") || msg.includes("turnstile") || msg.includes("human check"))
    return "The human check expired before we could use it. Tick the box once more, then continue.";
  /* GoTrue answers both "unknown email" and "wrong password" with the same
     text, on purpose, so this wording must not confirm that an account exists.
     The nudge covers the real-world case behind most such reports: an account
     created long ago (or re-created recently, which replaces the password). */
  if (msg.includes("invalid login credentials"))
    return "That email and password don't match our records. If the account is older — or was recently created again — the password reset below takes one email.";
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
  const [codeStep, setCodeStep] = useState<{ email: string } | null>(null);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

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
  const enterAfterAuth = async (kind: AuthEntryKind) => {
    clearSecurityCheckCache();
    let memberId: string | undefined;
    const navigate = (target: AuthEntryTarget) => {
      // A fixed event identifier and account-scoping ID cross the full-page navigation;
      // no token, email address, name or user-authored text is stored.
      // If storage is unavailable, auth must still proceed; show immediate feedback instead.
      if (!memberId || !queueAuthEntry(kind, memberId, target)) showToast(AUTH_ENTRY_COPY[kind]);
      window.location.assign(target);
    };
    try {
      if (supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        memberId = session?.user?.id;
        if (token) {
          const res = await fetch("/api/onboarding/state", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const json = (await res.json()) as { completed?: boolean };
            navigate(json.completed ? "/app" : "/onboarding");
            return;
          }
        }
      }
    } catch {
      /* fall back to onboarding */
    }
    navigate("/onboarding");
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
        if (error) {
          /* Account exists but the email was never confirmed: take them
             straight to the code screen instead of a dead-end message. */
          if (/confirm/i.test(error.message)) {
            setCodeStep({ email });
            setCode("");
            setCodeError(null);
            setPending(null);
            return;
          }
          throw error;
        }
        const { data: check } = await supabase.auth.getUser();
        if (!check?.user) {
          throw new Error(
            "Signed in, but this browser refused to keep the session. Open this page in its own tab and sign in again."
          );
        }
        await enterAfterAuth("signedIn");
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
        const outcome = signupOutcome(data, error);
        if (outcome === "existing-account") {
          setCodeStep(null);
          setCode("");
          setCodeError(null);
          setValues((current) => ({ ...current, password: "" }));
          changeMode("sign-in");
          setErrors({ email: EXISTING_ACCOUNT_MESSAGE });
          showToast({ tone: "error", title: "Account already exists", body: EXISTING_ACCOUNT_MESSAGE });
          setPending(null);
          return;
        }
        if (error) throw error;
        if (outcome === "unavailable") throw new Error("We couldn’t confirm that a new account was created. Please try again, or sign in if you already have an account.");
        if (outcome === "signed-in") {
          await enterAfterAuth("accountCreated");
          return;
        }
        // Email confirmation is required on this project before first sign-in.
        // The confirmation mail carries a 6-digit code; the member types it
        // here instead of chasing a magic link through their inbox.
        setCodeStep({ email });
        setCode("");
        setCodeError(null);
        setValues((current) => ({ ...current, password: "" }));
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
          title: "Check your email",
          body: "If the address is eligible, check your inbox for recovery instructions.",
        });
        setPending(null);
        return;
      }

      // update-password (arrived via the recovery email link)
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
      await enterAfterAuth("passwordUpdated");
    } catch (error) {
      /* A Turnstile token is single-use: once a submit has carried it — success
         or failure — it is spent. Drop it so the remounted widget issues a fresh
         one and the next attempt cannot fail on a dead token. */
      setCaptchaToken(null);
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

  const verifyCode = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!codeStep || codeBusy) return;
    if (!/^\d{6,8}$/.test(code)){setCodeError("Enter the confirmation code from your email.");return;}
    if (!supabase) {
      setCodeError("Service unavailable. Refresh the page and try again.");
      return;
    }
    setCodeBusy(true);
    setCodeError(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: codeStep.email,
        token: code.trim(),
        type: "signup",
      });
      if (error) throw error;
      if (data.session) {
        setCodeStep(null);
        await enterAfterAuth("emailConfirmed");
        return;
      }
      setCodeError("That code didn't complete sign-in. Request a fresh one and try again.");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      setCodeError(
        /expired or is invalid/i.test(raw)
          ? "That code didn't match. Double-check the email and try again."
          : /rate limit|too many/i.test(raw)
            ? "Too many attempts right now. Wait a minute, then try again."
            : raw || "That code didn't match. Check the email and try again."
      );
    } finally {
      setCodeBusy(false);
    }
  };

  const resendCode = async (freshCaptchaToken?: string) => {
    if (!codeStep || codeBusy) return;
    if (!supabase) {
      setCodeError("Service unavailable. Refresh the page and try again.");
      return;
    }
    setCodeBusy(true);
    setCodeError(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: codeStep.email,
        ...(freshCaptchaToken?{options:{captchaToken:freshCaptchaToken}}:{}),
      });
      if (error) throw error;
      showToast({
        tone: "success",
        title: "Check your email",
        body: "If a code was sent, check your inbox for the latest one.",
      });
    } catch {
      setCodeError("Couldn't resend right now. Wait a moment and try again.");
    } finally {
      setCodeBusy(false);
    }
  };

  if (codeStep) return <EmailCodeScreen email={codeStep.email} code={code} onCode={setCode} busy={codeBusy} error={codeError} onVerify={e=>void verifyCode(e)} onResend={resendCode} onBack={()=>{setCodeStep(null);setCode("");setCodeError(null);setMode("sign-up");}}/>;

  if (isAuth) {
    return <section className="screen active" aria-label="Welcome"><div className="scroll welcome-scroll">
      {/* Reference portrait is decorative marketing art, never a member record. */}
      <img className="welcome-bg" src="/images/prototype/welcome.jpg" alt=""/>
      <div className="welcome-shade"/>
      {/* Auth-only restoration: exact SVG path, stroke, dimensions and gradient
          from the supplied welcome reference. Do not substitute BrandMark. */}
      <div className="welcome-logo"><span className="logo-badge" style={{ background: 'linear-gradient(102deg,#f8e7c6 0%,#f4cf9d 42%,#e9a98b 78%,#df93a0 100%)' }}><svg fill="none" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 5z" stroke="#2a1a10" strokeLinecap="round" strokeWidth="1.7"/></svg></span><span className="logo-word">Freeborn</span></div>
      <div className="welcome-content"><p className="welcome-eyebrow">MEET WITH INTENTION</p><h1 className="display welcome-head">Someone worth<br/>staying for.</h1><p className="welcome-sub">Real conversations, shared values, and connections that feel like they were worth the wait.</p></div>
      <div className="auth-card">
        <div className="seg" role="tablist" aria-label="Account access">{switchItems.map(item=><Button unstyled key={item.mode} className={`seg-btn ${mode===item.mode?'active':''}`} role="tab" aria-selected={mode===item.mode} onClick={()=>changeMode(item.mode)}>{item.label}</Button>)}</div>
        {notice&&<p role={notice.tone==='error'?'alert':'status'} className="fb-error">{notice.title}. {notice.body}</p>}
        <form onSubmit={e=>void handleEmailSubmit(e)} noValidate>
          <label className="field"><span>Email address</span><input type="email" autoComplete="email" autoCapitalize="none" value={values.email} onChange={e=>updateField('email',e.target.value)} placeholder="you@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email?'prototype-email-error':undefined}/></label>
          {errors.email&&<p id="prototype-email-error" className="fb-error">{errors.email}</p>}
          <div className="prototype-password"><AuthInput label="Password" name="password" type="password" autoComplete={mode==='sign-in'?'current-password':'new-password'} value={values.password} onChange={e=>updateField('password',e.target.value)} placeholder="••••••••" error={errors.password}/></div>
          {mode==='sign-up'&&values.password&&<PasswordStrength password={values.password}/>}
          {requiresHumanCheck(mode)&&<TurnstileGate key={mode} onToken={setCaptchaToken}/>}
          <Button unstyled className="btn-grad big wide" type="submit" disabled={pending==='email'}>{pending==='email'?submitLabel:'Continue'}</Button>
        </form>
        <div className="auth-divider"><span>or</span></div><Button unstyled className="auth-google" type="button" onClick={()=>void handleGoogle()} disabled={pending!==null}><GoogleGlyph size={19}/>{pending==='google'?'Connecting…':mode==='sign-up'?'Sign up with Google':'Sign in with Google'}</Button><div className="fb-auth-more"><Button unstyled type="button" onClick={()=>changeMode('reset-password')}>Forgot password?</Button></div>
        <p className="fineprint center tight">By continuing, you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>
      </div>
    </div></section>;
  }

  return <section className="screen active" aria-label={mode==='reset-password'?'Reset password':'Choose a new password'}><div className="scroll email-code-scroll">
    <div className="bare-head"><Button unstyled className="bare-icon" onClick={()=>changeMode('sign-in')} aria-label="Back to sign in">←</Button><span className="step-center">SECURE ACCOUNT ACCESS</span><span/></div>
    <p className="email-code-eyebrow" style={{marginTop:48}}>{copy.eyebrow}</p><h1 className="display">{copy.title}</h1><p className="onboard-sub">{copy.description}</p>
    {notice&&<p className="fb-error" role={notice.tone==='error'?'alert':'status'}>{notice.title}. {notice.body}</p>}
    <form className="email-code-form" onSubmit={e=>void handleEmailSubmit(e)} noValidate>
      {mode==='reset-password'?<label className="field"><span>Email address</span><input type="email" autoComplete="email" value={values.email} onChange={e=>updateField('email',e.target.value)} placeholder="you@example.com" aria-invalid={Boolean(errors.email)}/>{errors.email&&<span className="fb-error">{errors.email}</span>}</label>:<div className="prototype-password"><AuthInput label="New password" name="password" type="password" autoComplete="new-password" value={values.password} onChange={e=>updateField('password',e.target.value)} error={errors.password}/><PasswordStrength password={values.password}/></div>}
      {requiresHumanCheck(mode)&&<TurnstileGate key={mode} onToken={setCaptchaToken}/>}
      <Button unstyled type="submit" className="btn-grad big wide" disabled={pending==='email'}>{pending==='email'?'Please wait…':submitLabel}</Button>
      <Button unstyled type="button" className="email-code-change" onClick={()=>changeMode('sign-in')}>Back to sign in</Button>
    </form>
  </div></section>;
}
