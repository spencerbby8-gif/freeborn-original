"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Wordmark } from "@/components/wordmark";

/**
 * Landing target for every Supabase email link (confirm email, magic link,
 * password recovery) and OAuth bounce. Tries a PKCE exchange in the browser
 * first (localStorage-based — works without cookies), then a server-side
 * cookie exchange as fallback. No silent failures: the screen explains.
 */
export default function CallbackPage() {
  const ran = useRef(false);
  const [status, setStatus] = useState<"working" | "failed">("working");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const next = params.get("next") || "/onboarding";

      // Google / Supabase bounce back with ?error=… when something blocked
      // the flow (cancelled popup, unregistered redirect URL, denied scope).
      const errorParam = params.get("error");
      if (errorParam) {
        const desc = params.get("error_description") || params.get("error_message") || "";
        setReason(
          errorParam === "access_denied"
            ? "The Google sign-in was cancelled or blocked before it could finish."
            : desc || `Google sign-in stopped (${errorParam}).`
        );
        setStatus("failed");
        return;
      }

      const supabase = createSupabaseBrowserClient();

      // 1) Already have a live session? Straight through.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        window.location.replace(next);
        return;
      }

      if (code) {
        // 2) PKCE exchange — works if signup happened in this browser storage.
        const hasVerifier = Object.keys(localStorage).some((k) =>
          k.includes("code-verifier")
        );
        if (hasVerifier) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            window.location.replace(next);
            return;
          }
        }

        // 3) Server-side exchange (cookie session) as fallback.
        try {
          const res = await fetch("/api/auth/callback-exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          const json = await res.json();
          if (json.ok) {
            window.location.replace(next);
            return;
          }
        } catch {
          // fall through to failure state
        }
      }

      setStatus("failed");
    })();
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 bg-[var(--color-night)] px-6 text-[var(--color-pearl)]">
      <Wordmark size="lg" />
      {status === "working" ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
          <p className="text-sm font-medium text-[var(--color-mist)]">
            Confirming your secure link…
          </p>
        </div>
      ) : (
        <div className="max-w-md rounded-[28px] border border-white/10 bg-white/[0.03] p-8 text-center">
          <h1 className="text-xl font-black">That sign-in couldn&apos;t finish</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-mist)]">
            {reason ??
              "Secure links and codes are one-time and expire. Go back and request a fresh code — it signs you in the moment you enter it."}
          </p>
          <a
            href="/auth?mode=sign-in&status=link-invalid"
            className="btn-ember mt-6 inline-flex rounded-full px-7 py-3 text-sm font-bold"
          >
            Back to sign in
          </a>
        </div>
      )}
    </div>
  );
}
