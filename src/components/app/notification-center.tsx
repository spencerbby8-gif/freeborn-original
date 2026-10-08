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

import { useEffect, useRef, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";
import { playChime, pushBrowserNotification, requestNotifyPermission } from "@/lib/notify";

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

export function NotificationCenter() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [askOpen, setAskOpen] = useState(false);
  const seq = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());
  const firstRun = useRef(true);

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

    const fire = (a: Alert) => {
      const key = ++seq.current;
      setBanners((b) => [...b.slice(-2), { ...a, key }]);
      playChime();
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
          const fresh = items.filter((i) => i.type !== "tip" && !seenRef.current.has(i.id));

          if (firstRun.current) {
            // Don't blast the member with history on first open.
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

          const alertsUnread = Math.max(0, items.filter((i) => i.type !== "tip").length - Number(window.localStorage.getItem(SEEN_KEY) ?? "0"));
          const likesUnread = items.filter((i) => i.type === "like" && !seenRef.current.has(i.id)).length;
          window.dispatchEvent(
            new CustomEvent("freeborn:unread", {
              detail: { alerts: Math.max(alertsUnread, fresh.length), chat: chatUnread, likes: likesUnread },
            })
          );
        }
      } catch {
        /* offline — next tick retries */
      }
    };

    void tick();
    const iv = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <>
      {/* Permission ask — once, polite, dismissible */}
      {askOpen ? (
        <div className="fixed inset-x-0 top-3 z-[310] flex justify-center px-4">
          <div className="animate-scale-in flex w-full max-w-[440px] items-start gap-3 rounded-2xl border border-[var(--color-gold-500)]/40 bg-[#10141f]/97 p-4 shadow-[0_30px_80px_-16px_rgba(0,0,0,0.9)] backdrop-blur-md">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold-500)]/15 text-[var(--color-gold-300)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 8.4a6 6 0 10-12 0c0 6.6-2.7 8.4-2.7 8.4h17.4S18 15 18 8.4z" />
                <path d="M13.7 20a2 2 0 01-3.4 0" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-black text-[var(--color-pearl)]">Never miss a match</p>
              <p className="mt-0.5 text-[12px] leading-4 text-[var(--color-mist)]">
                Allow Freeborn alerts and sounds so matches, likes, and messages reach you the second they happen.
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
                  className="rounded-full bg-[var(--gradient-ember-warm)] px-4 py-2 text-[12px] font-black text-white transition active:scale-95"
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
              <img src={b.photo} alt="" className="h-11 w-11 shrink-0 rounded-full border border-white/15 object-cover" />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] text-white">
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
