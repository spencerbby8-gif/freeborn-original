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

/* ---------------------------------------------------------------------------
   TAB BAR — the approved prototype's four tabs, in its order and with its
   labels: Discover · Likes · Messages · Profile.

   Two routes left the bar in this change and NEITHER was removed:

     /app/chat           now lives under "Messages". The prototype's Messages
                         screen is the conversation list, so the chat route is
                         exactly what that tab opens. Nothing was deleted — the
                         label changed from "Chat" to "Messages" and the route
                         stayed identical.
     /app/notifications  moved to the heart in the top-right of the Discover
                         header, which is where the prototype puts alerts, with
                         its live unread count as the badge. Reached by tapping
                         the heart; the route is unchanged.

   Filtering used to be a fifth nav item ("Filters"). It became a header
   control beside the heart, matching the prototype's disc-head row, and keeps
   opening the same FilterPanel.
   ------------------------------------------------------------------------- */
const tabs = [
  {
    href: "/app",
    label: "Discover",
    key: "discover",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/app/likes",
    label: "Likes",
    key: "likes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 20s-6.8-4.6-9.1-9.5C1.9 7.4 4.6 4.7 7.4 4.7c1.8 0 3.3 1 4.6 2.3 1.3-1.3 2.8-2.3 4.6-2.3 2.8 0 5.5 2.7 4.5 5.8C18.8 15.4 12 20 12 20z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    /* The prototype's third tab is "Messages"; in this app that tab is the chat
       list, so its route is /app/chat and its badge is the message unread count.
       Label, icon and badge position are copied from prototype/index.html. */
    href: "/app/chat",
    label: "Messages",
    key: "messages",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 10h8M8 13.5h5M21 12c0 4-4 7-9 7a9.6 9.6 0 01-4-.8L3 20l1.6-4.2A7.4 7.4 0 013 12c0-4 4-7 9-7s9 3 9 7z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/app/profile",
    label: "Profile",
    key: "my-profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="7.8" r="3.6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.4 20a6.6 6.6 0 0113.2 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

/* The prototype's notification control, copied path-for-path from
   prototype/index.html (#notifBell) so the shape is identical — the brief was
   explicitly "don't edit that icon, leave it as it is". The only thing that
   changes is the badge: in the mock it is the literal string "2", here it is
   the live unread alert count, and the badge is omitted at zero rather than
   showing a false "0". */
export function ProtoHeartIcon({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20s-6.8-4.5-9.2-9.3C1.6 7.7 4.2 4.9 7.2 4.9c1.8 0 3.3.9 4.8 2.4 1.5-1.5 3-2.4 4.8-2.4 3 0 5.6 2.8 4.4 5.8C18.8 15.5 12 20 12 20z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* Discover renders its own header (the prototype's .disc-head), so the shell's
     top bar is suppressed there to avoid two wordmarks and two hearts. The
     Filters control moved into that header, and asks the shell to open the panel
     through this event rather than duplicating the panel's state. */
  useEffect(() => {
    const open = () => setFiltersOpen(true);
    window.addEventListener("freeborn:open-filters", open);
    return () => window.removeEventListener("freeborn:open-filters", open);
  }, []);
  /** True while a chat conversation is open — the bottom tab bar hides. */
  const [threadOpen, setThreadOpen] = useState(false);
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
    href === "/app/notifications" ? unread.alerts : href === "/app/chat" ? unread.chat : href === "/app/likes" ? unread.likes : 0;

  /* The heart shows alert + message unread together, because the prototype has
     a single badge in that corner and a member should not have to open Alerts
     to discover a message is waiting. Capped like the tab dots. */
  const heartCount = unread.alerts + unread.chat;

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
    <div className="app-reborn min-h-[100dvh] bg-[var(--color-night)] text-[var(--color-pearl)]">
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
                      ? "rb-nav-active"
                      : "text-[var(--color-mist)] hover:bg-[rgba(233,195,124,0.06)] hover:text-[var(--color-pearl)]"
                  }`}
                >
                  <span className="relative">
                    {tab.icon}
                    {count > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] px-1 text-[9px] font-black text-[#2a1a10] ring-2 ring-[#151724]">
                        {count > 9 ? "9+" : count}
                      </span>
                    ) : null}
                  </span>
                  {tab.label}
                </Link>
              );
            })}
            <Link
              href="/app/notifications"
              className={`relative flex items-center gap-3 rounded-2xl px-4 py-3 text-[14px] font-bold transition-all ${
                isActive("/app/notifications")
                  ? "rb-nav-active"
                  : "text-[var(--color-mist)] hover:bg-[rgba(233,195,124,0.06)] hover:text-[var(--color-pearl)]"
              }`}
            >
              <span className="relative">
                <ProtoHeartIcon size={19} />
                {heartCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] px-1 text-[9px] font-black text-[#2a1a10] ring-2 ring-[#151724]">
                    {heartCount > 9 ? "9+" : heartCount}
                  </span>
                ) : null}
              </span>
              Notifications
            </Link>
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
          {/* Top bar — the prototype's disc-head row.
              Left: wordmark. Right: the notification heart with its live badge,
              then Filters. The heart replaces the button that used to say
              "Filters" in this corner, because the prototype puts notifications
              top-right and filtering is secondary to knowing someone is waiting.
              Alerts did not lose a home — they moved from a fifth tab into this
              heart, and the badge is the real unread count. */}
          {pathname === "/app" ? null : (
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3 lg:hidden">
            <Link href="/" className="transition hover:opacity-80">
              <Wordmark size="sm" />
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/app/notifications"
                aria-label={
                  heartCount > 0
                    ? `Notifications, ${heartCount} unread`
                    : "Notifications"
                }
                className="relative flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-sand)] transition hover:bg-white/[0.06] hover:text-[var(--color-pearl)]"
              >
                <ProtoHeartIcon size={21} />
                {heartCount > 0 ? (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] px-1 text-[9px] font-black text-[#2a1a10] ring-2 ring-[var(--color-night)]">
                    {heartCount > 9 ? "9+" : heartCount}
                  </span>
                ) : null}
              </Link>
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                aria-label="Open filters"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-sand)] transition hover:text-[var(--color-pearl)]"
              >
                <FiltersIcon />
              </button>
            </div>
          </header>
          )}

          <main className={`flex-1 px-4 pt-6 sm:px-6 ${threadOpen ? "pb-4" : "pb-28"}`}>{children}</main>
        </div>
      </div>

      {/* BOTTOM TAB BAR — the prototype's own .tabbar / .tab markup.
          Copied from prototype/index.html: four tabs in this order, sentence-case
          labels (the previous version uppercased them), 22px icons, and the
          .tab-badge count positioned where the mock puts it. Alerts are not a tab
          — they live in the Discover header heart, as in the reference. */}
      {!threadOpen ? (
        <nav className="tabbar fixed inset-x-0 bottom-0 z-40" aria-label="Primary">
          {tabs.map((tab) => {
            const active = isActive(tab.href);
            const count = dotFor(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                className={`tab${active ? " active" : ""}`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {count > 0 ? <em className="tab-badge">{count > 9 ? "9+" : count}</em> : null}
              </Link>
            );
          })}
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
