"use client";

/**
 * FREEBORN ALERT CENTER — notifications that hit hard and immediately.
 *
 * Polls the alerts + chat endpoints while signed in. Anything new (match,
 * like, message, verification) fires:
 *   1. the Freeborn banner (top of screen, works everywhere)
 *   2. the Freeborn chime (generated in-browser — unique sound)
 *   3. a native browser notification (when permitted)
 * Also broadcasts unread counts to the tab bar and asks once, politely,
 * for browser notification permission.
 */

import { PhotoImage } from "@/components/ui/photo-image";
import { PrototypeIcon } from "@/components/prototype/frame";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getAccessToken } from "@/lib/supabase/browser";
import { playChime, pushBrowserNotification, requestNotifyPermission, warmAudio } from "@/lib/notify";
import { loadFeedReceipts, saveFeedReceipts, reconcileFeed, shouldSurfaceAlert, type FeedReceipts } from "@/lib/notification-receipts";
import { isActiveChat } from "@/lib/active-chat";
import { isCallUiActive, subscribeCallUiActive } from "@/lib/call-ui-state";

const POLL_MS = 8_000;
const ASKED_KEY = "fb-notif-asked";

type Alert = {
  id: string;
  type: "match" | "message" | "like" | "verification" | "tip";
  title: string;
  body: string;
  photo?: string;
  href: string;
  at?: string;
  unread?: boolean;
  matchId?: string;
  eventId?: string;
  unreadIds?: string[];
};

type Banner = Alert & { key: number };

export function NotificationCenter({ pathname, suppressPrompts=false }: { pathname?: string; suppressPrompts?:boolean }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [alertPortal, setAlertPortal] = useState<HTMLElement | null>(null);
  useEffect(() => { setAlertPortal(document.getElementById("member-alert-portal")); }, []);
  const [askOpen, setAskOpen] = useState(false);
  /* A call screen beats a permission prompt: the ask card sits at z-[310] over
     the call overlay's z-[200], i.e. straight on top of Answer/Decline on an
     incoming ring and speaker/mute/end on a live call. */
  const [callUiUp, setCallUiUp] = useState(isCallUiActive);
  useEffect(() => subscribeCallUiActive(setCallUiUp), []);
  const [verificationUp,setVerificationUp]=useState(false);
  const [threadUp,setThreadUp]=useState(false);
  useEffect(()=>{const verification=(e:Event)=>setVerificationUp(Boolean((e as CustomEvent<{open:boolean}>).detail?.open));const thread=(e:Event)=>setThreadUp(Boolean((e as CustomEvent<{open:boolean}>).detail?.open));window.addEventListener('freeborn:verification',verification);window.addEventListener('freeborn:chat-thread',thread);return()=>{window.removeEventListener('freeborn:verification',verification);window.removeEventListener('freeborn:chat-thread',thread);};},[]);
  const seq = useRef(0);
  const receiptRef = useRef<FeedReceipts>({delivered:[],read:[]});
  const accountRef = useRef<string | null>(null);
  const firstRun = useRef(true);
  const pathnameRef = useRef<string | undefined>(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  /* Accurate dots: the tab you're standing in reads as zero. */
  useEffect(() => {
    const detail = {
      alerts: pathname?.startsWith("/app/notifications") ? 0 : undefined,
      // Chat counts are server-owned message read state, not tab-visit state.
      likes: pathname?.startsWith("/app/likes") ? 0 : undefined,
    };
    window.dispatchEvent(new CustomEvent("freeborn:viewing", { detail }));
    window.dispatchEvent(new Event("freeborn:feed-refresh"));
  }, [pathname]);

  /* Unlock sound + ask for browser notifications on the FIRST real gesture
     (highest grant rate). After that, alerts fire as OS banners even when
     Freeborn's tab is hidden behind other apps. */
  useEffect(() => {
    const unlock = () => {
      warmAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /* One polite ask for browser notifications + sounds. */
  useEffect(() => {
    try {
      const asked = window.localStorage.getItem(ASKED_KEY) === "1";
      const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
      if (!asked && !granted) {
        const t = setTimeout(() => setAskOpen(true), 6_000);
        return () => clearTimeout(t);
      }
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const soundsOn = () => {
      try {
        const raw = window.localStorage.getItem("freeborn.preferences");
        if (!raw) return true;
        return (JSON.parse(raw) as { sounds?: boolean }).sounds !== false;
      } catch {
        return true;
      }
    };

    const fire = (a: Alert) => {
      const key = ++seq.current;
      // Coalesce multiple updates to one conversation into one visible banner.
      setBanners((b) => [...b.filter(existing => !(a.type === "message" && a.matchId && existing.type === "message" && existing.matchId === a.matchId)).slice(-2), { ...a, key }]);
      if (soundsOn()) {
        playChime();
        // Retry once — some browsers block the first audio attempt after a
        // long idle; the alert must still be heard.
        setTimeout(() => {
          if (soundsOn()) playChime();
        }, 350);
      }
      pushBrowserNotification(a.title, a.body, a.href);
      setTimeout(() => setBanners((b) => b.filter((x) => x.key !== key)), 6_500);
    };

    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
      const token = await getAccessToken().catch(() => null);
      if (!token || cancelled) return;
      try {
        const [alertsRes, matchesRes] = await Promise.all([
          fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/chat/matches", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (cancelled) return;
        let chatUnread = 0;
        if (matchesRes.ok) {
          const mj = await matchesRes.json();
          for (const m of mj.matches ?? []) chatUnread += m.unread ?? 0;
        }

        if (alertsRes.ok) {
          const json = await alertsRes.json();
          if (cancelled) return;
          const items = (json.notifications ?? []) as Alert[];
          // Scope durable browser receipts to the authenticated API identity.
          // Mounting or polling must not silently turn unseen history into read.
          const accountId = typeof json.memberId === "string" ? json.memberId : null;
          if (accountId !== accountRef.current) {
            accountRef.current = accountId;
            receiptRef.current = accountId ? loadFeedReceipts(accountId) : {delivered:[],read:[]};
            firstRun.current = true;
          }
          const p = pathnameRef.current ?? "";
          const state = reconcileFeed(items, receiptRef.current, p, firstRun.current);
          receiptRef.current = state.receipts;
          firstRun.current = false;
          if (accountId) saveFeedReceipts(accountId, state.receipts);
          // Mark the complete feed delivered first, then filter before applying
          // the display cap so the open thread cannot crowd out another chat.
          state.fresh.filter(item => shouldSurfaceAlert(item,p,document.hidden,isActiveChat)).slice(0,3)
            .forEach(item => fire(item as Alert));
          const systemUnread = Number.isSafeInteger(json.systemUnread) && json.systemUnread >= 0 ? json.systemUnread : 0;
          window.dispatchEvent(new CustomEvent("freeborn:unread", { detail: {
            alerts: state.alerts + systemUnread,
            chat: chatUnread + systemUnread,
            likes: state.likes,
          }}));
        }
      } catch {
        /* offline — next tick retries */
      }
      } finally { inFlight = false; }
    };

    void tick();
    const iv = setInterval(() => void tick(), POLL_MS);
    /* Healing: the moment the member returns to the tab, sync immediately —
       no waiting for the next tick after being away. */
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("freeborn:feed-refresh", onVisible);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("freeborn:feed-refresh", onVisible);
    };
  }, []);

  return (
    <>
      {/* Permission ask — once, polite, dismissible */}
      {askOpen && !suppressPrompts && !callUiUp && !verificationUp && !threadUp ? (
        <div className="member-notification-ask" role="region" aria-label="Optional notifications">
          <div className="member-notification-card">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 8.4a6 6 0 10-12 0c0 6.6-2.7 8.4-2.7 8.4h17.4S18 15 18 8.4z" />
                <path d="M13.7 20a2 2 0 01-3.4 0" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-black text-[var(--color-pearl)]">Alerts while Freeborn is open</p>
              <p className="mt-0.5 text-[12px] leading-4 text-[var(--color-mist)]">
                Choose browser alerts and sounds while Freeborn is open. Closed-app push is not available.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void requestNotifyPermission().then(() => playChime());
                    try {
                      window.localStorage.setItem(ASKED_KEY, "1");
                    } catch {
                      /* ignore */
                    }
                    setAskOpen(false);
                  }}
                  className="btn-grad"
                >
                  Turn on alerts
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.localStorage.setItem(ASKED_KEY, "1");
                    } catch {
                      /* ignore */
                    }
                    setAskOpen(false);
                  }}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] font-bold text-[var(--color-mist)] transition hover:text-[var(--color-pearl)]"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Alert banners */}
      {alertPortal && createPortal(
        !verificationUp && banners.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => {
              setBanners((x) => x.filter((y) => y.key !== b.key));
              window.location.assign(b.href);
            }}
            className="fb-toast-in pointer-events-auto flex w-full max-w-[440px] shrink-0 items-center gap-3 rounded-2xl border border-[var(--color-ember-500)]/45 bg-[#10141f]/97 p-3.5 text-left shadow-[0_30px_80px_-16px_rgba(0,0,0,0.9)] backdrop-blur-md"
          >
            {b.photo ? (
              <PhotoImage src={b.photo} alt="" className="h-11 w-11 shrink-0 rounded-full border border-white/15" imgClassName="object-cover" compact />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2b3048] text-[#f3d4b2]">
                <PrototypeIcon name={b.type === "message" ? "messages" : b.type === "like" || b.type === "match" ? "heart" : "bell"} className="h-5 w-5"/>
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-black text-[var(--color-pearl)]">{b.title}</span>
              <span className="mt-0.5 block truncate text-[12px] text-[var(--color-mist)]">{b.body}</span>
            </span>
            <span className="shrink-0 text-[11px] font-black uppercase tracking-wider text-[var(--color-gold-300)]">
              Open
            </span>
          </button>
        )), alertPortal)}
    </>
  );
}
