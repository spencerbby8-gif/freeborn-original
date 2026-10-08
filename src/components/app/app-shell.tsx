"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Wordmark } from "@/components/wordmark";
import { FilterPanel } from "./filter-panel";
import { VerifyGate } from "./verify-modal";
import { CallListener } from "./call-listener";
import { NotificationCenter } from "./notification-center";

const tabs = [
  {
    href: "/app",
    label: "Discover",
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2.5l2.1 4.9 5.3.5-4 3.6 1.2 5.2-4.6-2.8-4.6 2.8 1.2-5.2-4-3.6 5.3-.5L12 2.5z" />
      </svg>
    ),
  },
  {
    href: "/app/likes",
    label: "Likes",
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z" />
      </svg>
    ),
  },
  {
    href: "/app/chat",
    label: "Chat",
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 11.5a8.4 8.4 0 01-8.5 8.3 8.8 8.8 0 01-3.7-.8L3 20.5l1.5-5.2a8.1 8.1 0 01-1-3.9A8.4 8.4 0 0112 3.2a8.4 8.4 0 019 8.3z" />
      </svg>
    ),
  },
  {
    href: "/app/notifications",
    label: "Alerts",
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M18 8.4a6 6 0 10-12 0c0 6.6-2.7 8.4-2.7 8.4h17.4S18 15 18 8.4z" />
        <path d="M13.7 20a2 2 0 01-3.4 0" />
      </svg>
    ),
  },
  {
    href: "/app/profile",
    label: "Profile",
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
      </svg>
    ),
  },
];

function FiltersIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Unread dots — fed live by the NotificationCenter. */
  const [unread, setUnread] = useState<{ alerts: number; chat: number; likes: number }>({
    alerts: 0,
    chat: 0,
    likes: 0,
  });

  useEffect(() => {
    /* Merge, don't clobber: partial events (e.g. "you're viewing this tab,
       its dot is zero") must not erase the other tabs' real counts. */
    const onUnread = (e: Event) => {
      const d = (e as CustomEvent<{ alerts?: number; chat?: number; likes?: number }>).detail;
      if (!d) return;
      setUnread((prev) => ({
        alerts: d.alerts ?? prev.alerts,
        chat: d.chat ?? prev.chat,
        likes: d.likes ?? prev.likes,
      }));
    };
    window.addEventListener("freeborn:unread", onUnread);
    window.addEventListener("freeborn:viewing", onUnread);
    return () => {
      window.removeEventListener("freeborn:unread", onUnread);
      window.removeEventListener("freeborn:viewing", onUnread);
    };
  }, []);

  const dotFor = (href: string): number =>
    href === "/app/notifications" ? unread.alerts : href === "/app/chat" ? unread.chat : href === "/app/likes" ? unread.likes : 0;

  useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          window.location.replace("/auth?mode=sign-in");
          return;
        }

        /* Render IMMEDIATELY — the door check runs alongside, never blocking
           the screen. Cached for 10 minutes so tab switches stay instant. */
        setEmail(user.email ?? null);
        setChecking(false);

        /* Presence heartbeat — truthful Active status for everyone. */
        const beat = () => {
          void (async () => {
            try {
              const t = (await supabase.auth.getSession()).data.session?.access_token;
              await fetch("/api/heartbeat", {
                method: "POST",
                headers: t ? { Authorization: `Bearer ${t}` } : {},
              }).catch(() => undefined);
            } catch {
              /* presence is best-effort */
            }
          })();
        };
        beat();
        window.setInterval(beat, 4 * 60 * 1000);

        try {
          const cachedAt = Number(window.sessionStorage.getItem("fb-security-checked") ?? "0");
          if (Date.now() - cachedAt < 10 * 60 * 1000) return;
          const token = (await supabase.auth.getSession()).data.session?.access_token;
          const res = await fetch("/api/security/check", {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            window.sessionStorage.setItem("fb-security-checked", String(Date.now()));
            const verdict = await res.json();
            if (verdict.suspended) {
              await supabase.auth.signOut().catch(() => undefined);
              window.location.replace("/auth?mode=sign-in&status=suspended");
            }
          }
        } catch {
          /* security intel outage never locks out a real member */
        }
      } catch {
        window.location.replace("/auth?mode=sign-in");
      }
    })();
  }, []);

  if (checking) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--color-night)]">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
        <p className="text-sm font-medium text-[var(--color-mist)]">Opening Freeborn…</p>
      </div>
    );
  }

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  return (
    <div className="min-h-[100dvh] bg-[var(--color-night)] text-[var(--color-pearl)]">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1200px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-[100dvh] w-[240px] shrink-0 flex-col border-r border-white/[0.06] px-4 py-6 lg:flex">
          <Link href="/" className="transition hover:opacity-80">
            <Wordmark size="sm" />
          </Link>
          <nav className="mt-8 flex flex-col gap-1.5">
            {tabs.map((tab) => {
              const active = isActive(tab.href);
              const count = dotFor(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`relative flex items-center gap-3 rounded-2xl px-4 py-3 text-[14px] font-bold transition-all ${
                    active
                      ? "bg-[var(--gradient-ember-warm)] text-white shadow-[var(--shadow-primary-btn)]"
                      : "text-[var(--color-mist)] hover:bg-white/[0.05] hover:text-[var(--color-pearl)]"
                  }`}
                >
                  <span className="relative">
                    {tab.icon}
                    {count > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] px-1 text-[9px] font-black text-white ring-2 ring-[#0a0d18]">
                        {count > 9 ? "9+" : count}
                      </span>
                    ) : null}
                  </span>
                  {tab.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="mt-2 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-[14px] font-bold text-[var(--color-sand)] transition hover:bg-white/[0.05] hover:text-[var(--color-pearl)]"
            >
              <FiltersIcon />
              Filters
            </button>
          </nav>
          <div className="mt-auto space-y-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-sand)]">
                Your journey
              </p>
              <p className="mt-2 text-[12px] leading-5 text-[var(--color-mist)]">
                Thoughtful profiles, one intention at a time.
              </p>
            </div>
            {email ? <p className="truncate px-1 text-[11px] text-[var(--color-ash)]">{email}</p> : null}
          </div>
        </aside>

        {/* Content column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar: wordmark + filters (sign-out lives in Settings) */}
          <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 lg:hidden">
            <Link href="/" className="transition hover:opacity-80">
              <Wordmark size="sm" />
            </Link>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label="Open filters"
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12px] font-bold text-[var(--color-sand)] transition hover:text-[var(--color-pearl)]"
            >
              <FiltersIcon />
              Filters
            </button>
          </header>

          <main className="flex-1 px-4 pb-28 pt-6 sm:px-6">{children}</main>
        </div>
      </div>

      {/* Bottom tab bar — visible on every screen size */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#0a0d18]/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[560px] items-stretch justify-around">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            const count = dotFor(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-black uppercase tracking-wider transition-colors ${
                  active ? "text-[var(--color-gold-300)]" : "text-[var(--color-ash)]"
                }`}
              >
                <span className="relative">
                  {tab.icon}
                  {count > 0 ? (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] px-1 text-[9px] font-black text-white ring-2 ring-[#0a0d18]">
                      {count > 9 ? "9+" : count}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <FilterPanel open={filtersOpen} onClose={() => setFiltersOpen(false)} />

      {/* Identity verification engine: one gentle invite */}
      <VerifyGate />

      {/* Real incoming calls — rings this device wherever the member is */}
      <CallListener />

      {/* Alert banners + chime + unread dots, live */}
      <NotificationCenter pathname={pathname} />
    </div>
  );
}
