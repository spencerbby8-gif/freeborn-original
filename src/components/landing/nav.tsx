"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "@/components/wordmark";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#why-freeborn", label: "Why Freeborn" },
  { href: "#safety", label: "Safety" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={`mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5 transition-all duration-500 sm:px-8 ${
          scrolled
            ? "mt-3 rounded-[28px] border hairline bg-night/80 backdrop-blur-xl"
            : "mt-0 border border-transparent bg-transparent"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
      >
        <Wordmark size="sm" />

        <nav className="hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] font-semibold tracking-wide text-[var(--color-sand)] transition-colors duration-300 hover:text-[var(--color-pearl)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <a
            href="/auth?mode=sign-in"
            className="text-[13px] font-bold tracking-wide text-[var(--color-mist)] transition-colors duration-300 hover:text-[var(--color-pearl)]"
          >
            Sign in
          </a>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-full border hairline text-pearl lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            {open ? (
              <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <path d="M2 5h14M2 9h14M2 13h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="mx-5 mt-2 rounded-[24px] border hairline bg-midnight/95 p-4 backdrop-blur-xl lg:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-sand)] transition-colors hover:bg-pearl/5 hover:text-[var(--color-pearl)]"
              >
                {link.label}
              </a>
            ))}
            <a
              href="/auth?mode=sign-in"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-sand)] transition-colors hover:bg-pearl/5 hover:text-[var(--color-pearl)]"
            >
              Sign in
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
