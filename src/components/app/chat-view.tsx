"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAccessToken } from "@/lib/supabase/browser";
import { ProfileView } from "./profile-view";
import { PhotoLightbox } from "./photo-lightbox";
import { CallOverlay } from "./call-overlay";

type MatchRow = {
  id: string;
  with: { id: string; name: string; city: string; photo: string };
  lastMessage: { body: string; mine: boolean; at: string } | null;
  unread: number;
};

type MessageRow = { id: string; body: string; mine: boolean; at: string; read: boolean };

type StagedItem = { id: number; kind: "image" | "video"; dataUrl: string };

const MEDIA_RE = /^\[\[(image|video|voice):([^\]|]+)(?:\|([\d.]+))?\]\]$/;
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

/* --- Telegram-style voice note: play/pause, 1x→1.5x→2x, scrub-to-seek ------ */

function VoiceBubble({ url, mine, seconds }: { url: string; mine: boolean; seconds?: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rate, setRate] = useState(1);
  const [failed, setFailed] = useState(false);
  const [dur, setDur] = useState<number | null>(seconds ?? null);
  const bars = useMemo(() => seededBars(url, 30), [url]);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => {
      if (isFinite(a.duration) && a.duration > 0) setDur(a.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  // Smooth playhead via rAF while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const a = audioRef.current;
      if (a) {
        const d = dur ?? (isFinite(a.duration) && a.duration > 0 ? a.duration : 1);
        setProgress(Math.min(1, a.currentTime / d));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, dur]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else void a.play().catch(() => undefined);
  };

  const cycleRate = () => setRate((r) => (r === 1 ? 1.5 : r === 1.5 ? 2 : 1));

  const seekFromX = (clientX: number) => {
    const el = waveRef.current;
    const a = audioRef.current;
    if (!el || !a) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const d = dur ?? (isFinite(a.duration) && a.duration > 0 ? a.duration : 0);
    if (d > 0) {
      a.currentTime = frac * d;
      setProgress(frac);
    }
  };

  if (failed) {
    // Codec not playable in this browser → fall back to native controls.
    return <audio src={url} controls preload="auto" className="h-10 w-[250px] max-w-full" />;
  }

  return (
    <div className="flex w-[262px] max-w-full items-center gap-2.5 py-1">
      <audio ref={audioRef} src={url} preload="auto" onError={() => setFailed(true)} />
      <button
        type="button"
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/25 text-white transition hover:bg-white/35 active:scale-95"
      >
        {playing ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="6" y="4.5" width="4" height="15" rx="1.4" />
            <rect x="14" y="4.5" width="4" height="15" rx="1.4" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5.4v13.2c0 .9 1 1.5 1.8 1L20 13a1.2 1.2 0 000-2L9.8 4.4c-.8-.5-1.8.1-1.8 1z" />
          </svg>
        )}
      </button>
      <div
        ref={waveRef}
        className="flex h-9 flex-1 cursor-pointer touch-none items-center gap-[2.5px]"
        aria-hidden
        onPointerDown={(e) => {
          e.stopPropagation();
          scrubbingRef.current = true;
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          seekFromX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (scrubbingRef.current) seekFromX(e.clientX);
        }}
        onPointerUp={() => {
          scrubbingRef.current = false;
        }}
      >
        {bars.map((b, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-full ${
              i / bars.length <= progress ? "bg-white" : mine ? "bg-white/40" : "bg-white/25"
            }`}
            style={{ height: `${7 + b * 19}px` }}
          />
        ))}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-[11px] font-bold tabular-nums ${mine ? "text-white/85" : "text-[var(--color-mist)]"}`}>
          {fmtClock(dur ?? 0)}
        </span>
        <button
          type="button"
          onClick={cycleRate}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Playback speed ${rate}x`}
          className={`rounded-full px-1.5 py-px text-[9.5px] font-black tabular-nums transition ${
            rate > 1
              ? "bg-white/25 text-white"
              : mine
                ? "bg-white/10 text-white/70 hover:bg-white/20"
                : "bg-white/[0.07] text-[var(--color-mist)] hover:bg-white/[0.14]"
          }`}
        >
          {rate}x
        </button>
      </div>
    </div>
  );
}

/* --- Media packet (photos + videos + voice, one bubble) --------------------- */

function MediaPacket({
  items,
  onImage,
}: {
  items: { kind: string; url: string; dur?: number }[];
  onImage: (url: string) => void;
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
                <img src={item.url} alt="Shared photo" className="max-h-[300px] w-full object-cover" />
              </button>
            ) : (
              <video key={i} src={item.url} controls className="max-h-[300px] w-full rounded-xl" />
            )
          )}
        </div>
      ) : null}
      {voices.map((v, i) => (
        <VoiceBubble key={i} url={v.url} mine seconds={v.dur} />
      ))}
    </div>
  );
}

function MessageContent({ body, onImage }: { body: string; onImage: (url: string) => void }) {
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
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-4 opacity-90">{seg.text}</p>
          </div>
        ) : seg.type === "media" ? (
          <MediaPacket key={i} items={seg.items} onImage={onImage} />
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
      <img
        src={photo}
        alt={name}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border border-white/10 object-cover"
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
  const [sheetFor, setSheetFor] = useState<MessageRow | null>(null);
  const [quoteArmedId, setQuoteArmedId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ name: string; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/chat/messages?match=${match.id}`, {
      headers: authHeaders(token),
    });
    if (res.ok) {
      const json = await res.json();
      setMessages(json.messages);
    }
  }, [match.id, token]);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 4000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const postMessage = useCallback(
    async (body: string) => {
      await fetch("/api/chat/messages", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ match: match.id, text: body }),
      }).catch(() => flash("Couldn't send — check your connection."));
      setTimeout(() => void load(), 500);
      setTimeout(() => {
        void load();
        onChanged();
      }, 3000);
    },
    [match.id, token, load, onChanged]
  );

  const buildBody = (content: string) => {
    if (!replyTo) return content;
    const quote = `[[quote:${replyTo.name.slice(0, 40)}|${replyTo.text.slice(0, 120)}]]`;
    return `${quote}\n${content}`.slice(0, 2000);
  };

  /** Upload into the local media store → playable/viewable by both sides. */
  const uploadMedia = async (dataUrl: string, kind: "image" | "video" | "voice") => {
    try {
      const res = await fetch("/api/chat/media", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ data: dataUrl, kind }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return `/api/chat/media/${json.id}`;
    } catch {
      return null;
    }
  };

  const send = async () => {
    const clean = text.trim();
    if (!clean || sending || staged.length > 0) return;
    setSending(true);
    setText("");
    setReplyTo(null);
    await postMessage(buildBody(clean));
    setSending(false);
  };

  /* --- Staged media packet -------------------------------------------------- */

  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "video") => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const file of files) {
      if (staged.length >= MAX_PACKET_ITEMS) break;
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
      const url = await uploadMedia(item.dataUrl, item.kind);
      if (url) markers.push(`[[${item.kind}:${url}]]`);
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

  /* --- Telegram-style voice recording ---------------------------------------- */

  type RecMode = "idle" | "hold" | "locked";
  const [recMode, setRecMode] = useState<RecMode>("idle");
  const [cancelArmed, setCancelArmed] = useState(false);
  const [recPaused, setRecPaused] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [liveBars, setLiveBars] = useState<number[]>([]);

  const recModeRef = useRef<RecMode>("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const holdStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const cancelArmedRef = useRef(false);
  const discardRef = useRef(false);
  /** True when the finger lifted while the mic permission was still loading. */
  const pendingUpRef = useRef(false);
  /** True only once the mic stream + recorder actually exist. */
  const streamReadyRef = useRef(false);

  /** Stop the recorder only when it's actually running — double-stops throw. */
  const safeStopRec = () => {
    const r = recRef.current;
    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    }
  };

  const cleanupRecInternals = () => {
    if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    levelTimerRef.current = null;
    clockTimerRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const sendVoice = async (dataUrl: string, seconds: number) => {
    setUploading(true);
    try {
      const url = await uploadMedia(dataUrl, "voice");
      if (!url) {
        flash("Voice note failed to send.");
        return;
      }
      await postMessage(buildBody(`[[voice:${url}|${seconds}]]`));
      setReplyTo(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRecStop = () => {
    cleanupRecInternals();
    const rec = recRef.current;
    recRef.current = null;
    recModeRef.current = "idle";
    streamReadyRef.current = false;
    setRecMode("idle");
    setCancelArmed(false);
    cancelArmedRef.current = false;
    setRecPaused(false);
    setLiveBars([]);
    if (discardRef.current) {
      discardRef.current = false;
      flash("Voice note discarded.");
      return;
    }
    if (!rec) return;
    const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
    if (blob.size < 400) return;
    const seconds = Math.max(1, Math.round(secondsRef.current));
    const reader = new FileReader();
    reader.onload = () => void sendVoice(String(reader.result), seconds);
    reader.readAsDataURL(blob);
  };

  const startRecording = async () => {
    if (recModeRef.current !== "idle") return;
    pendingUpRef.current = false;
    // Show the recording UI instantly so press-and-hold feels immediate;
    // the real stream attaches a moment later (permission latency included).
    recModeRef.current = "hold";
    setRecMode("hold");
    streamReadyRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      // Prefer Opus — the clearest, most natural voice codec browsers offer.
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = candidates.find((c) => MediaRecorder.isTypeSupported(c));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recRef.current = rec;
      chunksRef.current = [];
      discardRef.current = false;
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = handleRecStop;
      rec.onerror = () => {
        cleanupRecInternals();
        recRef.current = null;
        recModeRef.current = "idle";
        streamReadyRef.current = false;
        setRecMode("idle");
        setMicError("Recording failed midway — press and hold to try again.");
        setTimeout(() => setMicError(null), 5000);
      };
      rec.start(250);
      streamReadyRef.current = true;
      secondsRef.current = 0;
      setRecSeconds(0);
      setLiveBars([]);

      // The finger lifted while the permission prompt was still open — the
      // hold never really happened, so discard instead of hanging.
      if (pendingUpRef.current) {
        pendingUpRef.current = false;
        discardRef.current = true;
        rec.stop();
        return;
      }

      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        levelTimerRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
          setLiveBars((b) => [...b.slice(-31), Math.min(1, peak / 80)]);
        }, 110);
      } catch {
        /* meter is optional */
      }
      clockTimerRef.current = setInterval(() => {
        if (recRef.current?.state === "recording") {
          secondsRef.current += 1;
          setRecSeconds(secondsRef.current);
        }
      }, 1000);
    } catch {
      recModeRef.current = "idle";
      setRecMode("idle");
      setMicError(
        "Microphone not reachable. Allow mic access for this site in your browser's site settings, then press and hold the mic again."
      );
      setTimeout(() => setMicError(null), 6500);
    }
  };

  const lockRecording = () => {
    if (recModeRef.current !== "hold") return;
    recModeRef.current = "locked";
    setRecMode("locked");
    setCancelArmed(false);
    cancelArmedRef.current = false;
  };

  const removeHoldListeners = () => {
    window.removeEventListener("pointermove", onHoldMove);
    window.removeEventListener("pointerup", onHoldUp);
    window.removeEventListener("pointercancel", onHoldCancel);
  };

  const onHoldMove = (e: PointerEvent) => {
    const s = holdStartRef.current;
    if (!s || recModeRef.current !== "hold") return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    setCancelArmed(dx < -64);
    cancelArmedRef.current = dx < -64;
    if (dy < -80 && !cancelArmedRef.current) lockRecording();
  };

  const onHoldUp = () => {
    removeHoldListeners();
    if (recModeRef.current !== "hold") return;
    if (!streamReadyRef.current) {
      // The UI shows "hold" instantly, but the stream may still be pending
      // (permission prompt). Remember the lift and cancel cleanly once it
      // resolves — this is what kept recordings from hanging or auto-locking.
      pendingUpRef.current = true;
      return;
    }
    const s = holdStartRef.current;
    holdStartRef.current = null;
    if (cancelArmedRef.current) {
      discardRef.current = true;
      safeStopRec();
      return;
    }
    const heldMs = s ? Date.now() - s.t : 1000;
    if (heldMs < 380) {
      lockRecording();
      return;
    }
    safeStopRec(); // release → send
  };

  const onHoldCancel = () => {
    removeHoldListeners();
    if (recModeRef.current !== "hold") return;
    holdStartRef.current = null;
    discardRef.current = true;
    safeStopRec();
  };

  const onMicPointerDown = (e: React.PointerEvent) => {
    if (recModeRef.current !== "idle") return;
    e.preventDefault();
    holdStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    cancelArmedRef.current = false;
    window.addEventListener("pointermove", onHoldMove);
    window.addEventListener("pointerup", onHoldUp);
    window.addEventListener("pointercancel", onHoldCancel);
    void startRecording();
  };

  const togglePause = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setRecPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      setRecPaused(false);
    }
  };

  useEffect(() => {
    return () => {
      removeHoldListeners();
      discardRef.current = true;
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
      cleanupRecInternals();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recording = recMode !== "idle";

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
        if (h && h.id === m.id && !h.moved) setSheetFor(m);
      }, 460),
    };
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
    if (h.moved) setQuoteArmedId(dx > 64 && Math.abs(dx) > Math.abs(dy) * 1.4 ? h.id : null);
  };

  const onBubbleUp = (m: MessageRow) => () => {
    const h = bubbleHold.current;
    bubbleHold.current = null;
    if (!h) return;
    if (h.timer) clearTimeout(h.timer);
    if (quoteArmedId === m.id) {
      setReplyTo({
        name: m.mine ? "You" : match.with.name,
        text: plainText(m.body).slice(0, 140) || previewBody(m.body),
      });
      flash("Replying to message — slide back to cancel.");
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
          {quoteArmedId === m.id ? (
            <span className="text-[var(--color-gold-300)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 17l5-5-5-5" />
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
              transform: quoteArmedId === m.id ? "translateX(34px)" : undefined,
              transition: "transform 160ms ease",
            }}
            className={`select-none rounded-[20px] text-[14px] leading-6 ${
              mediaOnly ? "p-2" : "px-4 py-2.5"
            } ${
              m.mine
                ? "rounded-br-md bg-[var(--gradient-ember-warm)] text-white shadow-[0_8px_20px_-10px_rgba(239,94,94,0.6)]"
                : "rounded-bl-md border border-white/[0.07] bg-white/[0.045] text-[var(--color-ivory)]"
            }`}
          >
            <MessageContent body={m.body} onImage={setLightboxUrl} />
            <span
              className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                m.mine ? "text-white/70" : "text-[var(--color-ash)]"
              }`}
            >
              {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {m.mine ? <Receipt read={m.read} /> : null}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-200px)] flex-col lg:h-[calc(100dvh-120px)]">
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
          <Avatar photo={match.with.photo} name={match.with.name} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-black">{match.with.name}</p>
            <p className="truncate text-[12px] text-[var(--color-mist)]">
              {match.with.city || "Freeborn member"}
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

      <div className="flex-1 space-y-3 overflow-y-auto py-5">{rows.length > 0 ? rows : (
        <p className="pt-10 text-center text-sm text-[var(--color-mist)]">
          The conversation is open — say hello.
        </p>
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
              Packet · {staged.length} {staged.length === 1 ? "item" : "items"} — sent together
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

      {micError ? (
        <div className="mb-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3.5 py-2 text-[12px] font-bold text-red-300">
          {micError}
        </div>
      ) : null}

      {/* Composer — or recording bar */}
      {recording ? (
        <div className="flex items-center gap-3 border-t border-white/[0.06] pt-4">
          {recPaused ? (
            <span className="h-3 w-3 shrink-0 rounded-full bg-amber-400" />
          ) : (
            <span className="rec-pulse h-3 w-3 shrink-0 rounded-full bg-red-500" />
          )}
          <span className="w-11 shrink-0 text-[14px] font-black tabular-nums text-[var(--color-pearl)]">
            {fmtClock(recSeconds)}
          </span>

          <div className="flex h-8 flex-1 items-center gap-[2.5px] overflow-hidden" aria-hidden>
            {(liveBars.length ? liveBars : [0.15]).map((b, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-[var(--color-gold-300)]"
                style={{ height: `${6 + b * 20}px`, opacity: 0.35 + b * 0.65 }}
              />
            ))}
          </div>

          {recMode === "hold" ? (
            <p className={`shrink-0 text-[11px] font-bold ${cancelArmed ? "text-red-300" : "text-[var(--color-ash)]"}`}>
              {cancelArmed ? "Release to discard" : "← slide to discard · slide up to lock"}
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={togglePause}
                aria-label={recPaused ? "Resume recording" : "Pause recording"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[var(--color-pearl)] transition hover:bg-white/[0.1]"
              >
                {recPaused ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M8 5.4v13.2c0 .9 1 1.5 1.8 1L20 13a1.2 1.2 0 000-2L9.8 4.4c-.8-.5-1.8.1-1.8 1z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <rect x="6" y="4.5" width="4" height="15" rx="1.4" />
                    <rect x="14" y="4.5" width="4" height="15" rx="1.4" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  discardRef.current = true;
                  safeStopRec();
                }}
                aria-label="Discard voice note"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-400/40 bg-red-500/15 text-red-300 transition hover:bg-red-500/25"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 002 1.8h6A2 2 0 0017 20l1-13M9 7V5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 5v2" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => safeStopRec()}
                aria-label="Send voice note"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] text-white shadow-[var(--shadow-primary-btn)] transition active:scale-95"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Add photos to the packet"
            title="Add photos"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-sand)] transition hover:bg-white/[0.08] hover:text-[var(--color-pearl)] disabled:opacity-40"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="M21 16l-4.5-4.5L9 18" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => videoRef.current?.click()}
            disabled={uploading}
            aria-label="Add videos to the packet"
            title="Add videos"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-sand)] transition hover:bg-white/[0.08] hover:text-[var(--color-pearl)] disabled:opacity-40"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="6" width="13" height="12" rx="2.5" />
              <path d="M16 10.5l5-3v9l-5-3" />
            </svg>
          </button>

          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (staged.length > 0) void sendPacket();
                else void send();
              }
            }}
            placeholder={staged.length > 0 ? "Add a caption to the packet…" : `Message ${match.with.name}…`}
            maxLength={1800}
            autoComplete="off"
            enterKeyHint="send"
            className="min-h-[48px] flex-1 rounded-full border border-white/10 bg-white/[0.04] px-5 text-[14px] text-[var(--color-pearl)] outline-none transition placeholder:text-[var(--color-ash)]"
          />

          <button
            type="button"
            onPointerDown={onMicPointerDown}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && recMode === "idle") {
                e.preventDefault();
                void startRecording().then(() => lockRecording());
              }
            }}
            disabled={uploading}
            aria-label="Hold to record a voice note"
            title="Hold to record · slide left to discard · slide up to lock"
            className="flex h-12 w-12 shrink-0 touch-none select-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-sand)] transition hover:bg-white/[0.08] hover:text-[var(--color-pearl)] active:scale-95 disabled:opacity-40"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0014 0M12 18v3" />
            </svg>
          </button>

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

      {call ? (
        <CallOverlay
          kind={call}
          name={match.with.name}
          photo={match.with.photo}
          onEnd={() => setCall(null)}
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
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const param = new URLSearchParams(window.location.search).get("match");
    if (!param) return;
    const found = matches.find((m) => m.id === param);
    if (found) {
      setOpenMatch(found);
    } else {
      void load();
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
        Your matches and conversations — values already on the table.
      </p>

      {matches.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-white/[0.07] bg-white/[0.02] p-10 text-center">
          <p className="font-display text-xl font-semibold">No conversations yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--color-mist)]">
            When you like someone in Discover and it's mutual, the conversation opens here.
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
                <Avatar photo={m.with.photo} name={m.with.name} />
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
                    : "Say hello — the conversation is open."}
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
