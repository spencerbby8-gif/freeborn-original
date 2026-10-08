"use client";

import { useEffect, useState } from "react";

/**
 * Freeborn global popup toasts.
 *
 * Every important notice (auth errors, saves, failures) surfaces here as a
 * fixed popup at the top of the viewport — visible no matter where the page
 * is scrolled or whether the mobile keyboard is open. Fire one from any
 * client component:
 *
 *   showToast({ tone: "error", title: "Couldn't sign in", body: "..." });
 */

export type ToastTone = "success" | "error" | "info";
export type ToastInput = { tone: ToastTone; title: string; body?: string };
type Toast = ToastInput & { id: number };

const EVENT = "freeborn:toast";

export function showToast(input: ToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastInput>(EVENT, { detail: input }));
}

const TONE_STYLES: Record<ToastTone, { ring: string; icon: string; bar: string }> = {
  error: {
    ring: "border-[#ff8d9b]/40",
    icon: "bg-[#ff6b7a]/15 text-[#ff9aa6]",
    bar: "bg-[#ff6b7a]",
  },
  success: {
    ring: "border-[var(--color-teal-500)]/40",
    icon: "bg-[var(--color-teal-500)]/15 text-[var(--color-teal-300)]",
    bar: "bg-[var(--color-teal-300)]",
  },
  info: {
    ring: "border-[var(--color-gold-500)]/40",
    icon: "bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)]",
    bar: "bg-[var(--color-gold-500)]",
  },
};

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastInput>).detail;
      if (!detail?.title) return;
      const id = ++seq;
      setToasts((current) => [...current.slice(-2), { ...detail, id }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== id));
      }, 5200);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[400] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const s = TONE_STYLES[t.tone];
        return (
          <div
            key={t.id}
            role="alert"
            className={`fb-toast-in pointer-events-auto flex w-full max-w-[420px] items-start gap-3 overflow-hidden rounded-2xl border ${s.ring} bg-[#10141f]/95 p-3.5 pr-4 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md`}
          >
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.icon}`}>
              {t.tone === "error" ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
                  <path d="M12 8v5M12 16.5h.01" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              ) : t.tone === "success" ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4.5 12.5l5 5L19.5 7" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 7.5h.01" />
                </svg>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-black leading-tight text-[var(--color-pearl)]">{t.title}</p>
              {t.body ? (
                <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-mist)]">{t.body}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setToasts((current) => current.filter((x) => x.id !== t.id))}
              aria-label="Dismiss notification"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[var(--color-mist)] transition hover:bg-white/[0.12] hover:text-[var(--color-pearl)]"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
