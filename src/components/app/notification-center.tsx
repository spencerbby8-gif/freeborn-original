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
import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";
import { playChime, pushBrowserNotification, requestNotifyPermission, warmAudio } from "@/lib/notify";
import { isCallUiActive, subscribeCallUiActive } from "@/lib/call-ui-state";

const POLL_MS = 8_000;
const SEEN_KEY = "fb-seen-alerts";
const ASKED_KEY = "fb-notif-asked";

type Alert = {
  id: string;
  type: "match" | "message" | "like" | "verification" | "tip";
  title: string;
  body: string;
  photo?: string;
  href: string;
};

type Banner = Alert & { key: number };

export function NotificationCenter({ pathname }: { pathname?: string }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [askOpen, setAskOpen] = useState(false);
  /* A call screen beats a permission prompt: the ask card sits at z-[310] over
     the call overlay's z-[200], i.e. straight on top of Answer/Decline on an
     incoming ring and speaker/mute/end on a live call. */
  const [callUiUp, setCallUiUp] = useState(isCallUiActive);
  useEffect(() => subscribeCallUiActive(setCallUiUp), []);
  const seq = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());
  const firstRun = useRef(true);
  const pathnameRef = useRef<string | undefined>(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  /* Accurate dots: the tab you're standing in reads as zero. */
  useEffect(() => {
    const detail = {
      alerts: pathname?.startsWith("/app/notifications") ? 0 : undefined,
      chat: pathname?.startsWith("/app/chat") ? 0 : undefined,
      likes: pathname?.startsWith("/app/likes") ? 0 : undefined,
    };
    window.dispatchEvent(new CustomEvent("freeborn:viewing", { detail }));
  }, [pathname]);

  /* Unlock sound + ask for browser notifications on the FIRST real gesture
     (highest grant rate). After that, alerts fire as OS banners even when
     Freeborn's tab is hidden behind other apps. */
  useEffect(() => {
    const unlock = () => {
      warmAudio();
      void requestNotifyPermission();
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
      setBanners((b) => [...b.slice(-2), { ...a, key }]);
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

    const tick = async () => {
      const token = await getAccessToken().catch(() => null);
      if (!token || cancelled) return;
      try {
        const [alertsRes, matchesRes] = await Promise.all([
          fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/chat/matches", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        let chatUnread = 0;
        if (matchesRes.ok) {
          const mj = await matchesRes.json();
          for (const m of mj.matches ?? []) chatUnread += m.unread ?? 0;
        }

        if (alertsRes.ok) {
          const json = await alertsRes.json();
          const items = (json.notifications ?? []) as Alert[];
          const first = firstRun.current;
          const fresh = first ? [] : items.filter((i) => i.type !== "tip" && !seenRef.current.has(i.id));

          // Count fresh likes BEFORE marking anything seen, or the dot
          // would always read zero.
          const newLikes = fresh.filter((i) => i.type === "like").length;

          if (first) {
            // Fresh mount (happens on every tab switch): history is NOT new —
            // mark it seen silently and report ZERO unread. This is what
            // stopped the dots from "coming back" after being cleared.
            items.forEach((i) => seenRef.current.add(i.id));
            firstRun.current = false;
          } else if (fresh.length > 0) {
            fresh.slice(0, 3).forEach((a) => {
              seenRef.current.add(a.id);
              fire(a);
            });
          }

          try {
            window.localStorage.setItem(SEEN_KEY, String(seenRef.current.size));
          } catch {
            /* ignore */
          }

          /* Accurate dots — the tab you're standing in always reads zero. */
          const p = pathnameRef.current ?? "";
          window.dispatchEvent(
            new CustomEvent("freeborn:unread", {
              detail: {
                alerts: p.startsWith("/app/notifications") ? 0 : fresh.length,
                chat: p.startsWith("/app/chat") ? 0 : chatUnread,
                likes: p.startsWith("/app/likes") ? 0 : newLikes,
              },
            })
          );
        }
      } catch {
        /* offline — next tick retries */
      }
    };

    void tick();
    const iv = setInterval(() => void tick(), POLL_MS);
    /* Healing: the moment the member returns to the tab, sync immediately —
       no waiting for the next tick after being away. */
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <>
      {/* Permission ask — once, polite, dismissible */}
      {/* PERMISSION ASK — compact, and deliberately out of the design's way.
          Measured on a 393x852 viewport: as a large card it covered the
          .card-tags and .card-bio of the deck card, and at bottom-24 it covered
          .action-row as well. Neither is acceptable on the surface the member
          spends most of their time on, and the prototype has no such prompt at
          all.

          It is now a single compact line pinned in the gap between the card and
          the fixed action row (card body ends ~631px, row starts ~708px on this
          viewport), so it never masks profile content or a control. The
          capability is unchanged: same one-time ask, same two choices. */}
      {askOpen && !callUiUp ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[152px] z-[310] flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-[420px] items-center gap-2.5 rounded-full border border-[var(--color-gold-500)]/35 bg-[#10141f]/97 py-1.5 pl-2.5 pr-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 8.4a6 6 0 10-12 0c0 6.6-2.7 8.4-2.7 8.4h17.4S18 15 18 8.4z" />
                <path d="M13.7 20a2 2 0 01-3.4 0" />
              </svg>
            </span>
            <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-[var(--color-pearl)]">
              Get alerts for matches and messages
            </p>
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
              className="shrink-0 rounded-full bg-[var(--gradient-ember-warm)] px-3 py-1.5 text-[11px] font-black text-[#2a1a10]"
            >
              Turn on
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
              aria-label="Maybe later"
              className="shrink-0 rounded-full px-2 py-1.5 text-[11px] font-bold text-[var(--color-ash)]"
            >
              Later
            </button>
          </div>
        </div>
      ) : null}

      {/* Alert banners */}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[300] flex flex-col items-center gap-2 px-4">
        {banners.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => {
              setBanners((x) => x.filter((y) => y.key !== b.key));
              window.location.assign(b.href);
            }}
            className="fb-toast-in pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-2xl border border-[var(--color-ember-500)]/45 bg-[#10141f]/97 p-3.5 text-left shadow-[0_30px_80px_-16px_rgba(0,0,0,0.9)] backdrop-blur-md"
          >
            {b.photo ? (
              <PhotoImage src={b.photo} alt="" className="h-11 w-11 shrink-0 rounded-full border border-white/15" imgClassName="object-cover" compact />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] text-[#2a1a10]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z" />
                </svg>
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
        ))}
      </div>
    </>
  );
}
