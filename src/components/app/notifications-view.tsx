"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/supabase/browser";

type Notification = {
  id: string;
  type: "match" | "message" | "verification" | "tip";
  title: string;
  body: string;
  photo?: string;
  at: string;
  unread: boolean;
  href: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function previewBody(body: string) {
  if (/\[\[voice:/.test(body)) return "Sent you a voice note";
  if (/\[\[video:/.test(body)) return "Sent you a video";
  if (/\[\[image:/.test(body)) return "Sent you a photo";
  return body;
}

export function NotificationsView() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const token = await getAccessToken().catch(() => null);
    const res = await fetch("/api/notifications", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const json = await res.json();
      setItems(json.notifications);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 15000);
    return () => clearInterval(iv);
  }, [load]);

  const open = (n: Notification) => {
    router.push(n.href);
  };

  const unreadCount = items.filter((n) => n.unread).length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[680px]">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Alerts</h1>
        {unreadCount > 0 ? (
          <span className="rounded-full bg-[var(--gradient-ember-warm)] px-3 py-1 text-[11px] font-black text-white">
            {unreadCount} new
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm text-[var(--color-mist)]">
        Matches, messages, and moments worth your attention. Tap any alert to open it.
      </p>

      <div className="mt-6 space-y-2.5">
        {items.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => open(n)}
            className={`flex w-full items-start gap-4 rounded-[22px] border p-4 text-left transition hover:border-white/[0.2] ${
              n.unread
                ? "border-[var(--color-gold-500)]/25 bg-[var(--color-gold-500)]/[0.05]"
                : "border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.045]"
            }`}
          >
            {n.photo ? (
              <img
                src={n.photo}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full border border-white/10 object-cover"
              />
            ) : (
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  n.type === "tip"
                    ? "bg-white/[0.06] text-[var(--color-sand)]"
                    : n.type === "verification"
                      ? "bg-[var(--color-teal-500)]/15 text-[var(--color-teal-300)]"
                      : "bg-[var(--gradient-ember-warm)] text-white"
                }`}
              >
                {n.type === "message" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 11.5a8.4 8.4 0 01-8.5 8.3 8.8 8.8 0 01-3.7-.8L3 20.5l1.5-5.2a8.1 8.1 0 01-1-3.9A8.4 8.4 0 0112 3.2a8.4 8.4 0 019 8.3z" />
                  </svg>
                ) : n.type === "verification" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 2.5l7.5 3v5.2c0 5-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.3-7.5-10.3V5.5l7.5-3z" />
                    <path d="M8.8 12l2.2 2.2 4.2-4.6" />
                  </svg>
                ) : n.type === "match" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4M12 16h.01" />
                  </svg>
                )}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[14px] font-black">{n.title}</p>
                <span className="shrink-0 text-[11px] text-[var(--color-ash)]">{timeAgo(n.at)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[var(--color-mist)]">
                {previewBody(n.body)}
              </p>
            </div>
            {n.unread ? (
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-ember-500)] shadow-[0_0_8px_rgba(239,94,94,0.7)]" />
            ) : (
              <svg className="mt-1 shrink-0 text-[var(--color-ash)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void load()}
        className="mt-6 inline-flex items-center gap-2 text-[13px] font-bold text-[var(--color-gold-300)] transition hover:text-[var(--color-gold-500)]"
      >
        Refresh alerts
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12a9 9 0 11-2.6-6.3M21 3v6h-6" />
        </svg>
      </button>
    </div>
  );
}
