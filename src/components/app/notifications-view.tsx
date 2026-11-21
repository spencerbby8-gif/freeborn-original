"use client";

import { PhotoImage } from "@/components/ui/photo-image";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/supabase/browser";

type NotificationType = "match" | "message" | "like" | "verification" | "tip";

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  photo?: string;
  at: string;
  unread: boolean;
  href: string;
};

const TYPE_META: Record<NotificationType, { label: string; chip: string }> = {
  like: { label: "Likes", chip: "like" },
  match: { label: "Matches", chip: "match" },
  message: { label: "Messages", chip: "message" },
  verification: { label: "Verification", chip: "verification" },
  tip: { label: "Tips", chip: "tip" },
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

function TypeIcon({ type }: { type: NotificationType }) {
  const stroke = "currentColor";
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (type === "message")
    return (
      <svg {...common}>
        <path d="M21 11.5a8.4 8.4 0 01-8.5 8.3 8.8 8.8 0 01-3.7-.8L3 20.5l1.5-5.2a8.1 8.1 0 01-1-3.9A8.4 8.4 0 0112 3.2a8.4 8.4 0 019 8.3z" />
      </svg>
    );
  if (type === "verification")
    return (
      <svg {...common} strokeWidth={1.9}>
        <path d="M12 2.5l7.5 3v5.2c0 5-3.2 8.6-7.5 10.3-4.3-1.7-7.5-5.3-7.5-10.3V5.5l7.5-3z" />
        <path d="M8.8 12l2.2 2.2 4.2-4.6" />
      </svg>
    );
  if (type === "match" || type === "like")
    return (
      <svg {...common} fill={type === "like" ? "currentColor" : "none"} stroke={type === "like" ? "none" : stroke}>
        <path d="M12 20.4S4.3 15.6 4.3 10a4.1 4.1 0 018.1-1 4.1 4.1 0 018.1 1c0 5.6-8.4 10.4-8.4 10.4z" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function iconCircle(type: NotificationType) {
  switch (type) {
    case "like":
      return "bg-[#43303c] text-[#e0685f]";
    case "match":
      return "bg-[#1e3a2d] text-[#57d38a]";
    case "message":
      return "bg-[#2c2a4a] text-[#a99cf0]";
    case "verification":
      return "bg-[var(--color-teal-500)]/15 text-[var(--color-teal-300)]";
    default:
      return "bg-[var(--color-gold-500)]/10 text-[var(--color-gold-300)]";
  }
}

export function NotificationsView() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | NotificationType>("all");

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
    // F10: defer state-producing work out of the effect body.
    queueMicrotask(() => void load());
    const iv = setInterval(() => void load(), 15000);
    return () => clearInterval(iv);
  }, [load]);

  const open = (n: Notification) => {
    router.push(n.href);
  };

  const unreadCount = items.filter((n) => n.unread).length;
  const counts = items.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1;
    return acc;
  }, {});
  const visible = filter === "all" ? items : items.filter((n) => n.type === filter);
  const chipTypes = (Object.keys(TYPE_META) as NotificationType[]).filter((t) => (counts[t] ?? 0) > 0 || t === "like" || t === "match" || t === "message");

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[680px]">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="eyebrow">ALERTS</p>
          {unreadCount > 0 ? (
            <p className="mb-1 mt-2 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--color-gold-500)]">New</p>
          ) : null}
          <h1 className="font-display text-[30px] font-normal tracking-tight sm:text-[34px]">Alerts</h1>
        </div>
        {unreadCount > 0 ? (
          <span className="rounded-full bg-[var(--gradient-ember-warm)] px-3 py-1 text-[11px] font-black text-[#2a1a10]">
            {unreadCount} new
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-sm text-[var(--color-mist)]">
        Matches, messages, and moments worth your attention. Tap any alert to open it.
      </p>

      {/* Type filter chips — client-side over the live feed */}
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter alerts">
        <button
          type="button"
          role="tab"
          aria-selected={filter === "all"}
          onClick={() => setFilter("all")}
          className={`rounded-full border px-4 py-2 text-[12px] font-bold transition ${
            filter === "all"
              ? "border-transparent bg-[var(--gradient-ember-warm)] text-[#2a1a10]"
              : "border-[var(--color-line)] bg-[var(--color-midnight)] text-[var(--color-sand)] hover:text-[var(--color-pearl)]"
          }`}
        >
          All · {items.length}
        </button>
        {chipTypes.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={filter === t}
            onClick={() => setFilter(t)}
            className={`rounded-full border px-4 py-2 text-[12px] font-bold transition ${
              filter === t
                ? "border-transparent bg-[var(--gradient-ember-warm)] text-[#2a1a10]"
                : "border-[var(--color-line)] bg-[var(--color-midnight)] text-[var(--color-sand)] hover:text-[var(--color-pearl)]"
            }`}
          >
            {TYPE_META[t].label} · {counts[t] ?? 0}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-2.5">
        {visible.length === 0 ? (
          <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-midnight)] px-6 py-9 text-center">
            <p className="font-display text-[20px] font-normal tracking-tight text-[var(--color-pearl)]">
              Nothing here yet
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-5 text-[var(--color-mist)]">
              {filter === "all"
                ? "When something worth your attention happens, it lands here."
                : `No ${TYPE_META[filter as NotificationType].label.toLowerCase()} yet — new ones land here the moment they happen.`}
            </p>
          </div>
        ) : null}
        {visible.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => open(n)}
            className={`flex w-full items-start gap-4 rounded-[20px] border p-4 text-left transition hover:border-[var(--color-line-strong)] ${
              n.unread
                ? "border-[var(--color-gold-500)]/25 bg-[var(--color-gold-500)]/[0.05]"
                : "border-[var(--color-line)] bg-[var(--color-midnight)] hover:bg-[var(--color-abyss)]"
            }`}
          >
            {n.photo ? (
              <PhotoImage src={n.photo} alt="" className="h-11 w-11 shrink-0 rounded-full border border-white/10" imgClassName="object-cover" compact />
            ) : (
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconCircle(n.type)}`}>
                <TypeIcon type={n.type} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[14px] font-bold text-[var(--color-pearl)]">{n.title}</p>
                <span className="shrink-0 text-[11px] text-[var(--color-ash)]">{timeAgo(n.at)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[var(--color-mist)]">
                {previewBody(n.body)}
              </p>
            </div>
            {n.unread ? (
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-gold-500)] shadow-[0_0_8px_rgba(233,195,124,0.7)]" />
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
