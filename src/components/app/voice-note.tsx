"use client";

/**
 * FREEBORN VOICE NOTES — rebuilt Telegram-style.
 *
 * Playback (VoiceBubble):
 *  - tap = play / pause
 *  - drag across the waveform = scrub
 *  - swipe the bubble LEFT = stop and reset (Telegram's cancel gesture)
 *  - 1x → 1.5x → 2x speed chip
 *  - only ONE voice note plays at a time across the whole app
 *
 * Recording (VoiceRecorder):
 *  - press & hold the mic = record, release = send (instant UI, permission
 *    latency handled — a lift while the mic is still warming up still sends)
 *  - quick tap = locks into hands-free mode with pause / discard / send
 *  - drag LEFT while holding = discard on release
 *  - drag UP while holding = lock into hands-free mode
 */

import { useEffect, useMemo, useRef, useState } from "react";

export function fmtClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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

/* --- One-at-a-time playback bus -------------------------------------------- */

let currentPlayingId: string | null = null;
const playListeners = new Set<() => void>();

function announcePlay(id: string) {
  currentPlayingId = id;
  playListeners.forEach((fn) => fn());
}

function useOnlyOnePlayinging(selfId: string, playing: boolean, pause: () => void) {
  useEffect(() => {
    const check = () => {
      if (playing && currentPlayingId !== selfId) pause();
    };
    playListeners.add(check);
    return () => {
      playListeners.delete(check);
    };
  }, [selfId, playing, pause]);
}

/* --- Playback bubble -------------------------------------------------------- */

export function VoiceBubble({ url, mine, seconds }: { url: string; mine: boolean; seconds?: number }) {
  const idRef = useRef(`vn-${Math.random().toString(36).slice(2)}`);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const scrubbingRef = useRef(false);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
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

  const pause = () => audioRef.current?.pause();

  useOnlyOnePlayinging(idRef.current, playing, pause);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => {
      if (isFinite(a.duration) && a.duration > 0) setDur(a.duration);
    };
    const onPlay = () => {
      announcePlay(idRef.current);
      setPlaying(true);
    };
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
    else void a.play().catch(() => setFailed(true));
  };

  /** Telegram gesture: swipe the bubble left → stop and reset to the start. */
  const stopAndReset = () => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    try {
      a.currentTime = 0;
    } catch {
      /* metadata not ready yet */
    }
    setProgress(0);
    setPlaying(false);
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
    return <audio src={url} controls preload="auto" className="h-10 w-[250px] max-w-full" />;
  }

  return (
    <div
      className="flex w-[262px] max-w-full touch-pan-y items-center gap-2.5 py-1"
      onPointerDown={(e) => {
        swipeRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const s = swipeRef.current;
        swipeRef.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (dx < -48 && Math.abs(dx) > Math.abs(dy) * 1.6) stopAndReset();
      }}
    >
      <audio ref={audioRef} src={url} preload="auto" onError={() => setFailed(true)} />
      <button
        type="button"
        onClick={toggle}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
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
        onPointerUp={(e) => {
          e.stopPropagation();
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
          onPointerUp={(e) => e.stopPropagation()}
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

/* --- Recording -------------------------------------------------------------- */

type RecPhase = "idle" | "hold" | "locked";

export function VoiceRecorder({
  onSend,
  onError,
  disabled,
}: {
  onSend: (blob: Blob, seconds: number) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<RecPhase>("idle");
  const [cancelArmed, setCancelArmed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [liveBars, setLiveBars] = useState<number[]>([]);

  const phaseRef = useRef<RecPhase>("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const cancelArmedRef = useRef(false);
  const discardRef = useRef(false);
  const pendingUpRef = useRef(false);
  const streamReadyRef = useRef(false);
  const busyRef = useRef(false);

  const safeStop = () => {
    const r = recRef.current;
    if (r && r.state !== "inactive") {
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    }
  };

  const cleanupInternals = () => {
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

  const finish = () => {
    cleanupInternals();
    const rec = recRef.current;
    recRef.current = null;
    phaseRef.current = "idle";
    streamReadyRef.current = false;
    busyRef.current = false;
    setPhase("idle");
    setCancelArmed(false);
    cancelArmedRef.current = false;
    setPaused(false);
    setLiveBars([]);
    if (discardRef.current) {
      discardRef.current = false;
      onError?.("Voice note discarded.");
      return;
    }
    if (!rec) return;
    const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
    if (blob.size < 400) return;
    const secs = Math.max(1, Math.round(secondsRef.current));
    // Hand the raw blob straight over — multipart upload, no base64 bloat.
    onSend(blob, secs);
  };

  const start = async () => {
    if (phaseRef.current !== "idle" || busyRef.current) return;
    busyRef.current = true;
    pendingUpRef.current = false;
    discardRef.current = false;
    phaseRef.current = "hold";
    setPhase("hold");
    streamReadyRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      streamRef.current = stream;
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
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = finish;
      rec.onerror = () => {
        cleanupInternals();
        recRef.current = null;
        phaseRef.current = "idle";
        streamReadyRef.current = false;
        busyRef.current = false;
        setPhase("idle");
        onError?.("Recording failed midway — press and hold to try again.");
      };
      rec.start(250);
      streamReadyRef.current = true;
      secondsRef.current = 0;
      setSeconds(0);
      setLiveBars([]);

      // Finger lifted while the permission prompt was still open: finish
      // cleanly instead of hanging in "hold" forever.
      if (pendingUpRef.current) {
        pendingUpRef.current = false;
        if (cancelArmedRef.current) discardRef.current = true;
        safeStop();
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
          setSeconds(secondsRef.current);
        }
      }, 1000);
    } catch {
      phaseRef.current = "idle";
      busyRef.current = false;
      setPhase("idle");
      onError?.(
        "Microphone not reachable. Allow mic access for this site in your browser settings, then press and hold the mic again."
      );
    }
  };

  const lock = () => {
    if (phaseRef.current !== "hold") return;
    phaseRef.current = "locked";
    setPhase("locked");
    setCancelArmed(false);
    cancelArmedRef.current = false;
  };

  const togglePause = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      setPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      setPaused(false);
    }
  };

  /* Pointer capture on the mic button itself — no lost window events. */
  const onMicDown = (e: React.PointerEvent) => {
    if (phaseRef.current !== "idle" || disabled) return;
    e.preventDefault();
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    cancelArmedRef.current = false;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    void start();
  };

  const onMicMove = (e: React.PointerEvent) => {
    const s = startRef.current;
    if (!s || phaseRef.current !== "hold") return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    setCancelArmed(dx < -56);
    cancelArmedRef.current = dx < -56;
    if (dy < -72 && !cancelArmedRef.current) lock();
  };

  const onMicUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (phaseRef.current !== "hold") return;
    const s = startRef.current;
    startRef.current = null;
    if (!streamReadyRef.current) {
      pendingUpRef.current = true;
      return;
    }
    if (cancelArmedRef.current) {
      discardRef.current = true;
      safeStop();
      return;
    }
    const heldMs = s ? Date.now() - s.t : 1000;
    // Quick tap → hands-free locked mode (Telegram behavior).
    if (heldMs < 350) {
      lock();
      return;
    }
    safeStop(); // release → send
  };

  const onMicCancel = () => {
    if (phaseRef.current !== "hold") return;
    startRef.current = null;
    discardRef.current = true;
    safeStop();
  };

  useEffect(() => {
    return () => {
      discardRef.current = true;
      if (recRef.current && recRef.current.state !== "inactive") {
        try {
          recRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      cleanupInternals();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "idle") {
    return (
      <button
        type="button"
        onPointerDown={onMicDown}
        onPointerMove={onMicMove}
        onPointerUp={onMicUp}
        onPointerCancel={onMicCancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && phaseRef.current === "idle") {
            e.preventDefault();
            void start().then(() => lock());
          }
        }}
        disabled={disabled}
        aria-label="Hold to record a voice note"
        title="Hold to record · slide left to discard · tap to lock hands-free"
        className="flex h-12 w-12 shrink-0 touch-none select-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-sand)] transition hover:bg-white/[0.08] hover:text-[var(--color-pearl)] active:scale-95 disabled:opacity-40"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0014 0M12 18v3" />
        </svg>
      </button>
    );
  }

  /* Recording bar — pinned over the composer, Telegram-style. */
  return (
    <>
      <button
        type="button"
        onPointerDown={phase === "hold" ? onMicDown : undefined}
        onPointerMove={phase === "hold" ? onMicMove : undefined}
        onPointerUp={phase === "hold" ? onMicUp : undefined}
        onPointerCancel={phase === "hold" ? onMicCancel : undefined}
        disabled={disabled}
        aria-label="Hold to record a voice note"
        className="flex h-12 w-12 shrink-0 touch-none select-none items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[var(--color-sand)] opacity-40"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0014 0M12 18v3" />
        </svg>
      </button>

      <div className="absolute inset-0 z-20 flex items-center gap-3 rounded-full border border-white/[0.08] bg-[#0c101d] px-4 shadow-[0_16px_50px_-12px_rgba(0,0,0,0.9)]">
        {paused ? (
          <span className="h-3 w-3 shrink-0 rounded-full bg-amber-400" />
        ) : (
          <span className="rec-pulse h-3 w-3 shrink-0 rounded-full bg-red-500" />
        )}
        <span className="w-11 shrink-0 text-[14px] font-black tabular-nums text-[var(--color-pearl)]">
          {fmtClock(seconds)}
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

        {phase === "hold" ? (
          <p className={`shrink-0 text-[11px] font-bold ${cancelArmed ? "text-red-300" : "text-[var(--color-ash)]"}`}>
            {cancelArmed ? "Release to discard" : "← slide to discard"}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={togglePause}
              aria-label={paused ? "Resume recording" : "Pause recording"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[var(--color-pearl)] transition hover:bg-white/[0.1]"
            >
              {paused ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M8 5.4v13.2c0 .9 1 1.5 1.8 1L20 13a1.2 1.2 0 000-2L9.8 4.4c-.8-.5-1.8.1-1.8 1z" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="4.5" width="4" height="15" rx="1.4" />
                  <rect x="14" y="4.5" width="4" height="15" rx="1.4" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                discardRef.current = true;
                safeStop();
              }}
              aria-label="Discard voice note"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-400/40 bg-red-500/15 text-red-300 transition hover:bg-red-500/25"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 002 1.8h6A2 2 0 0017 20l1-13M9 7V5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 5v2" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => safeStop()}
              aria-label="Send voice note"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] text-white shadow-[var(--shadow-primary-btn)] transition active:scale-95"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </>
        )}
      </div>
    </>
  );
}
