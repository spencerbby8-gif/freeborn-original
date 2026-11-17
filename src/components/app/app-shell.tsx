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
import {
  BellIcon,
  ChatIcon,
  DiscoverMark,
  HeartIcon,
  ProfileIcon,
} from "@/components/ui/line-icons";

/**
 * The four destinations, in the order the reference shows them. The reference's
 * fourth tab is Profile; Freeborn's alert centre has no home in that set, so it
 * moves onto the Discover header as the bell — which is where a member looks for
 * it anyway — and the Profile tab is restored to the end of the bar.
 */
const tabs = [
  { href: "/app", label: "Discover", Icon: DiscoverMark, size: 24 },
  { href: "/app/likes", label: "Likes", Icon: HeartIcon, size: 22 },
  { href: "/app/chat", label: "Messages", Icon: ChatIcon, size: 22 },
  { href: "/app/profile", label: "Profile", Icon: ProfileIcon, size: 22 },
] as const;

function FiltersIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** True while a chat conversation is open — the bottom tab bar hides. */
  const [threadOpen, setThreadOpen] = useState(false);
  /** Unread counts — fed live by the NotificationCenter. */
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

  /* The chat screen hides the bottom tabs while a conversation is open and
     brings them back when you return to the message list. */
  useEffect(() => {
    const onThread = (e: Event) => {
      const d = (e as CustomEvent<{ open?: boolean }>).detail;
      if (d) setThreadOpen(Boolean(d.open));
    };
    window.addEventListener("freeborn:chat-thread", onThread);
    return () => window.removeEventListener("freeborn:chat-thread", onThread);
  }, []);

  const dotFor = (href: string): number =>
    href === "/app/chat" ? unread.chat : href === "/app/likes" ? unread.likes : 0;

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
      <div className="fb-sr flex min-h-[100dvh] flex-col items-center justify-center gap-4">
        <span className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-[#ffb894] border-t-transparent" />
        <p className="text-sm font-medium text-[var(--sr-mist)]">Opening Freeborn…</p>
      </div>
    );
  }

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
  /**
   * Discover supplies its own header (eyebrow, serif headline, count disc), so
   * the shell's mobile bar — wordmark, bell, filters — is not drawn there. The
   * filter drawer still opens from the room chips above the card.
   */
  const isDiscover = pathname === "/app";

  return (
    <div className={`fb-sr ${isDiscover ? "fb-sr-phone" : ""} min-h-[100dvh]`}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1240px]">
        {/* Desktop sidebar — same four destinations, the reference's order. */}
        <aside className="sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 flex-col border-r border-white/[0.05] px-4 py-7 lg:flex">
          <Link href="/" className="transition hover:opacity-80">
            <Wordmark size="sm" />
          </Link>
          <nav className="mt-9 flex flex-col gap-1.5">
            {tabs.map((tab) => {
              const active = isActive(tab.href);
              const count = dotFor(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`relative flex items-center gap-3 rounded-2xl px-4 py-3 text-[13.5px] font-semibold transition-all ${
                    active
                      ? "bg-white/[0.07] text-[var(--sr-pearl)] shadow-[0_1px_0_rgba(255,255,255,0.07)_inset]"
                      : "text-[var(--sr-mist)] hover:bg-white/[0.04] hover:text-[var(--sr-pearl)]"
                  }`}
                >
                  <span className="relative flex">
                    <span className="contents">
                      <tab.Icon size={18} {...(tab.href === "/app" ? { active } : {})} />
                    </span>
                    {count > 0 ? (
                      <span className="fb-sr-tab__dot">{count > 9 ? "9+" : count}</span>
                    ) : null}
                  </span>
                  {tab.label}
                  {active ? (
                    <span
                      aria-hidden
                      className="ml-auto h-1.5 w-1.5 rounded-full bg-[linear-gradient(180deg,#ffb894,#f0906a)]"
                    />
                  ) : null}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="mt-2 flex items-center gap-3 rounded-2xl border border-white/[0.07] px-4 py-3 text-[13.5px] font-semibold text-[var(--sr-sand)] transition hover:bg-white/[0.04] hover:text-[var(--sr-pearl)]"
            >
              <FiltersIcon />
              Filters
            </button>
            <Link
              href="/app/notifications"
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-[13.5px] font-semibold text-[var(--sr-mist)] transition hover:bg-white/[0.04] hover:text-[var(--sr-pearl)]"
            >
              <span className="relative flex">
                <BellIcon size={18} />
                {unread.alerts > 0 ? (
                  <span className="fb-sr-tab__dot">{unread.alerts > 9 ? "9+" : unread.alerts}</span>
                ) : null}
              </span>
              Alerts
            </Link>
          </nav>
          <div className="mt-auto space-y-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--sr-sand)]">
                Your journey
              </p>
              <p className="mt-2 text-[12px] leading-5 text-[var(--sr-mist)]">
                Thoughtful profiles, one intention at a time.
              </p>
            </div>
            {email ? <p className="truncate px-1 text-[11px] text-[var(--sr-ash)]">{email}</p> : null}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar. The reference's Discover screen owns its own
              header (eyebrow, title, bell), so the shell contributes only the
              filter entry point — pinned, quiet, and out of the title's way. */}
          <header
            className={`items-center justify-between px-5 pb-0 pt-4 lg:hidden ${
              isDiscover ? "hidden" : "flex"
            }`}
          >
            <Link href="/" className="transition hover:opacity-80">
              <Wordmark size="sm" />
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/app/notifications"
                aria-label="Alerts"
                className="fb-sr-disc fb-sr-bell"
                style={{ width: 40, height: 40 }}
              >
                <span className="relative flex">
                  <BellIcon size={17} />
                  {unread.alerts > 0 ? (
                    <span className="fb-sr-dot" style={{ minWidth: 20, height: 20, fontSize: 11 }}>
                      {unread.alerts > 9 ? "9+" : unread.alerts}
                    </span>
                  ) : null}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                aria-label="Open filters"
                className="fb-sr-disc fb-sr-bell"
                style={{ width: 40, height: 40 }}
              >
                <FiltersIcon />
              </button>
            </div>
          </header>

          <main
            className={
              isDiscover
                ? "flex min-h-0 flex-1 flex-col pb-[117px] pt-0 lg:pb-8"
                : `flex-1 px-5 pt-3 sm:px-7 lg:pt-8 ${threadOpen ? "pb-6" : "pb-24"}`
            }
          >
            {children}
          </main>
        </div>
      </div>

      {/* Bottom tab bar — hidden while a chat conversation is open */}
      {!threadOpen ? (
        <nav className="fb-sr-tabs lg:hidden" aria-label="Main">
          <div className="fb-sr-tabs__row">
            {tabs.map((tab) => {
              const active = isActive(tab.href);
              const count = dotFor(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  className="fb-sr-tab"
                >
                  <span className="fb-sr-tab__icon">
                    <tab.Icon size={tab.size} {...(tab.href === "/app" ? { active } : {})} />
                    {count > 0 ? (
                      <span className="fb-sr-tab__dot">{count > 9 ? "9+" : count}</span>
                    ) : null}
                  </span>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

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
