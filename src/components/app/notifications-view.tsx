"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";

type Notification = {
  id: string;
  type: "match" | "message" | "tip";
  title: string;
  body: string;
  photo?: string;
  at: string;
  unread: boolean;
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

export function NotificationsView() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      const res = await fetch("/api/notifications", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        setItems(json.notifications);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[680px]">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Alerts</h1>
      <p className="mt-1.5 text-sm text-[var(--color-mist)]">
        Matches, messages, and moments worth your attention.
      </p>

      <div className="mt-6 space-y-2.5">
        {items.map((n) => (
          <div
            key={n.id}
            className={`flex items-start gap-4 rounded-[22px] border p-4 ${
              n.unread
                ? "border-[var(--color-gold-500)]/25 bg-[var(--color-gold-500)]/[0.05]"
                : "border-white/[0.07] bg-white/[0.025]"
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
                    : "bg-[var(--gradient-ember-warm)] text-white"
                }`}
              >
                {n.type === "message" ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 11.5a8.4 8.4 0 01-8.5 8.3 8.8 8.8 0 01-3.7-.8L3 20.5l1.5-5.2a8.1 8.1 0 01-1-3.9A8.4 8.4 0 0112 3.2a8.4 8.4 0 019 8.3z" />
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
              <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[var(--color-mist)]">{n.body}</p>
            </div>
            {n.unread ? (
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-ember-500)] shadow-[0_0_8px_rgba(239,94,94,0.7)]" />
            ) : null}
          </div>
        ))}
      </div>

      <a
        href="/app/chat"
        className="mt-6 inline-flex items-center gap-2 text-[13px] font-bold text-[var(--color-gold-300)] transition hover:text-[var(--color-gold-500)]"
      >
        Open your conversations
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </a>
    </div>
  );
}
