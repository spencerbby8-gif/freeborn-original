"use client";

/**
 * Cloudflare Turnstile gate — research winner over reCAPTCHA: free,
 * invisible, no puzzles, privacy-friendly (no Google telemetry), and
 * Supabase accepts its token directly as captchaToken.
 *
 * Activates only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; without it the
 * auth flow works exactly as before (feature-flagged, zero breakage).
 */

import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

export function turnstileEnabled(): boolean {
  return Boolean(SITE_KEY);
}

export function TurnstileGate({ onToken }: { onToken: (token: string | null) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!SITE_KEY) return;

    let cancelled = false;
    const mount = () => {
      if (cancelled || !hostRef.current || widgetRef.current || !window.turnstile) return;
      widgetRef.current = window.turnstile.render(hostRef.current, {
        sitekey: SITE_KEY,
        theme: "dark",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };

    if (window.turnstile) {
      mount();
      setLoaded(true);
    } else {
      const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      const script = existing ?? document.createElement("script");
      if (!existing) {
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        script.async = true;
        script.defer = true;
        script.setAttribute("data-turnstile", "1");
        document.head.appendChild(script);
      }
      script.addEventListener("load", () => {
        if (!cancelled) {
          mount();
          setLoaded(true);
        }
      });
    }

    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetRef.current);
        } catch {
          /* gone */
        }
        widgetRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;

  return (
    <div className="flex min-h-[65px] items-center justify-center">
      <div ref={hostRef} className="cf-turnstile" />
      {!loaded ? <p className="text-[11px] text-[var(--color-ash)]">Loading human check…</p> : null}
    </div>
  );
}
