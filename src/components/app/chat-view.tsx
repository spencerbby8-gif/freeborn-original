"use client";
import { FreebornLoader } from "@/components/ui/freeborn-loader";

import { createChatPreviewUrl } from "@/lib/chat-preview-url";
import { CHAT_FILE_ACCEPT, CHAT_FILE_MAX, chatFileMime, safeChatFilename } from "@/lib/chat-file";
import { ChatHeader, ChatSendIcon } from "@/components/prototype/chat-chrome";
import { PhotoImage } from "@/components/ui/photo-image";
import { Button } from "@/components/ui/button";
import { AuthedVideo } from "@/components/ui/authed-media";
import { useModalFocus } from "@/components/prototype/modal-focus";
import { PrototypeIcon } from "@/components/prototype/frame";
import { MessagesHeading } from "@/components/prototype/screens";
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
import { MemberDetail } from "@/components/prototype/member-detail";
import { ChatPhoto, PhotoViewer, VoiceBubble, VoiceRecorder } from "@/components/prototype/media";
import { CallOverlay } from "./call-overlay";



type MatchRow = {
  id: string;
  ended?: boolean;
  with: {
    id: string;
    name: string;
    city: string;
    photo: string;
    active?: boolean;
    lastActiveAt?: string | null;
    verified?: boolean;
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

type StagedItem = {
  id: number;
  kind: "image" | "video" | "file";
  dataUrl: string;
  file: File;
  dur?: number;
  name?: string;
  uploadedUrl?: string;
};

const MEDIA_RE = /^\[\[(image|video|voice|call|file):([^\]|]+)(?:\|([^\]]+))?\]\]$/;
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
  if (/\[\[file:/.test(body)) return "Document";
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
  | { type: "media"; items: { kind: string; url: string; dur?: number; name?: string }[] }
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
      const item = { kind: m[1], url: m[2], dur: m[1]!=="file" && m[3] ? Number(m[3]) : undefined, name: m[1]==="file" ? (()=>{try{return decodeURIComponent(m[3]||"Document");}catch{return "Document";}})() : undefined };
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
              .map((i) => (i.kind === "file" ? "[Document]" : i.kind === "voice" ? "[Voice note]" : i.kind === "video" ? "[Video]" : "[Photo]"))
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

/** In-thread video tile: draws the first frame as its poster and shows the
 *  runtime chip even for packets sent before durations were stamped. */
function VideoTile({
  url,
  dur,
  onOpen,
}: {
  url: string;
  dur?: number;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [seconds, setSeconds] = useState<number | null>(dur ?? null);
  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label="Open video full size"
      className="reference-video-tile"
    >
      <AuthedVideo
        ref={ref}
        src={url}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={() => {
          const v = ref.current;
          if (!v) return;
          if (Number.isFinite(v.duration) && v.duration > 0) setSeconds(v.duration);
          /* Recorded webms report Infinity until first seek. */
          if ((v.duration > 0.25 || v.duration === Infinity) && v.currentTime < 0.05) {
            v.currentTime = 0.1;
          }
        }}
        onSeeked={() => {
          const v = ref.current;
          if (v && Number.isFinite(v.duration) && v.duration > 0) setSeconds(v.duration);
        }}
        className="max-h-[300px] w-full rounded-xl object-cover"
      />
      <span className="reference-video-play"><PrototypeIcon name="video"/></span><span className="reference-video-caption">Play video{seconds?` · ${Math.floor(seconds/60)}:${String(Math.round(seconds)%60).padStart(2,'0')}`:''}</span>
    </button>
  );
}

function DocumentAttachment({url,name="Document"}:{url:string;name?:string}){
 const [busy,setBusy]=useState(false);const [error,setError]=useState(false);
 return <div className="chat-document"><Button unstyled type="button" disabled={busy} onPointerDown={e=>e.stopPropagation()} onClick={async()=>{if(!/^\/api\/chat\/media\/[a-f0-9-]{36}$/.test(url)){setError(true);return;}setBusy(true);setError(false);try{const token=await getAccessToken();const r=await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{}});if(!r.ok)throw Error('Download refused');const objectUrl=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=objectUrl;a.download=safeChatFilename(name);a.click();window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);}catch{setError(true);}finally{setBusy(false);}}}><PrototypeIcon name="file"/><span><b>{safeChatFilename(name)}</b><small>{busy?'Downloading…':'Download document'}</small></span><PrototypeIcon name="next"/></Button>{error&&<p role="alert">Could not download. Check your access and try again.</p>}</div>;
}

function MediaPacket({
  items,
  onImage,
  onVideo,
}: {
  items: { kind: string; url: string; dur?: number; name?: string }[];
  onImage: (url: string) => void;
  onVideo: (url: string) => void;
}) {
  const visuals = items.filter((i) => i.kind === "image" || i.kind === "video");
  const voices = items.filter((i) => i.kind === "voice");
  return (
    <div className="space-y-2">
      {items.filter(i=>i.kind==="file").map((item,i)=><DocumentAttachment key={i} url={item.url} name={item.name}/>)}
      {visuals.length > 0 ? (
        <div className="reference-packet-visuals">
          {visuals.map((item, i) =>
            item.kind === "image" ? (
              <ChatPhoto key={i} url={item.url} onOpen={()=>onImage(item.url)}/>
            ) : (
              <VideoTile
                key={i}
                url={item.url}
                dur={item.dur}
                onOpen={() => onVideo(item.url)}
              />
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
    <div className="reference-chat-day">{label}</div>
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

export function Thread({
  match,
  token,
  onBack,
  onChanged,
  onTapProfile,
  initialDraft = "",
}: {
  initialDraft?: string;
  match: MatchRow;
  token: string | null;
  onBack: () => void;
  onChanged: () => void;
  onTapProfile: (id: string) => void;
}) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [initialMessages,setInitialMessages]=useState<"loading"|"ready"|"error">("loading");
  const [text, setText] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  const [call, setCall] = useState<"voice" | "video" | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<MessageRow | null>(null);
  useModalFocus(Boolean(sheetFor));
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
      const parent = bottomRef.current?.closest(".fb-thread")?.parentElement;
      setHeightPx(Math.max(220, Math.min(parent?.clientHeight ?? vh, vh)));
    };
    measure();
    const parent = bottomRef.current?.closest(".fb-thread")?.parentElement;
    const observer = new ResizeObserver(measure);
    if (parent) observer.observe(parent);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
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
  /* B12 — the other member's keystrokes, live on the banner. A typing notice
     extends the window by 4s; silence clears it. Ephemeral BY DESIGN: keystrokes
     keep coming every second while someone types, so a lost notice costs a
     moment of dots, never a message - unlike a message, which has the durable
     signal row and the poll floor behind it (see src/lib/chat-sync.ts). */
  const [peerTyping, setPeerTyping] = useState(false);
  const typingUntilRef = useRef(0);
  const lastTypingSentRef = useRef(0);
  /* B19 — "they stopped typing" is a real signal now, not just a timeout: the
     sender debounces 900 ms of silence into one typing-stop notice so the dots
     fall the moment the other member's hands leave the keyboard. */
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* setText("") is programmatic, so the composer's onChange never fires on a
     send: saying "stopped" here is what makes the dots fall WITH the message
     landing, not 900 ms later. */
  const stopTypingNotice = () => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    relayMessageNotice(match.id, "typing-stop");
  };
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
      setInitialMessages(previous=>previous==="ready"?previous:"error");
      return false;
    }
    setInitialMessages("ready");
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
      onNotice: (notice) => {
        /* A typing notice moves the indicator and nothing else - it must not
           cost a thread fetch per keystroke. */
        if (notice?.kind === "typing") {
          typingUntilRef.current = Date.now() + 4000;
          setPeerTyping(true);
          return;
        }
        /* B19 — the sender says their hands stopped. Clear at once; the 4 s
           expiry stays only as the safety net for a lost stop notice. */
        if (notice?.kind === "typing-stop") {
          typingUntilRef.current = 0;
          setPeerTyping(false);
          return;
        }
        syncRef.current.notices += 1;
        /* B19 — a message means they are no longer typing: drop the dots with
           the same wake-up instead of letting them sit out their expiry. */
        if (notice?.kind === "message") {
          typingUntilRef.current = 0;
          setPeerTyping(false);
        }
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
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
      bus.dispose();
      busRef.current = null;
    };
  }, [match.id, load, armPoll]);

  /* Clear the dots once the other side goes quiet. The sweep is the safety net
     for a lost typing-stop notice; 250 ms keeps even that fallback under a
     third of a second past the expiry instead of adding up to 600 ms of lag. */
  useEffect(() => {
    const iv = setInterval(() => {
      if (typingUntilRef.current && Date.now() > typingUntilRef.current) {
        typingUntilRef.current = 0;
        setPeerTyping(false);
      }
    }, 250);
    return () => clearInterval(iv);
  }, []);

  /* Instant snap to the latest message — the chat always opens AT the
     current conversation, never hanging at the top. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const firstScroll = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    if (!firstScroll.current) {
      el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
      if (!url) return false; // Keep the recorder preview available for retry
      await postMessage(buildBody(`[[voice:${url}|${seconds}]]`));
      setReplyTo(null);
      return true;
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
    return `${quote}\n${content}`;
  };

  /** Upload into the media store via multipart (no base64 bloat → voice and
      video actually go through). */
  const uploadMedia = async (blob: Blob, kind: "image" | "video" | "voice" | "file") => {
    try {
      const ext = kind === "voice" ? "webm" : kind === "video" ? "mp4" : "jpg";
      const form = new FormData();
      form.append("file", blob, blob instanceof File ? blob.name : `upload.${ext}`);
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

  const send = async () => {
    const clean = text.trim();
    if (!clean || sending || staged.length > 0) return;
    const body = buildBody(clean);
    if(body.length>2000){flash("Shorten your message or quoted reply to fit 2000 characters.");return;}
    setSending(true);
    setText("");
    setReplyTo(null);
    stopTypingNotice();
    /* One path owns the echo: postMessage queues it, renders it, retires it by server id and
       marks it retryable if the send is refused. Pushing a second copy here is how the same
       text could appear twice until the next fetch. */
    await postMessage(body);
    setSending(false);
  };

  /* --- Staged media packet -------------------------------------------------- */

  const documentRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const stagedUrls=useRef(new Set<string>());const pendingProbes=useRef(new Set<()=>void>());const stagingAlive=useRef(true);
  useEffect(()=>{const urls=stagedUrls.current,probes=pendingProbes.current;stagingAlive.current=true;return()=>{stagingAlive.current=false;for(const cancel of probes)cancel();probes.clear();for(const url of urls)URL.revokeObjectURL(url);urls.clear();};},[]);
  useEffect(()=>{const active=new Set(staged.map(i=>i.dataUrl));for(const url of stagedUrls.current){if(!active.has(url)){URL.revokeObjectURL(url);stagedUrls.current.delete(url);}}},[staged]);
  const [uploading, setUploading] = useState(false);
  /** "+" attach menu (photo / video / live camera) + camera overlay state. */
  const [attachOpen, setAttachOpen] = useState(false);
  useEffect(()=>{if(!attachOpen)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setAttachOpen(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[attachOpen]);
  const [showVoice, setShowVoice] = useState(false);


  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "video" | "file") => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      if (staged.length >= MAX_PACKET_ITEMS) break;
      const max=kind==="video"?20*1024*1024:CHAT_FILE_MAX;
      if(kind==="file"&&!chatFileMime(file.name)){flash("Choose a PDF, text, CSV or Office document.");continue;}
      if (file.size > max) {
        flash(`That file is over ${max/1024/1024} MB. Choose a smaller file.`);
        continue;
      }
      if(kind==="file"){setStaged(s=>s.length>=MAX_PACKET_ITEMS?s:[...s,{id:Date.now()+Math.random(),kind,dataUrl:"",file,name:safeChatFilename(file.name)}]);continue;}
      // Object URLs are opaque local references, never DOM text/data URLs.
      const add = (dur?: number) => {
        if(!stagingAlive.current)return;
        let dataUrl:string;try{dataUrl=createChatPreviewUrl(file,kind);}catch{flash(`Choose a supported ${kind} file.`);return;}stagedUrls.current.add(dataUrl);
        setStaged(items=>{if(items.length>=MAX_PACKET_ITEMS){URL.revokeObjectURL(dataUrl);stagedUrls.current.delete(dataUrl);return items;}return [...items,{id:Date.now()+Math.random(),kind,dataUrl,file,dur}];});
      };
      if(kind==='video'){
        const probe=document.createElement('video');probe.preload='metadata';
        let probeUrl:string;try{probeUrl=createChatPreviewUrl(file,kind);}catch{flash("Choose a supported video file.");continue;}let settled=false;
        const finish=(dur?:number)=>{if(settled)return;settled=true;clearTimeout(deadline);probe.removeAttribute('src');probe.load();URL.revokeObjectURL(probeUrl);pendingProbes.current.delete(cancel);add(dur);};
        const cancel=()=>{if(settled)return;settled=true;clearTimeout(deadline);probe.removeAttribute('src');probe.load();URL.revokeObjectURL(probeUrl);};
        const deadline=window.setTimeout(()=>finish(),5000);pendingProbes.current.add(cancel);
        probe.onloadedmetadata=()=>{if(Number.isFinite(probe.duration)&&probe.duration>0)finish(probe.duration);else if(probe.duration===Infinity)probe.currentTime=.1;else finish();};
        probe.onseeked=()=>finish(Number.isFinite(probe.duration)&&probe.duration>0?probe.duration:undefined);
        probe.onerror=()=>finish();probe.src=probeUrl;
      }else add();
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
    stopTypingNotice();
    const markers: string[] = [];
    let failed=false;
    for (const item of items) {
      try {
        const blob = item.file;
        const url = item.uploadedUrl ?? await uploadMedia(blob, item.kind);
        if (!url) {failed=true;continue;}
        // Keep uploaded ids for a retry; never upload the same successful file twice.
        setStaged(s=>s.map(i=>i.id===item.id?{...i,uploadedUrl:url}:i));
        const meta=item.kind==='file'?`|${encodeURIComponent(safeChatFilename(item.name||'Document'))}`:item.dur?`|${item.dur.toFixed(1)}`:'';
        markers.push(`[[${item.kind}:${url}${meta}]]`);
      } catch { failed=true; }
    }
    if(failed){flash("Some attachments didn’t upload. Your files and caption are kept — try Send packet again.");setUploading(false);setSending(false);return;}
    const content = [markers.join("\n"), caption].filter(Boolean).join("\n");
    const packetBody=buildBody(content);
    if(packetBody.length>2000){flash("This packet is too long. Shorten the caption or send fewer attachments together. Your files are kept.");setUploading(false);setSending(false);return;}
    await postMessage(packetBody);
    // postMessage owns the retained failed-send bubble if delivery is refused.
    setText(current=>current.trim()===caption?"":current);setStaged(current=>current.filter(i=>!items.some(sent=>sent.id===i.id)));
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
    const hasMedia = segs.some((s) => s.type === "media");
    rows.push(
      <div key={m.id} className={`reference-message-row flex ${m.mine ? "justify-end" : "justify-start"}`}>
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
            className={`fb-bubble ${hasMedia?"reference-has-media":""} ${mediaOnly?"reference-media-only":""} ${m.mine?"out":"in"} fb-no-callout relative touch-pan-y select-none rounded-[20px] text-[14px] leading-6 ${
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
              className={`chat-receipt sr-only ${
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
    <div className="fb-thread reference-chat flex w-full max-w-full flex-col overflow-hidden" style={{ height: heightPx ?? undefined }}>
      <ChatHeader name={match.with.name} photo={match.with.photo} verified={match.with.verified} active={match.with.active} subtitle={peerTyping?'typing…':match.with.active?'Active now':match.with.city||'Freeborn member'} onBack={onBack} onProfile={()=>onTapProfile(match.with.id)}>
        <details className="reference-chat-more"><summary className="bare-icon" aria-label="Conversation options"><PrototypeIcon name="more"/></summary><div className="reference-chat-menu"><button type="button" onClick={e=>{e.currentTarget.closest("details")?.removeAttribute("open");setCall("voice");}} aria-label={`Voice call ${match.with.name}`}>Voice call</button><button type="button" onClick={e=>{e.currentTarget.closest("details")?.removeAttribute("open");setCall("video");}} aria-label={`Video call ${match.with.name}`}>Video call</button><button type="button" onClick={()=>onTapProfile(match.with.id)}>View profile &amp; safety</button></div></details>
      </ChatHeader>

      {toast ? (
        <div role="status" className="reference-chat-notice animate-scale-in mt-3 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3.5 py-2 text-center text-[12px] font-bold text-[var(--color-sand)]">
          {toast}
        </div>
      ) : null}

      <div ref={scrollRef} className="fb-thread-feed reference-chat-feed">{initialMessages==="loading"&&rows.length===0?<FreebornLoader/>:initialMessages==="error"&&rows.length===0?<div className="reference-thread-error" role="alert"><p>Could not load this conversation.</p><Button unstyled type="button" className="btn-ghost" onClick={()=>void load()}>Try again</Button></div>:rows.length > 0 ? rows : (
        <div className="reference-thread-empty">
          <h2 className="display">Start with something real.</h2>
          <p>Your conversation is open. Choose a thought below or write your own.</p>
          <div className="reference-openers">{ICEBREAKERS.map(s=><Button unstyled key={s} type="button" onClick={()=>setText(s)}>{s}</Button>)}</div>
        </div>
      )}
        {peerTyping&&<div className="reference-typing" role="status" aria-label={`${match.with.name} is typing`}><i/><i/><i/></div>}
        <div ref={bottomRef} className="reference-chat-bottom"/>
      </div>

      {/* Hidden file pickers */}
      <input ref={documentRef} type="file" accept={CHAT_FILE_ACCEPT} multiple className="hidden" aria-label="Choose documents" onChange={e=>onFilePicked(e,"file")}/>
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

      {staged.length>0&&<section className="reference-attachment-draft" aria-label="Attachment preview"><header><span className="coral-label">Ready to share · {staged.length}</span><button type="button" onClick={()=>setStaged([])} disabled={uploading}>Clear</button></header><div className="reference-attachment-strip">{staged.map((item,i)=><figure key={item.id}>{item.kind==='file'?<div className="reference-document-preview"><PrototypeIcon name="file"/><span>{item.name}</span></div>:item.kind==='image'?<img src={item.dataUrl} alt={`Staged photo ${i+1}`}/>:<video src={item.dataUrl} muted playsInline/>}<button type="button" aria-label="Remove attachment" disabled={uploading} onClick={()=>setStaged(list=>list.filter(v=>v.id!==item.id))}><PrototypeIcon name="close"/></button></figure>)}</div><p>Add a caption below, then send when you’re ready.</p></section>}

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
      <div className="fb-composer reference-chat-composer">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setAttachOpen((o) => !o)}
            disabled={uploading}
            aria-label="Attach photos, videos or documents"
            aria-expanded={attachOpen}
            title="Attach"
            style={{position:"relative",zIndex:attachOpen?56:undefined}}
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
              <div className="reference-attachment-menu" role="menu" aria-label="Share in conversation">{[{label:'Photo from gallery',icon:'photo',ref:fileRef},{label:'Video from gallery',icon:'video',ref:videoRef},{label:'Share a document',icon:'file',ref:documentRef}].map(item=><button type="button" role="menuitem" key={item.label} onClick={()=>{setAttachOpen(false);item.ref.current?.click();}}><PrototypeIcon name={item.icon as 'photo'|'video'|'file'}/><span>{item.label}</span><PrototypeIcon name="next"/></button>)}</div>
            </>
          ) : null}
        </div>

        <textarea
          ref={composerRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            /* B19 - the indicator starts with the FIRST change, whatever its
               source: keys, paste, IME commit, autocomplete, a phone keyboard.
               Change-driven also means the very first keystroke is never held
               back by a throttle window; later changes re-affirm at most every
               700 ms so the receiver's safety net never lapses mid-sentence. */
            const now = Date.now();
            if (now - lastTypingSentRef.current > 700) {
              lastTypingSentRef.current = now;
              relayMessageNotice(match.id, "typing");
            }
            /* ...and it ends when they stop: 900 ms of silence sends one
               typing-stop notice. Re-armed on every change, so it only ever
               fires after the last keystroke. */
            if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
            typingStopTimerRef.current = setTimeout(() => {
              typingStopTimerRef.current = null;
              relayMessageNotice(match.id, "typing-stop");
            }, 900);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (staged.length > 0) void sendPacket();
              else void send();
            }
          }}
          aria-label="Message"
          placeholder={staged.length > 0 ? "Add a caption to the packet\u2026" : "Write something thoughtful..."}
          maxLength={1800}
          autoComplete="off"
          enterKeyHint="send"
          rows={1}
          className="max-h-[160px] min-h-[48px] min-w-0 flex-1 resize-none overflow-y-auto rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-[14px] leading-5 text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)] focus:border-[var(--color-gold-500)]"
        />

        <button type="button" className="reference-mic-button bare-icon" aria-label="Record a voice note" disabled={uploading||sending} onClick={()=>setShowVoice(true)}><PrototypeIcon name="mic"/></button>

        <button
          type="button"
          onClick={() => (staged.length > 0 ? void sendPacket() : void send())}
          disabled={sending || uploading || (!text.trim() && staged.length === 0)}
          aria-label={staged.length > 0 ? "Send packet" : "Send message"}
          title={staged.length > 0 ? "Send packet" : "Send message"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] text-white shadow-[var(--shadow-primary-btn)] transition active:scale-95 disabled:opacity-40"
        >
          <ChatSendIcon/>
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
                  className="reference-reactions"
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

      {sheetFor&&<div className="new-sheet-shade reference-message-shade" onClick={()=>setSheetFor(null)}><div className="new-sheet reference-message-sheet" role="dialog" aria-modal="true" aria-label="Message actions" onClick={e=>e.stopPropagation()}><span className="coral-label">In this conversation</span><p>{plainText(sheetFor.body).slice(0,120)||'Shared attachment'}</p><button type="button" onClick={()=>void copyMessage(sheetFor)}>Copy text</button><button type="button" onClick={()=>{setReplyTo({name:sheetFor.mine?'You':match.with.name,text:plainText(sheetFor.body).slice(0,140)||previewBody(sheetFor.body)});setSheetFor(null);}}>Reply with quote</button><button type="button" className="btn-ghost wide" onClick={()=>setSheetFor(null)}>Cancel</button></div></div>}

      {lightboxUrl ? (
        <PhotoViewer
          photos={[lightboxUrl]}
          name={match.with.name}
          onClose={() => setLightboxUrl(null)}
        />
      ) : null}

      {videoUrl&&<div className="reference-photo-viewer" role="dialog" aria-modal="true" aria-label="Shared video"><header><button className="bare-icon" type="button" aria-label="Close video" onClick={()=>setVideoUrl(null)}><PrototypeIcon name="back"/></button><span>Shared video<small>{match.with.name}</small></span></header><div className="reference-photo-stage"><AuthedVideo src={videoUrl} controls autoPlay playsInline className="reference-video-full"/></div></div>}
      {showVoice&&<VoiceRecorder onSend={sendVoice} onClose={()=>setShowVoice(false)}/>}

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

/* Message requests in both directions (owner addendum 2026-11-15). Declared
   above the component so the list loader's useCallback does not close over the
   state itself (react-hooks/exhaustive-deps). */
type RequestLists = {
  incoming: Array<{ id: string; from: { id: string; name: string; photo: string }; createdAt: string }>;
  outgoing: Array<{ id: string; to: { id: string; name: string; photo: string }; createdAt: string }>;
};

export function ChatView({initialMatchId}:{initialMatchId?:string}={}) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    const listener = (e: Event) => setSearch(String((e as CustomEvent).detail ?? ""));
    window.addEventListener("freeborn:chat-search", listener);
    return () => window.removeEventListener("freeborn:chat-search", listener);
  }, []);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setOpenMatch] = useState<MatchRow | null>(null);
  const [dismissedDeepLink,setDismissedDeepLink]=useState(false);
  const openMatch=selectedMatch??(!dismissedDeepLink&&initialMatchId?matches.find(m=>m.id===initialMatchId)??null:null);
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  /* Message requests (owner addendum 2026-11-15): pending asks in both
     directions, so the Messages screen is where they are answered. */
  const [requests, setRequests] = useState<RequestLists>({ incoming: [], outgoing: [] });

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
    const rq = await fetch("/api/chat/requests", {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      cache: "no-store",
    }).catch(() => null);
    if (rq?.ok) {
      const rj = await readJsonSafe<Partial<RequestLists>>(rq);
      if (rj) setRequests({ incoming: rj.incoming ?? [], outgoing: rj.outgoing ?? [] });
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

  /* A request answered on another device - or sent at you while you sit on the
     list - should appear without a manual refresh. Only while the LIST is open:
     an open thread has its own sync. */
  useEffect(() => {
    if (openMatch || loading) return;
    const iv = setInterval(() => queueMicrotask(() => void load()), 4000);
    return () => clearInterval(iv);
  }, [openMatch, loading, load]);

  const respond = async (id: string, action: "accept" | "decline" | "cancel") => {
    const t = await getAccessToken();
    const res = await fetch(`/api/chat/requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    const json = res?.ok ? ((await res.json().catch(() => null)) as { matchId?: string } | null) : null;
    if (json?.matchId) {
      /* Open the brand-new thread with the same shape of data a tap on its row uses. */
      const mr = await fetch("/api/chat/matches", { headers: t ? { Authorization: `Bearer ${t}` } : {} }).catch(() => null);
      if (mr?.ok) {
        const mj = (await mr.json().catch(() => null)) as { matches?: MatchRow[] } | null;
        const found = mj?.matches?.find((m) => m.id === json.matchId);
        if (found) setOpenMatch(found);
      }
    }
    void load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <FreebornLoader/>
      </div>
    );
  }

  const profileOverlay = openProfileId ? (
    <MemberDetail profileId={openProfileId} onClose={() => setOpenProfileId(null)} />
  ) : null;

  if (openMatch) {
    return (
      <>
        <Thread
          key={openMatch.id}
          match={openMatch}
          token={token}
          onBack={() => {setDismissedDeepLink(true);setOpenMatch(null);window.history.replaceState(null,"","/app/chat");}}
          onChanged={() => void load()}
          onTapProfile={(id) => setOpenProfileId(id)}
        />
        {profileOverlay}
      </>
    );
  }

  return (
    <div className="fb-messages">
      <MessagesHeading />
      <div className="story-row" aria-label="Conversation profiles">
        <a className="story-item" href="/app/profile/edit#photos" title="Edit your profile photos; stories are not available yet"><span className="story-add">+</span><span>Your story</span></a>
        {matches.filter(m=>!m.ended).map(m=><Button unstyled className="story-item" key={m.id} onClick={()=>setOpenProfileId(m.with.id)}><span className="story-ring"><Avatar photo={m.with.photo} name={m.with.name} size={48}/></span><span>{m.with.name}</span></Button>)}
      </div>

      {requests.incoming.length > 0 || requests.outgoing.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--color-mist)]">
            Message requests
          </h2>
          <div className="mt-3 space-y-2.5">
            {requests.incoming.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-[22px] border border-[var(--color-gold-500)]/25 bg-[var(--color-gold-500)]/[0.06] p-4"
              >
                <Avatar photo={r.from.photo} name={r.from.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-black">{r.from.name}</p>
                  <p className="text-[12px] text-[var(--color-mist)]">wants to message you</p>
                </div>
                <Button
                  size="sm"
                  variant="brand"
                  aria-label={`Accept message request from ${r.from.name}`}
                  onClick={() => void respond(r.id, "accept")}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Decline message request from ${r.from.name}`}
                  onClick={() => void respond(r.id, "decline")}
                >
                  Decline
                </Button>
              </div>
            ))}
            {requests.outgoing.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-4"
              >
                <Avatar photo={r.to.photo} name={r.to.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-black">{r.to.name}</p>
                  <p className="text-[12px] text-[var(--color-mist)]">Request sent · waiting for them</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Cancel message request to ${r.to.name}`}
                  onClick={() => void respond(r.id, "cancel")}
                >
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
        <div className="thread-list">
          {matches.filter((m) => !search.trim() || `${m.with.name} ${m.lastMessage?.body ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((m) => (
            <div
              key={m.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenMatch(m)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {e.preventDefault();setOpenMatch(m);}
              }}
              className={`thread-row ${m.unread>0?"unread":""}`}
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
