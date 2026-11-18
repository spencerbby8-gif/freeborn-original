"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SCREENS, useScreenParam, type ScreenId } from "./screens";
import { MessagesView, ThreadView } from "./messages-view";
import { NotificationsView } from "./notifications-view";
import { SettingsView } from "./settings-view";
import { FiltersView } from "./filters-view";
import { PremiumView } from "./premium-view";
import { ProfileView } from "./profile-view";
import { LikesView } from "@/components/app/likes-view";
import { LIKES_SEED } from "./likes-seed";
import { DeckCard } from "@/components/app/deck-card";
import { PhotoImage } from "@/components/ui/photo-image";
import { CARD, PEOPLE, type Person } from "./fixtures";
import { ChatIcon, DiscoverMark, HeartIcon, ProfileIcon } from "@/components/ui/line-icons";

/**
 * /preview — the whole product, walkable in a browser.
 *
 * This is not a screenshot gallery. Each of the eight reference screens is
 * rendered by the same component the signed-in app uses, navigated by the real
 * tab bar at the bottom and by tapping through the content. Fixture data stands
 * in for the API so no Supabase session is needed.
 *
 *   /preview                    → Discover
 *   /preview?screen=likes       → People who like you
 *   /preview?screen=messages    → conversation list (opens threads)
 *   /preview?screen=profile     → your profile
 *   /preview?screen=notifications
 *   /preview?screen=settings
 *   /preview?screen=filters
 *   /preview?screen=premium
 */

const TABS = [
  { id: "discover", label: "Discover", Icon: DiscoverMark, size: 25 },
  { id: "likes", label: "Likes", Icon: HeartIcon, size: 24 },
  { id: "messages", label: "Messages", Icon: ChatIcon, size: 24 },
  { id: "profile", label: "Profile", Icon: ProfileIcon, size: 24 },
] as const;

const STATUS_TIME = "9:41";

function StatusBar({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const colour = tone === "light" ? "#1a1410" : "#f7f2ec";
  return (
    <div className="fb-sr-statusbar fb-sr-statusbar--in-phone" aria-hidden>
      <span className="fb-sr-statusbar__time">{STATUS_TIME}</span>
      <span className="fb-sr-statusbar__icons">
        <svg width="17" height="11" viewBox="0 0 18 12" fill={colour}><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" opacity="0.4" /></svg>
        <svg width="16" height="11" viewBox="0 0 16 12" fill={colour}><path d="M8 11.2l2.1-2.4a3.2 3.2 0 00-4.2 0L8 11.2zM8 6.6c1.2 0 2.3.4 3.2 1.2l1.4-1.6A7.1 7.1 0 008 4.3c-1.8 0-3.4.7-4.6 1.9l1.4 1.6A4.8 4.8 0 018 6.6zM8 2c2.2 0 4.2.8 5.7 2.2l1.3-1.5A10 10 0 008 0C5.2 0 2.7 1 1 3l1.3 1.5A8.1 8.1 0 018 2z" /></svg>
        <svg width="24" height="11" viewBox="0 0 25 12" fill="none"><rect x="0.6" y="0.6" width="21" height="10.8" rx="3" stroke={colour} strokeOpacity="0.45" /><rect x="2.2" y="2.2" width="16" height="7.6" rx="1.8" fill={colour} /><path d="M23.2 4v4a2.2 2.2 0 000-4z" fill={colour} fillOpacity="0.5" /></svg>
      </span>
    </div>
  );
}

function DiscoverScreen({ onOpen }: { onOpen: (s: ScreenId) => void }) {
  const [toast, setToast] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<"like" | "pass" | null>(null);
  const [liked, setLiked] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="fb-sr-header">
        <div className="min-w-0">
          <p className="fb-sr-eyebrow">Tonight in Brooklyn</p>
          <h1 className="fb-sr-header__title">Someone you&rsquo;ll remember.</h1>
        </div>
        <button type="button" className="fb-sr-disc fb-sr-bell" aria-label="See who likes you" onClick={() => onOpen("notifications")}>
          <span className="relative flex">
            <HeartIcon size={17} />
            <span className="fb-sr-dot">2</span>
          </span>
        </button>
      </header>

      <div className="fb-sr-chiprow mt-[16px]">
        {["Long-term", "Natural health", "Health autonomy"].map((c) => (
          <button key={c} type="button" className="fb-sr-chip" onClick={() => setToast(`${c} filter applied`)}>
            {c}
          </button>
        ))}
        <button type="button" className="fb-sr-chip fb-sr-chip--gold" aria-label="Natural health stance" onClick={() => setToast("Natural health stance filter")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3.2c3.6 4 6 7 6 10a6 6 0 11-12 0c0-3 2.4-6 6-10z" />
          </svg>
        </button>
      </div>

      <div className="fb-sr-deck">
        <div className="fb-sr-deck__card">
          <span aria-hidden className="fb-sr-peek"><span className="fb-sr-peek__handle" /></span>
          {verdict ? <span className="fb-sr-harness-stamp" data-tone={verdict}>{verdict === "like" ? "Liked" : "Skipped"}</span> : null}
          <DeckCard
            profile={CARD}
            isTop
            depth={0}
            units="mi"
            onOpen={() => onOpen("profile")}
            onLike={() => { setVerdict("like"); setLiked(true); setToast("Like sent to Aria"); }}
            onPass={() => { setVerdict("pass"); setToast("Skipped Aria"); }}
            onSayHello={() => { setToast("Request sent to Aria"); onOpen("messages"); }}
          />
        </div>
      </div>

      {toast ? (
        <div className="fb-sr-harness-toast" data-tone="good" role="status">
          {toast}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      ) : null}
      {liked ? <span className="sr-only">Liked</span> : null}
    </div>
  );
}

export function PreviewShell() {
  const [screen, setScreen] = useScreenParam("discover");
  const [thread, setThread] = useState<Person | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const go = (s: ScreenId) => {
    setThread(null);
    setScreen(s);
    const url = new URL(window.location.href);
    url.searchParams.set("screen", s);
    window.history.replaceState({}, "", url.toString());
  };

  const unreadMessages = PEOPLE.reduce((n, p) => n + p.unread, 0);
  const allScreens = process.env.NODE_ENV === "development";

  return (
    <div className="fb-sr min-h-[100dvh] w-full" style={{ background: "#0a0d19" }}>
      <div className="fb-sr-pv__column mx-auto flex w-full max-w-[440px] flex-col">
        <div className="fb-sr-phone fb-sr-pv__phone mx-auto flex w-full flex-col">
          <StatusBar />
          <div className={`fb-sr-pv__scroll flex min-h-0 flex-1 flex-col${screen === "discover" ? " fb-sr-pv__scroll--fill" : ""}`}>
            {screen === "discover" ? <DiscoverScreen onOpen={go} /> : null}
            {screen === "likes" ? <LikesView seed={LIKES_SEED} /> : null}
            {screen === "messages" ? (
              thread ? <ThreadView p={thread} onBack={() => setThread(null)} /> : <MessagesView onOpenThread={setThread} />
            ) : null}
            {screen === "profile" ? <ProfileView onNavigate={go} /> : null}
            {screen === "notifications" ? <NotificationsView /> : null}
            {screen === "settings" ? (
              <SettingsView onNavigate={go} onLogout={() => setToast("Signed out — in the live app this returns you to /auth")} />
            ) : null}
            {screen === "filters" ? <FiltersView onSaved={() => setToast("Preferences saved")} /> : null}
            {screen === "premium" ? <PremiumView /> : null}
          </div>
        </div>

        {/* The reference sheet labels each screen under its frame. */}
        <div className="fb-sr-pv__caption px-5 text-center">
          <p className="fb-sr-preview-caption">{SCREENS.find((s) => s.id === screen)?.label}</p>
          <p className="fb-sr-preview-sub">{SCREENS.find((s) => s.id === screen)?.caption}</p>
        </div>

        <nav className="fb-sr-tabs fb-sr-tabs--in-column" aria-label="Main">
          <div className="fb-sr-tabs__row">
            {TABS.map((t) => {
              const active = screen === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => go(t.id)}
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  className="fb-sr-tab"
                >
                  <span className="fb-sr-tab__icon">
                    <t.Icon size={t.size} active={t.id === "discover" ? active : undefined} />
                    {t.id === "messages" && unreadMessages > 0 ? (
                      <span className="fb-sr-tab__dot">{unreadMessages}</span>
                    ) : null}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* A review aid, development only: jump straight to any screen. */}
      {allScreens ? (
      <div className="fb-sr-jump">
        <p className="fb-sr-jump__title">All eight screens</p>
        <div className="flex flex-wrap gap-1.5">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              data-active={screen === s.id}
              className="fb-sr-jump__btn"
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] leading-4 text-[#6a718a]">
          Also reachable directly: <Link href="/preview?screen=likes" className="text-[#b8bccb] underline">/preview?screen=likes</Link>
        </p>
      </div>
      ) : null}

      {toast ? (
        <div className="fb-sr-harness-toast fb-sr-toast--in-phone" data-tone="good" role="status">
          {toast}
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      ) : null}
    </div>
  );
}

export { TABS };
export type { ScreenId };
