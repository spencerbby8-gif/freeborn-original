"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "fb-unvax-tip-seen";
const MAX_SHOWS = 2;

/**
 * A small, friendly tip that explains the unvaccinated shield badge.
 * It appears near the badge on the first unvaccinated card, and only
 * shows once or twice in a member's lifetime (tracked in localStorage).
 */
export function UnvaxTip() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let seen = 0;
    try {
      seen = Number(window.localStorage.getItem(STORAGE_KEY) ?? "0");
    } catch {
      seen = MAX_SHOWS;
    }
    if (seen >= MAX_SHOWS) return;

    const showTimer = setTimeout(() => {
      setVisible(true);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(seen + 1));
      } catch {
        /* private mode — just show it */
      }
    }, 1100);

    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const hideTimer = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(hideTimer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="absolute right-0 top-full z-40 mt-2.5 w-[236px] animate-scale-in">
      <div className="relative rounded-2xl border border-[var(--color-gold-500)]/45 bg-[#171204]/95 p-3.5 shadow-[0_18px_50px_-16px_rgba(0,0,0,0.9)] backdrop-blur-md">
        {/* little arrow pointing up at the badge */}
        <span className="absolute -top-[7px] right-5 h-3.5 w-3.5 rotate-45 border-l border-t border-[var(--color-gold-500)]/45 bg-[#171204]" />
        <p className="text-[12px] leading-5 text-[var(--color-ivory)]">
          <span className="font-black text-[var(--color-gold-300)]">The leaf shield</span> is
          Freeborn&apos;s sign that a member identifies as{" "}
          <span className="font-black text-[var(--color-gold-300)]">unvaccinated</span>.
        </p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="mt-2.5 rounded-full border border-[var(--color-gold-500)]/40 bg-[var(--color-gold-500)]/10 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-[var(--color-gold-300)] transition hover:bg-[var(--color-gold-500)]/20"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
