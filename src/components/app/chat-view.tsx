"use client";

import { PhotoImage } from "@/components/ui/photo-image";
import { ReadOnlyThreadNotice } from "@/components/app/read-only-thread-notice";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";
import { readJsonSafe } from "@/lib/api-response";
import {
  ackPending,
  classifySendFailure,
  markPendingFailed,
  mergeMessages,
  offersRetryAfter,
  pendingToMessage,
  pollIntervalMs,
  queuePending,
  reconcilePending,
  type ChannelPhase,
  type PendingMessage,
} from "@/lib/chat-sync";
import { joinChatChannel, relayMessageNotice, type ChatBus } from "@/lib/chat-bus";
import { ProfileView } from "./profile-view";
import { PhotoLightbox } from "./photo-lightbox";
import { CallOverlay } from "./call-overlay";
import { VoiceBubble, VoiceRecorder } from "./voice-note";
import { CameraCapture } from "@/components/camera-capture";

type MatchRow = {
  id: string;
  with: {
    id: string;
    name: string;
    city: string;
    photo: string;
    active?: boolean;
    lastActiveAt?: string | null;
  };
  lastMessage: { body: string; mine: boolean; at: string } | null;
  unread: number;
};

type ReactionChip = { emoji: string; mine: boolean; count: number };
type MessageRow = {
  id: string;
  body: string;
  mine: boolean;
  at: string;
  read: boolean;
  flagged?: boolean;
  reactions: ReactionChip[];
  /** typed by me, not yet acknowledged by the server (see src/lib/chat-sync.ts) */
  pending?: boolean;
  /** the send was refused or lost; the bubble offers a retry instead of vanishing silently */
  failed?: boolean;
  /** …but the refusal was POLICY (403/409/400), so a retry would be refused again and the
   *  affordance is withheld: see classifySendFailure in src/lib/chat-sync.ts */
  blocked?: boolean;
};

const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

/** Opener suggestions for fresh matches — conversations die when they start cold. */
const ICEBREAKERS = [
  "What's a value you'll never compromise on?",
  "What does your ideal Sunday look like?",
  "Best meal you've had this month?",
  "What's something you're building right now?",
];

type StagedItem = { id: number; kind: "image" | "video"; dataUrl: string };

const MEDIA_RE = /^\[\[(image|video|voice|call):([^\]|]+)(?:\|([\d.]+))?\]\]$/;
const QUOTE_RE = /^\[\[quote:([^|]{1,60})\|(.{1,220})\]\]$/;
const MAX_PACKET_ITEMS = 10;

function authHeaders(token: string | null) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function fmtClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function previewBody(body: string) {
  if (/\[\[voice:/.test(body)) return "Voice note";
  if (/\[\[video:/.test(body)) return "Video";
  if (/\[\[image:/.test(body)) return "Photo";
  if (/\[\[quote:/.test(body)) return body.replace(/\[\[quote:[^\]]*\]\]\n?/, "").slice(0, 80) || "Replied";
  return body;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function seededBars(seed: string, count: number) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    out.push(((h >>> 0) % 1000) / 1000);
  }
  return out;
}

type Segment =
  | { type: "quote"; name: string; text: string }
  | { type: "media"; items: { kind: string; url: string; dur?: number }[] }
  | { type: "text"; text: string };

function parseSegments(body: string): Segment[] {
  const segs: Segment[] = [];
  const lines = body.split("\n");
  lines.forEach((line, i) => {
    const q = i === 0 ? QUOTE_RE.exec(line.trim()) : null;
    if (q) {
      segs.push({ type: "quote", name: q[1], text: q[2] });
      return;
    }
    const m = MEDIA_RE.exec(line.trim());
    if (m) {
      const item = { kind: m[1], url: m[2], dur: m[3] ? Number(m[3]) : undefined };
      const last = segs[segs.length - 1];
      if (last && last.type === "media") last.items.push(item);
      else segs.push({ type: "media", items: [item] });
    } else if (line.trim()) {
      segs.push({ type: "text", text: line });
    }
  });
  if (segs.length === 0) segs.push({ type: "text", text: body });
  return segs;
}

function plainText(body: string) {
  return parseSegments(body)
    .map((s) =>
      s.type === "text"
        ? s.text
        : s.type === "quote"
          ? `${s.name}: ${s.text}`
          : s.items
              .map((i) => (i.kind === "voice" ? "[Voice note]" : i.kind === "video" ? "[Video]" : "[Photo]"))
              .join(" ")
    )
    .join("\n");
}

/* --- Read receipts ---------------------------------------------------------- */

function Receipt({ read }: { read: boolean }) {
  return (
    <svg
      width={read ? 16 : 12}
      height="11"
      viewBox="0 0 18 12"
      fill="none"
      stroke={read ? "#9ff0e2" : "rgba(255,255,255,0.65)"}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={read ? "Read" : "Sent"}
    >
      <path d="M1.5 6.5l3.4 3.5L11.5 3" />
      {read ? <path d="M8 8.5l1.4 1.5L16.5 3" /> : null}
    </svg>
  );
}

/* --- Media packet (photos + videos + voice, one bubble) --------------------- */

function MediaPacket({
  items,
  onImage,
  onVideo,
}: {
  items: { kind: string; url: string; dur?: number }[];
  onImage: (url: string) => void;
  onVideo: (url: string) => void;
}) {
  const visuals = items.filter((i) => i.kind === "image" || i.kind === "video");
  const voices = items.filter((i) => i.kind === "voice");
  return (
    <div className="space-y-2">
      {visuals.length > 0 ? (
        <div className={visuals.length > 1 ? "grid grid-cols-2 gap-1.5" : ""}>
          {visuals.map((item, i) =>
            item.kind === "image" ? (
              <button
                key={i}
                type="button"
                onClick={() => onImage(item.url)}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Open photo full size"
                className="block overflow-hidden rounded-xl transition active:scale-[0.98]"
              >
                <PhotoImage
                  src={item.url}
                  alt="Shared photo"
                  className="block max-h-[300px] w-full rounded-xl"
                  imgClassName="max-h-[300px] w-full object-cover"
                />
              </button>
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => onVideo(item.url)}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Open video full size"
                className="relative block overflow-hidden rounded-xl transition active:scale-[0.98]"
              >
                <video src={item.url} muted playsInline preload="metadata" className="max-h-[300px] w-full rounded-xl object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M8 5.4v13.2c0 .9 1 1.5 1.8 1L20 13a1.2 1.2 0 000-2L9.8 4.4c-.8-.5-1.8.1-1.8 1z" />
                    </svg>
                  </span>
                </span>
              </button>
            )
          )}
        </div>
      ) : null}
      {voices.map((v, i) => (
        <VoiceBubble key={i} url={v.url} mine seconds={v.dur} />
      ))}
      {items
        .filter((i) => i.kind === "call")
        .map((c, i) => (
          <div
            key={`call-${i}`}
            className="flex w-[240px] max-w-full items-center gap-3 rounded-xl bg-black/20 px-3.5 py-2.5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-black">
                {c.url === "video" ? "Video call" : "Voice call"}
              </p>
              <p className="text-[11px] opacity-75">
                {c.dur ? `${Math.floor(c.dur / 60)}:${String(Math.floor(c.dur % 60)).padStart(2, "0")} · connected` : "connected"}
              </p>
            </div>
          </div>
        ))}
    </div>
  );
}

/** Quote text with media chips — a requote of a photo/video/voice note shows
    exactly what it quoted, with an icon. */
function QuoteBody({ text }: { text: string }) {
  const tokens = [
    { tag: "[Photo]", label: "Photo", icon: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-4.5-4.5L9 18" /></> },
    { tag: "[Video]", label: "Video", icon: <><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3" /></> },
    { tag: "[Voice note]", label: "Voice note", icon: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></> },
  ];
  let rest = text;
  const found: Array<{ label: string; icon: React.ReactNode }> = [];
  for (const t of tokens) {
    while (rest.includes(t.tag)) {
      found.push({ label: t.label, icon: t.icon });
      rest = rest.replace(t.tag, "");
    }
  }
  rest = rest.trim();
  return (
    <div className="mt-0.5 space-y-1">
      {rest ? <p className="line-clamp-2 text-[12.5px] leading-4 opacity-90">{rest}</p> : null}
      {found.map((f, i) => (
        <span key={i} className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-[11px] font-black uppercase tracking-wide opacity-90">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {f.icon}
          </svg>
          Quoted {f.label}
        </span>
      ))}
    </div>
  );
}

function MessageContent({
  body,
  onImage,
  onVideo,
}: {
  body: string;
  onImage: (url: string) => void;
  onVideo: (url: string) => void;
}) {
  const segs = useMemo(() => parseSegments(body), [body]);
  return (
    <>
      {segs.map((seg, i) =>
        seg.type === "quote" ? (
          <div
            key={i}
            className="mb-1.5 rounded-lg border-l-[3px] border-white/60 bg-black/20 px-2.5 py-1.5"
          >
            <p className="text-[11px] font-black uppercase tracking-wide opacity-80">{seg.name}</p>
            <QuoteBody text={seg.text} />
          </div>
        ) : seg.type === "media" ? (
          <MediaPacket key={i} items={seg.items} onImage={onImage} onVideo={onVideo} />
        ) : (
          <p key={i} className={i > 0 ? "mt-1.5" : undefined}>
            {seg.text}
          </p>
        )
      )}
    </>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-1.5">
      <span className="rounded-full border border-white/[0.07] bg-white/[0.035] px-3.5 py-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-[var(--color-ash)]">
        {label}
      </span>
    </div>
  );
}

function Avatar({ photo, name, size = 48 }: { photo: string; name: string; size?: number }) {
  if (photo) {
    return (
      <PhotoImage
        src={photo}
        alt={name}
        style={{ width: size, height: size }}
        className="shrink-0 overflow-hidden rounded-full border border-white/10"
        imgClassName="object-cover"
        compact
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] font-black text-white"
    >
      {name.charAt(0)}
    </span>
  );
}

/* ========================================================================== */

function Thread({
  match,
  token,
  onBack,
  onChanged,
  onTapProfile,
}: {
  match: MatchRow;
  token: string | null;
  onBack: () => void;
  onChanged: () => void;
  onTapProfile: (id: string) => void;
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [call, setCall] = useState<"voice" | "video" | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<MessageRow | null>(null);
  const [quoteArmedId, setQuoteArmedId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ name: string; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  /** My own identity — carried in the ring so the callee sees who's calling. */
  const [self, setSelf] = useState<{ id: string; name: string; photo: string } | undefined>(undefined);

  /** Adaptive chat height — measured from the real viewport (visualViewport
      tracks browser chrome + keyboard on every phone), never a guess. */
  const [heightPx, setHeightPx] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      /* The bottom tab bar hides while a conversation is open (and the shell's
         bottom padding shrinks), so the chrome allowance is smaller here. */
      const chrome = window.innerWidth >= 1024 ? 58 : 110;
      setHeightPx(Math.max(380, Math.round(vh - chrome)));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const t = await getAccessToken().catch(() => null);
      if (!t) return;
      try {
        const res = await fetch("/api/profile/me", { headers: { Authorization: `Bearer ${t}` } });
        if (!res.ok) return;
        const json = await res.json();
        const p = json.profile ?? {};
        setSelf({ id: p.id ?? "", name: p.displayName ?? "Freeborn member", photo: (p.photos ?? [])[0] ?? "" });
      } catch {
        /* call still works without the pretty identity */
      }
    })();
  }, []);

  /* OPTIMISTIC ECHO + SYNC — rewritten 2026-10-30 (see src/lib/chat-sync.ts).
     This used to be `setInterval(load, 2500)` with an echo reconciled by matching message TEXT
     inside a 20 s window. Both halves were wrong in ways members hit: the poll ran at full rate
     whether anything happened or not, and re-sending the same words ("ok" twice) made a bubble
     vanish, while a slow server made one disappear and reappear. Now:
       · the echo is retired by IDENTITY, using the stored id POST returns;
       · a refused or lost send stays visible and retryable instead of silently disappearing;
       · the poll widens to a heartbeat while the realtime channel is live and tightens back
         down the moment it is not, so a lost notification costs latency, never a message. */
  const pendingRef = useRef<PendingMessage[]>([]);
  const syncRef = useRef({ knownCount: 0, lastFetchAt: 0, notices: 0, failures: 0 });
  const phaseRef = useRef<ChannelPhase>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busRef = useRef<ChatBus | null>(null);

  /* What the server says about THIS member's ability to write, not what the client guesses from
     `status`. A thread can be readable and unwritable at once — the member who was unmatched
     keeps the history to report from, and cannot type into it. */
  const [threadAccess, setThreadAccess] = useState<{
    canSend: boolean;
    notice: string | null;
    reason: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/chat/messages?match=${match.id}`, {
      headers: authHeaders(token),
      cache: "no-store",
    }).catch(() => null);
    // readJsonSafe, not res.json(): a 502 from the proxy is an HTML error page, and the
    // SyntaxError it throws used to escape into the interval callback once per tick.
    const json = res
      ? await readJsonSafe<{
          messages?: MessageRow[];
          thread?: { canSend: boolean; status?: string; notice?: string | null; reason?: string | null };
        }>(res)
      : null;
    if (!res || !res.ok || !json || !Array.isArray(json.messages)) {
      syncRef.current.failures += 1;
      return false;
    }
    const real = json.messages;
    // The thread's writability can change while it is open (the other member ends it, a moderator
    // blocks it), so it is re-read on every fetch rather than remembered from mount time.
    if (json.thread) setThreadAccess({ canSend: !!json.thread.canSend, notice: json.thread.notice ?? null, reason: json.thread.reason ?? null });
    syncRef.current.failures = 0;
    const prev = syncRef.current;
    // A thread that SHRANK under us was emptied or severed by the other member (or by a
    // moderation action). Reset the bookkeeping rather than trusting a delta.
    if (real.length < prev.knownCount) pendingRef.current = [];
    pendingRef.current = reconcilePending(pendingRef.current, { serverRows: real });
    syncRef.current = {
      knownCount: real.length,
      lastFetchAt: Date.now(),
      notices: 0,
      failures: 0,
    };
    const temps = pendingRef.current.map((pm) => pendingToMessage(pm) as unknown as MessageRow & { reactions: never[] });
    setMessages(
      mergeMessages(real, temps.map((t) => ({ ...t, reactions: [] }))) as MessageRow[]
    );
    return true;
  }, [match.id, token]);

  const armPoll = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const ms = pollIntervalMs({
      phase: phaseRef.current,
      visible: typeof document === "undefined" || document.visibilityState === "visible",
      online: typeof navigator === "undefined" || navigator.onLine !== false,
      failures: syncRef.current.failures,
    });
    // null = do not poll at all (hidden tab, offline). Both paths end in an immediate resync.
    if (ms === null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void load().then(() => armPoll());
    }, ms);
  }, [load]);

  useEffect(() => {
    void load();
    const bus = joinChatChannel(match.id, {
      onPhase: (ph) => {
        phaseRef.current = ph;
        armPoll();
      },
      onNotice: () => {
        syncRef.current.notices += 1;
        // One fetch per wake-up, however many signals arrived: the thread is the unit of truth.
        void load().then(() => armPoll());
      },
    });
    busRef.current = bus;
    armPoll();
    const rearm = () => {
      // Coming back to the app is when a phone has the most to catch up on.
      void load().then(() => armPoll());
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", rearm);
    if (typeof window !== "undefined") {
      window.addEventListener("online", rearm);
      window.addEventListener("offline", rearm);
    }
    return () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", rearm);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", rearm);
        window.removeEventListener("offline", rearm);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      bus.dispose();
      busRef.current = null;
    };
  }, [match.id, load, armPoll]);

  /* Instant snap to the latest message — the chat always opens AT the
     current conversation, never hanging at the top. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const firstScroll = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (!firstScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    firstScroll.current = false;
  }, [messages.length, heightPx]);

  /* The composer grows with the text (up to ~5 lines) instead of scrolling
     long messages out of view — every word stays visible while typing. */
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  /* --- Voice notes: rebuilt Telegram-style module ------------------------------ */

  const sendVoice = async (blob: Blob, seconds: number) => {
    setUploading(true);
    try {
      const url = await uploadMedia(blob, "voice");
      if (!url) return; // uploadMedia already told the member why
      await postMessage(buildBody(`[[voice:${url}|${seconds}]]`));
      setReplyTo(null);
    } finally {
      setUploading(false);
    }
  };

  /* --- Reactions: hold a bubble to pick, double-tap to love -------------------- */

  const [pickerFor, setPickerFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const [burstId, setBurstId] = useState<string | null>(null);
  const lastBubbleTap = useRef<{ id: string; t: number }>({ id: "", t: 0 });

  const applyReaction = (m: MessageRow, emoji: string, on: boolean): MessageRow => {
    const others = m.reactions.filter((r) => r.emoji !== emoji);
    const existing = m.reactions.find((r) => r.emoji === emoji);
    const count = existing ? existing.count + (on ? 1 : -1) : 1;
    const next = count > 0 ? [...others, { emoji, mine: on, count }] : others;
    return { ...m, reactions: next };
  };

  const toggleReaction = async (m: MessageRow, emoji: string) => {
    const mine = m.reactions.some((r) => r.emoji === emoji && r.mine);
    setMessages((prev) => prev.map((x) => (x.id === m.id ? applyReaction(x, emoji, !mine) : x)));
    try {
      await fetch("/api/chat/reactions", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ message: m.id, emoji }),
      });
    } catch {
      /* the next poll heals the state */
    }
  };

  const doubleTapLove = (m: MessageRow) => {
    const hasMine = m.reactions.some((r) => r.emoji === "❤️" && r.mine);
    if (!hasMine) void toggleReaction(m, "❤️");
    setBurstId(m.id);
    setTimeout(() => setBurstId(null), 900);
  };

  /** One POST for one bubble. `tempId` ties the reply to the echo it answers. */
  const deliver = useCallback(
    async (body: string, tempId: string): Promise<boolean> => {
      /* ONE choke point for every write — the composer, a staged upload and retrySend all come
         through here — so the read-only verdict is enforced in code, not only in the markup that
         hid itself. Returning false (never true) matters: `true` would tell the caller the
         message went out, which is the exact lie this whole path exists to stop telling.
         `threadAccess` is a real dependency below, so this cannot read a stale verdict. */
      if (threadAccess && !threadAccess.canSend) {
        pendingRef.current = markPendingFailed(pendingRef.current, tempId);
        setMessages((ms) => ms.map((m) => (m.id === tempId ? { ...m, failed: true, blocked: true } : m)));
        flash(threadAccess.notice ?? "This conversation is read-only, so nothing can be sent here.");
        return false;
      }
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ match: match.id, text: body }),
      }).catch(() => null);
      const json = res ? await readJsonSafe<{ error?: string; restricted?: boolean; message?: { id?: string } }>(res) : null;
      if (!res || !res.ok) {
        /* The old code only caught a network rejection, so a REFUSED send (403 from a severed
           thread, 403 from the other member's message privacy, 401 on an expired session) was
           silently discarded: the bubble stayed, then the next poll made it disappear, and the
           member had no idea their message was never delivered. */
        const kind = classifySendFailure(res ? res.status : null);
        const retryable = offersRetryAfter(kind);
        pendingRef.current = markPendingFailed(pendingRef.current, tempId);
        setMessages((ms) => ms.map((m) => (m.id === tempId ? { ...m, failed: true, blocked: !retryable } : m)));
        flash(json?.error ?? (retryable ? "Couldn't send. Check your connection." : "This message can't be delivered here."));
        /* A refusal is also information about the thread: if the server declined on policy
           grounds, stop offering the input that produced the refusal. Self-healing beats a
           disabled-by-poll-only UI. */
        if (!retryable) setThreadAccess((prev) => ({ canSend: false, notice: json?.error ?? prev?.notice ?? null, reason: "denied" }));
        armPoll();
        return false;
      }
      if (json?.message?.id) pendingRef.current = ackPending(pendingRef.current, tempId, json.message.id);
      // Relay a content-free hint to the other member from this client: instant while both are
      // online, and harmless to lose, because the server also wrote a chat_signals row.
      relayMessageNotice(match.id);
      void load();
      onChanged();
      return true;
    },
    [armPoll, load, match.id, onChanged, threadAccess, token]
  );

  const postMessage = useCallback(
    async (body: string) => {
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      pendingRef.current = queuePending(pendingRef.current, { tempId, body });
      setMessages((ms) => mergeMessages(ms, [{ ...(pendingToMessage(pendingRef.current[pendingRef.current.length - 1]!) as object), id: tempId, reactions: [] } as unknown as MessageRow]));
      await deliver(body, tempId);
    },
    [deliver]
  );

  /** Retry keeps the original text and the original bubble — the member must never wonder
      whether the message went out twice. */
  const retrySend = useCallback(
    async (tempId: string) => {
      const item = pendingRef.current.find((x) => x.tempId === tempId);
      if (!item) return;
      pendingRef.current = pendingRef.current.map((x) =>
        x.tempId === tempId ? { ...x, failed: false, attempts: x.attempts + 1 } : x
      );
      setMessages((ms) => ms.map((m) => (m.id === tempId ? { ...m, failed: false, blocked: false } : m)));
      await deliver(item.body, tempId);
    },
    [deliver]
  );

  const buildBody = (content: string) => {
    if (!replyTo) return content;
    const quote = `[[quote:${replyTo.name.slice(0, 40)}|${replyTo.text.slice(0, 120)}]]`;
    return `${quote}\n${content}`.slice(0, 2000);
  };

  /** Upload into the media store via multipart (no base64 bloat → voice and
      video actually go through). */
  const uploadMedia = async (blob: Blob, kind: "image" | "video" | "voice") => {
    try {
      const ext = kind === "voice" ? "webm" : kind === "video" ? "mp4" : "jpg";
      const form = new FormData();
      form.append("file", blob, `upload.${ext}`);
      form.append("kind", kind);
      // Required: the server records which conversation this attachment
      // belongs to so that GET /api/chat/media/:id can verify the fetcher is
      // one of the two participants. Uploads without it are rejected.
      form.append("match", match.id);
      const res = await fetch("/api/chat/media", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        flash(j.error ?? "Upload failed. Please try again.");
        return null;
      }
      const json = await res.json();
      return `/api/chat/media/${json.id}`;
    } catch {
      flash("Upload failed. Check your connection.");
      return null;
    }
  };

  /** Live camera shot → straight into the conversation, no staging. */
  const handleCameraShot = async (dataUrl: string) => {
    setCameraOpen(false);
    setUploading(true);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const url = await uploadMedia(blob, "image");
      if (url) await postMessage(buildBody(`[[image:${url}]]`));
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    const clean = text.trim();
    if (!clean || sending || staged.length > 0) return;
    setSending(true);
    setText("");
    setReplyTo(null);
    const body = buildBody(clean);
    /* One path owns the echo: postMessage queues it, renders it, retires it by server id and
       marks it retryable if the send is refused. Pushing a second copy here is how the same
       text could appear twice until the next fetch. */
    await postMessage(body);
    setSending(false);
  };

  /* --- Staged media packet -------------------------------------------------- */

  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [uploading, setUploading] = useState(false);
  /** "+" attach menu (photo / video / live camera) + camera overlay state. */
  const [attachOpen, setAttachOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "video") => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      if (staged.length >= MAX_PACKET_ITEMS) break;
      if (file.size > 20 * 1024 * 1024) {
        flash("That file is over 20 MB. Trim it down and try again.");
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setStaged((s) =>
          s.length >= MAX_PACKET_ITEMS
            ? s
            : [...s, { id: Date.now() + Math.random(), kind, dataUrl: String(reader.result) }]
        );
      };
      reader.readAsDataURL(file);
    }
  };

  const sendPacket = async () => {
    if (uploading || sending) return;
    const items = staged;
    const caption = text.trim();
    if (items.length === 0 && caption) {
      void send();
      return;
    }
    if (items.length === 0) return;
    setUploading(true);
    setSending(true);
    setText("");
    setStaged([]);
    const markers: string[] = [];
    for (const item of items) {
      try {
        const blob = await (await fetch(item.dataUrl)).blob();
        const url = await uploadMedia(blob, item.kind);
        if (url) markers.push(`[[${item.kind}:${url}]]`);
      } catch {
        flash("One attachment couldn't be read, so it was skipped.");
      }
    }
    if (markers.length) {
      const content = [markers.join("\n"), caption].filter(Boolean).join("\n");
      await postMessage(buildBody(content));
    } else if (caption) {
      await postMessage(buildBody(caption));
    }
    setReplyTo(null);
    setUploading(false);
    setSending(false);
  };


  /* --- Bubble gestures: hold to copy, slide right to quote ------------------- */

  const bubbleHold = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  const onBubbleDown = (m: MessageRow) => (e: React.PointerEvent) => {
    if (bubbleHold.current?.timer) clearTimeout(bubbleHold.current.timer);
    bubbleHold.current = {
      id: m.id,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      timer: setTimeout(() => {
        const h = bubbleHold.current;
        if (h && h.id === m.id && !h.moved) setPickerFor({ id: m.id, x: h.x, y: h.y });
      }, 460),
    };
    /* Capture the pointer so the slide keeps firing even when the finger
       drifts outside the bubble — this is what made slide-to-quote die. */
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onBubbleMove = (e: React.PointerEvent) => {
    const h = bubbleHold.current;
    if (!h) return;
    const dx = e.clientX - h.x;
    const dy = e.clientY - h.y;
    if (!h.moved && (Math.abs(dx) > 14 || Math.abs(dy) > 14)) {
      if (h.timer) clearTimeout(h.timer);
      h.moved = true;
    }
    // Slide LEFT to quote (the direction members expect).
    if (h.moved) setQuoteArmedId(dx < -44 && Math.abs(dx) > Math.abs(dy) * 1.3 ? h.id : null);
  };

  const onBubbleUp = (m: MessageRow) => (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const h = bubbleHold.current;
    bubbleHold.current = null;
    if (!h) return;
    if (h.timer) clearTimeout(h.timer);
    // Double-tap = instant love (Telegram). A quick second tap on the same
    // bubble wins over everything else.
    if (!h.moved) {
      const now = Date.now();
      if (lastBubbleTap.current.id === m.id && now - lastBubbleTap.current.t < 320) {
        lastBubbleTap.current = { id: "", t: 0 };
        doubleTapLove(m);
        return;
      }
      lastBubbleTap.current = { id: m.id, t: now };
    }
    if (quoteArmedId === m.id) {
      setReplyTo({
        name: m.mine ? "You" : match.with.name,
        text: plainText(m.body).slice(0, 140) || previewBody(m.body),
      });
      flash("Replying to message. Slide back to cancel.");
    }
    setQuoteArmedId(null);
  };

  const copyMessage = async (m: MessageRow) => {
    const txt = plainText(m.body);
    try {
      await navigator.clipboard.writeText(txt);
      flash("Copied to clipboard.");
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        flash("Copied to clipboard.");
      } catch {
        flash("Couldn't copy on this device.");
      }
    }
    setSheetFor(null);
  };

  /* --- Render ------------------------------------------------------------------ */

  const rows: React.ReactNode[] = [];
  let lastDay = "";
  for (const m of messages) {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) {
      lastDay = day;
      rows.push(<DayDivider key={`day-${m.id}`} label={dayLabel(m.at)} />);
    }
    const segs = parseSegments(m.body);
    const mediaOnly = segs.every((s) => s.type === "media");
    rows.push(
      <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
        <div className="relative flex max-w-[78%] items-center gap-2">
          {m.failed && m.blocked ? (
            <span
              title="The server declined this message on purpose. Sending it again would be declined again."
              className="order-last shrink-0 rounded-full border border-white/[0.12] bg-white/[0.04] px-2 py-1 text-[10px] font-bold leading-none text-[var(--color-mist)]"
            >
              Not delivered
            </span>
          ) : m.failed ? (
            <button
              type="button"
              onClick={() => void retrySend(m.id)}
              className="order-last shrink-0 rounded-full border border-[var(--color-ember-400)]/50 bg-[var(--color-ember-500)]/15 px-2 py-1 text-[10px] font-bold leading-none text-[var(--color-ember-300)] transition-colors hover:bg-[var(--color-ember-500)]/25"
            >
              Not delivered — retry
            </button>
          ) : m.pending ? (
            <span className="order-last shrink-0 text-[10px] font-semibold leading-none text-white/45">
              Sending…
            </span>
          ) : null}
          {quoteArmedId === m.id ? (
            <span className="order-last text-[var(--color-gold-300)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 17l-5-5 5-5" />
              </svg>
            </span>
          ) : null}
          <div
            onPointerDown={onBubbleDown(m)}
            onPointerMove={onBubbleMove}
            onPointerUp={onBubbleUp(m)}
            onPointerCancel={() => {
              bubbleHold.current = null;
              setQuoteArmedId(null);
            }}
            style={{
              transform: quoteArmedId === m.id ? "translateX(-34px)" : undefined,
              transition: "transform 160ms ease",
            }}
            onContextMenu={(e) => e.preventDefault()}
            className={`fb-no-callout relative touch-pan-y select-none rounded-[20px] text-[14px] leading-6 ${
              mediaOnly ? "p-2" : "px-4 py-2.5"
            } ${
              m.mine
                ? "rounded-br-md bg-[var(--gradient-ember-warm)] text-white shadow-[0_8px_20px_-10px_rgba(239,94,94,0.6)]"
                : "rounded-bl-md border border-white/[0.07] bg-white/[0.045] text-[var(--color-ivory)]"
            }`}
          >
            {m.flagged && !m.mine ? (
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2">
                <svg className="mt-0.5 shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3l9 16H3l9-16z" />
                  <path d="M12 10v4M12 17h.01" />
                </svg>
                <p className="text-[10.5px] font-bold leading-4 text-amber-300">
                  Freeborn safety: this message matches patterns commonly used by scammers.
                  Never send money, gift cards, or crypto to someone you haven&apos;t met, and
                  report them from their profile.
                </p>
              </div>
            ) : null}
            <MessageContent body={m.body} onImage={setLightboxUrl} onVideo={setVideoUrl} />
            <span
              className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                m.mine ? "text-white/70" : "text-[var(--color-ash)]"
              }`}
            >
              {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {m.mine ? <Receipt read={m.read} /> : null}
            </span>
            {burstId === m.id ? (
              <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <svg
                  className="fb-heart-burst h-16 w-16 drop-shadow-[0_6px_18px_rgba(239,94,94,0.8)]"
                  viewBox="0 0 24 24"
                  fill="#ff6b7a"
                  aria-hidden
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              </span>
            ) : null}
          </div>
          {m.reactions && m.reactions.length > 0 ? (
            <div
              className={`absolute -bottom-3.5 z-10 flex gap-1 ${
                m.mine ? "right-1" : "left-1"
              }`}
            >
              {m.reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleReaction(m, r.emoji);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label={`React ${r.emoji} (${r.count})`}
                  className={`fb-pop-in flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-bold transition active:scale-90 ${
                    r.mine
                      ? "border-[var(--color-ember-500)]/60 bg-[#1c1013] text-[#ffb4a6]"
                      : "border-white/15 bg-[#141827] text-[var(--color-pearl)]"
                  }`}
                >
                  <span>{r.emoji}</span>
                  {r.count > 1 ? <span className="tabular-nums">{r.count}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-full min-h-[380px] flex-col overflow-hidden" style={{ height: heightPx ?? undefined }}>
      <div className="flex items-center gap-3 border-b border-white/[0.06] pb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-mist)] transition hover:text-[var(--color-pearl)]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onTapProfile(match.with.id)}
          aria-label={`View ${match.with.name}'s profile`}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-85"
        >
          <span className="relative shrink-0">
            <Avatar photo={match.with.photo} name={match.with.name} size={40} />
            {match.with.active ? (
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-[#2fbf71] ring-2 ring-[#0a0d18]" />
            ) : null}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-black">{match.with.name}</p>
            <p className="flex items-center gap-1.5 truncate text-[12px] text-[var(--color-mist)]">
              {match.with.active ? (
                <span className="flex items-center gap-1 font-bold text-[#5fd394]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2fbf71]" />
                  Active now
                </span>
              ) : (
                match.with.city || "Freeborn member"
              )}
            </p>
          </div>
        </button>

        {/* Call controls — top right */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCall("voice")}
            aria-label={`Voice call ${match.with.name}`}
            title="Voice call"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-teal-300)] transition hover:bg-white/[0.09] active:scale-95"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setCall("video")}
            aria-label={`Video call ${match.with.name}`}
            title="Video call"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-teal-300)] transition hover:bg-white/[0.09] active:scale-95"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="6" width="13" height="12" rx="2.5" />
              <path d="M16 10.5l5-3v9l-5-3" />
            </svg>
          </button>
        </div>
      </div>

      {toast ? (
        <div className="animate-scale-in mt-3 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3.5 py-2 text-center text-[12px] font-bold text-[var(--color-sand)]">
          {toast}
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden py-5">{rows.length > 0 ? rows : (
        <div className="pt-8 text-center">
          <p className="text-sm text-[var(--color-mist)]">The conversation is open. Say hello.</p>
          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--color-ash)]">
            Try an opener
          </p>
          <div className="mx-auto mt-2.5 flex max-w-[440px] flex-wrap justify-center gap-2">
            {ICEBREAKERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setText(s)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-sand)] transition hover:border-[var(--color-gold-500)]/50 hover:text-[var(--color-pearl)]"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
        <div ref={bottomRef} />
      </div>

      {/* Hidden file pickers */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onFilePicked(e, "image")}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => onFilePicked(e, "video")}
      />

      {/* Staged media packet */}
      {staged.length > 0 ? (
        <div className="mb-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2.5">
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--color-sand)]">
              Packet · {staged.length} {staged.length === 1 ? "item" : "items"}, sent together
            </p>
            <button
              type="button"
              onClick={() => setStaged([])}
              className="text-[11px] font-bold text-[var(--color-ash)] transition hover:text-[var(--color-pearl)]"
            >
              Clear
            </button>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {staged.map((item, i) => (
              <div key={item.id} className="relative shrink-0">
                {item.kind === "image" ? (
                  <img
                    src={item.dataUrl}
                    alt={`Staged photo ${i + 1}`}
                    className="h-[76px] w-[76px] rounded-2xl border border-white/15 object-cover"
                  />
                ) : (
                  <div className="relative">
                    <video
                      src={item.dataUrl}
                      muted
                      playsInline
                      className="h-[76px] w-[76px] rounded-2xl border border-white/15 bg-black object-cover"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M8 5.4v13.2c0 .9 1 1.5 1.8 1L20 13a1.2 1.2 0 000-2L9.8 4.4c-.8-.5-1.8.1-1.8 1z" />
                        </svg>
                      </span>
                    </span>
                    <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-px text-[8.5px] font-black uppercase tracking-wider text-white/90">
                      Video
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setStaged((s) => s.filter((x) => x.id !== item.id))}
                  aria-label="Remove attachment"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/85 text-white ring-1 ring-white/25 transition hover:bg-black"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Reply / quote preview */}
      {replyTo ? (
        <div className="mb-2 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5">
          <span className="h-8 w-[3px] shrink-0 rounded-full bg-[var(--color-gold-500)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-wide text-[var(--color-gold-300)]">
              Replying to {replyTo.name}
            </p>
            <p className="truncate text-[12.5px] text-[var(--color-mist)]">{replyTo.text}</p>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="Cancel reply"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[var(--color-mist)] transition hover:bg-white/[0.12]"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ) : null}


      {threadAccess && !threadAccess.canSend ? (
        <ReadOnlyThreadNotice notice={threadAccess.notice} />
      ) : null}

      {/* Composer — voice recording overlays it Telegram-style */}
      {threadAccess && !threadAccess.canSend ? null : (
      <div className="relative flex w-full max-w-full items-center gap-2 border-t border-white/[0.06] pt-4">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setAttachOpen((o) => !o)}
            disabled={uploading}
            aria-label="Attach photos, videos or a live picture"
            aria-expanded={attachOpen}
            title="Attach"
            className={`flex h-11 w-11 items-center justify-center rounded-full border transition active:scale-95 disabled:opacity-40 ${
              attachOpen
                ? "border-[var(--color-gold-500)]/60 bg-[var(--color-gold-500)]/10 text-[var(--color-gold-300)]"
                : "border-white/10 bg-white/[0.04] text-[var(--color-sand)] hover:bg-white/[0.08] hover:text-[var(--color-pearl)]"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {attachOpen ? (
            <>
              <div className="fixed inset-0 z-[55]" onClick={() => setAttachOpen(false)} />
              <div className="animate-scale-in absolute bottom-14 left-0 z-[56] w-[232px] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#10141f] shadow-[0_30px_80px_-16px_rgba(0,0,0,0.9)]">
                <button
                  type="button"
                  onClick={() => {
                    setAttachOpen(false);
                    fileRef.current?.click();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] font-bold text-[var(--color-pearl)] transition hover:bg-white/[0.05]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <circle cx="9" cy="10" r="1.6" />
                    <path d="M21 16l-4.5-4.5L9 18" />
                  </svg>
                  Photo from gallery
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachOpen(false);
                    videoRef.current?.click();
                  }}
                  className="flex w-full items-center gap-3 border-t border-white/[0.06] px-4 py-3 text-left text-[13px] font-bold text-[var(--color-pearl)] transition hover:bg-white/[0.05]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="6" width="13" height="12" rx="2.5" />
                    <path d="M16 10.5l5-3v9l-5-3" />
                  </svg>
                  Video from gallery
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachOpen(false);
                    setCameraOpen(true);
                  }}
                  className="flex w-full items-center gap-3 border-t border-white/[0.06] px-4 py-3 text-left text-[13px] font-bold text-[var(--color-gold-300)] transition hover:bg-white/[0.05]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 8.2h3l1.6-2.4h6.8L17 8.2h3a1.5 1.5 0 011.5 1.5v8.6A1.5 1.5 0 0120 19.8H4a1.5 1.5 0 01-1.5-1.5V9.7A1.5 1.5 0 014 8.2z" />
                    <circle cx="12" cy="13.6" r="3.4" />
                  </svg>
                  Take a live picture
                </button>
              </div>
            </>
          ) : null}
        </div>

        <textarea
          ref={composerRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (staged.length > 0) void sendPacket();
              else void send();
            }
          }}
          placeholder={staged.length > 0 ? "Add a caption to the packet\u2026" : `Message ${match.with.name}\u2026`}
          maxLength={1800}
          autoComplete="off"
          enterKeyHint="send"
          rows={1}
          className="max-h-[160px] min-h-[48px] min-w-0 flex-1 resize-none overflow-y-auto rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-[14px] leading-5 text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)] focus:border-[var(--color-gold-500)]"
        />

        <VoiceRecorder
          onSend={(dataUrl, seconds) => void sendVoice(dataUrl, seconds)}
          onError={flash}
          disabled={uploading}
        />

        <button
          type="button"
          onClick={() => (staged.length > 0 ? void sendPacket() : void send())}
          disabled={sending || uploading || (!text.trim() && staged.length === 0)}
          aria-label={staged.length > 0 ? "Send packet" : "Send message"}
          title={staged.length > 0 ? "Send packet" : "Send message"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] text-white shadow-[var(--shadow-primary-btn)] transition active:scale-95 disabled:opacity-40"
        >
          {staged.length > 0 ? (
            <span className="text-[13px] font-black">{staged.length}</span>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
        </button>
      </div>
      )}

      {/* Hold-to-react picker (double-tap = instant love) */}
      {pickerFor
        ? (() => {
            const msg = messages.find((x) => x.id === pickerFor.id);
            if (!msg) return null;
            const left = Math.max(12, Math.min((typeof window !== "undefined" ? window.innerWidth : 360) - 310, pickerFor.x - 150));
            const top = Math.max(80, pickerFor.y - 74);
            return (
              <div className="fixed inset-0 z-[145]" onClick={() => setPickerFor(null)}>
                <div
                  className="fb-pop-in fixed flex items-center gap-1 rounded-full border border-white/[0.1] bg-[#10141f] px-2 py-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)]"
                  style={{ left, top }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {REACTION_EMOJIS.map((emo) => (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => {
                        void toggleReaction(msg, emo);
                        setPickerFor(null);
                      }}
                      aria-label={`React ${emo}`}
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-[20px] transition hover:scale-125 hover:bg-white/[0.08] ${
                        msg.reactions.some((r) => r.emoji === emo && r.mine)
                          ? "bg-[var(--color-ember-500)]/25"
                          : ""
                      }`}
                    >
                      {emo}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setSheetFor(msg);
                      setPickerFor(null);
                    }}
                    aria-label="More actions"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-mist)] transition hover:bg-white/[0.08] hover:text-[var(--color-pearl)]"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="5" cy="12" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })()
        : null}

      {/* Long-press action sheet */}
      {sheetFor ? (
        <div
          className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setSheetFor(null)}
        >
          <div
            className="animate-scale-in w-full max-w-[360px] overflow-hidden rounded-3xl border border-white/[0.09] bg-[#0c101d] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/[0.06] px-5 py-3.5">
              <p className="line-clamp-2 text-[12.5px] leading-5 text-[var(--color-mist)]">
                {plainText(sheetFor.body).slice(0, 120) || "Media message"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyMessage(sheetFor)}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[14px] font-bold text-[var(--color-pearl)] transition hover:bg-white/[0.05]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 012-2h10" />
              </svg>
              Copy text
            </button>
            <button
              type="button"
              onClick={() => {
                setReplyTo({
                  name: sheetFor.mine ? "You" : match.with.name,
                  text: plainText(sheetFor.body).slice(0, 140) || previewBody(sheetFor.body),
                });
                setSheetFor(null);
              }}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[14px] font-bold text-[var(--color-pearl)] transition hover:bg-white/[0.05]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 17l5-5-5-5" transform="rotate(180 12 12)" />
                <path d="M4 12h12" />
              </svg>
              Reply with quote
            </button>
            <button
              type="button"
              onClick={() => setSheetFor(null)}
              className="w-full border-t border-white/[0.06] px-5 py-3.5 text-center text-[13px] font-bold text-[var(--color-ash)] transition hover:text-[var(--color-pearl)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {lightboxUrl ? (
        <PhotoLightbox
          photos={[lightboxUrl]}
          name={match.with.name}
          onClose={() => setLightboxUrl(null)}
        />
      ) : null}

      {/* Full-size video viewer with a real close button */}
      {videoUrl ? (
        <div className="fixed inset-0 z-[190] flex flex-col bg-black">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setVideoUrl(null)}
              aria-label="Close video"
              className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-[12px] font-black uppercase tracking-wider text-white transition hover:bg-white/[0.12]"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Close
            </button>
            <p className="text-[12px] font-bold uppercase tracking-wider text-white/60">
              Video from {match.with.name}
            </p>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            <video src={videoUrl} controls autoPlay playsInline className="max-h-full max-w-full rounded-xl" />
          </div>
        </div>
      ) : null}

      {cameraOpen ? (
        <CameraCapture
          onCapture={(dataUrl) => void handleCameraShot(dataUrl)}
          onClose={() => setCameraOpen(false)}
        />
      ) : null}

      {call ? (
        <CallOverlay
          kind={call}
          role="caller"
          matchId={match.id}
          peer={{ id: match.with.id, name: match.with.name, photo: match.with.photo }}
          self={self}
          onCallEnd={(k, secs) => {
            if (secs > 0) void postMessage(`[[call:${k}|${secs}]]`);
          }}
          onClose={() => setCall(null)}
        />
      ) : null}
    </div>
  );
}

export function ChatView() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMatch, setOpenMatch] = useState<MatchRow | null>(null);
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = await getAccessToken();
    setToken(t);
    const res = await fetch("/api/chat/matches", {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    if (res.ok) {
      const json = await res.json();
      setMatches(json.matches);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // F10: defer state-producing work out of the effect body.
    queueMicrotask(() => void load());
  }, [load]);

  /* Tell the app shell when a conversation is open, so the bottom tab bar
     hides — and returns when you go back to the message list. */
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("freeborn:chat-thread", { detail: { open: Boolean(openMatch) } }));
  }, [openMatch]);

  useEffect(() => {
    if (loading) return;
    const param = new URLSearchParams(window.location.search).get("match");
    if (!param) return;
    const found = matches.find((m) => m.id === param);
    if (found) {
      queueMicrotask(() => setOpenMatch(found));
    } else {
      queueMicrotask(() => void load());
    }
  }, [loading, matches, load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-gold-500)] border-t-transparent" />
      </div>
    );
  }

  const profileOverlay = openProfileId ? (
    <ProfileView profileId={openProfileId} onClose={() => setOpenProfileId(null)} />
  ) : null;

  if (openMatch) {
    return (
      <>
        <Thread
          match={openMatch}
          token={token}
          onBack={() => setOpenMatch(null)}
          onChanged={() => void load()}
          onTapProfile={(id) => setOpenProfileId(id)}
        />
        {profileOverlay}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[680px]">
      <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Chat</h1>
      <p className="mt-1.5 text-sm text-[var(--color-mist)]">
        Your matches and conversations, values already on the table.
      </p>

      {matches.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-white/[0.07] bg-white/[0.02] p-10 text-center">
          <p className="font-display text-xl font-semibold">No conversations yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--color-mist)]">
            When you like someone in Discover and it&apos;s mutual, the conversation opens here.
          </p>
          <a
            href="/app"
            className="btn-ember btn-shine relative mt-6 inline-flex overflow-hidden rounded-full px-7 py-3 text-sm font-bold"
          >
            Go to Discover
          </a>
        </div>
      ) : (
        <div className="mt-6 space-y-2.5">
          {matches.map((m) => (
            <div
              key={m.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenMatch(m)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setOpenMatch(m);
              }}
              className="flex w-full cursor-pointer items-center gap-4 rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-4 text-left transition hover:border-white/[0.14] hover:bg-white/[0.05]"
            >
              <button
                type="button"
                aria-label={`View ${m.with.name}'s profile`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenProfileId(m.with.id);
                }}
                className="shrink-0 transition hover:opacity-85"
              >
                <span className="relative block">
                  <Avatar photo={m.with.photo} name={m.with.name} />
                  {m.with.active ? (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-[#2fbf71] ring-2 ring-[#0a0d18]" />
                  ) : null}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px] font-black">{m.with.name}</p>
                  {m.lastMessage ? (
                    <span className="shrink-0 text-[11px] text-[var(--color-ash)]">
                      {timeAgo(m.lastMessage.at)}
                    </span>
                  ) : null}
                </div>
                <p className={`truncate text-[13px] ${m.unread > 0 ? "font-bold text-[var(--color-pearl)]" : "text-[var(--color-mist)]"}`}>
                  {m.lastMessage
                    ? `${m.lastMessage.mine ? "You: " : ""}${previewBody(m.lastMessage.body)}`
                    : "Say hello. The conversation is open."}
                </p>
              </div>
              {m.unread > 0 ? (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] px-1.5 text-[11px] font-black text-white">
                  {m.unread}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {profileOverlay}
    </div>
  );
}
