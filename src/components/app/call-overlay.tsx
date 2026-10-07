"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Freeborn call engine — voice & video.
 *
 * Real media pipeline: getUserMedia → RTCPeerConnection pair with full
 * offer/answer + ICE candidate exchange (loopback signaling in the preview
 * room), DTLS/SRTP encrypted transport, and a live analyser on the RECEIVED
 * WebRTC track that drives the speaking indicator. In production the same
 * engine swaps the loopback signaling for a WebSocket signaling server plus
 * STUN/TURN — nothing in the media path changes.
 */

type CallKind = "voice" | "video";
type Phase = "starting" | "ringing" | "connecting" | "connected" | "failed";

function fmtClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CallOverlay({
  kind,
  name,
  photo,
  onEnd,
}: {
  kind: CallKind;
  name: string;
  photo: string;
  onEnd: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(kind === "video");
  const [speakerOn, setSpeakerOn] = useState(true);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteLevel, setRemoteLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcARef = useRef<RTCPeerConnection | null>(null);
  const pcBRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const endedRef = useRef(false);

  const teardown = useCallback(() => {
    endedRef.current = true;
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    ringTimerRef.current = null;
    clockTimerRef.current = null;
    levelTimerRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    pcARef.current?.close();
    pcBRef.current?.close();
    pcARef.current = null;
    pcBRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    remoteStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }, []);

  useEffect(() => {
    return teardown;
  }, [teardown]);

  /* Meter the audio we actually receive over the WebRTC track. */
  const attachRemoteMeter = useCallback((stream: MediaStream) => {
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
        setRemoteLevel(Math.min(1, peak / 70));
      }, 120);
    } catch {
      /* meter is optional */
    }
  }, []);

  /* Establish the real WebRTC connection (loopback signaling). */
  const connect = useCallback(async () => {
    const local = localStreamRef.current;
    if (!local || endedRef.current) return;
    setPhase("connecting");
    try {
      const iceServers: RTCIceServer[] = [];
      const pcA = new RTCPeerConnection({ iceServers });
      const pcB = new RTCPeerConnection({ iceServers });
      pcARef.current = pcA;
      pcBRef.current = pcB;

      pcA.onicecandidate = (e) => {
        if (e.candidate) void pcB.addIceCandidate(e.candidate).catch(() => undefined);
      };
      pcB.onicecandidate = (e) => {
        if (e.candidate) void pcA.addIceCandidate(e.candidate).catch(() => undefined);
      };
      pcB.ontrack = (e) => {
        // Some browsers deliver tracks without a stream association —
        // wrap the track ourselves so audio always reaches the speaker.
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        remoteStreamRef.current = stream;
        setRemoteStream(stream);
        attachRemoteMeter(stream);
      };

      local.getTracks().forEach((t) => pcA.addTrack(t, local));

      const offer = await pcA.createOffer();
      await pcA.setLocalDescription(offer);
      await pcB.setRemoteDescription(offer);
      const answer = await pcB.createAnswer();
      await pcB.setLocalDescription(answer);
      await pcA.setRemoteDescription(answer);

      if (endedRef.current) return;
      setPhase("connected");
      clockTimerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Couldn't establish the call line. Check device permissions and try again.");
      setPhase("failed");
    }
  }, [attachRemoteMeter]);

  /* Boot: permission first, then ring, then connect (Safari-safe order). */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video:
            kind === "video"
              ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
              : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current && kind === "video") {
          localVideoRef.current.srcObject = stream;
        }
        setPhase("ringing");
        ringTimerRef.current = setTimeout(() => void connect(), 1900);
      } catch {
        if (!cancelled) {
          setError("Microphone or camera unavailable — allow access and try again.");
          setPhase("failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  /* Wire the received WebRTC stream to the speaker output. */
  useEffect(() => {
    const el = remoteAudioRef.current;
    if (el && remoteStream) {
      el.srcObject = remoteStream;
      el.muted = !speakerOn;
      void el.play().catch(() => undefined);
    }
  }, [remoteStream, speakerOn]);

  const endCall = () => {
    teardown();
    onEnd();
  };

  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    if (remoteAudioRef.current) remoteAudioRef.current.muted = !next;
  };

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };

  const toggleCam = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !camOn;
    stream.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  };

  const statusLabel =
    phase === "starting"
      ? "Preparing…"
      : phase === "ringing"
        ? `Ringing ${name}…`
        : phase === "connecting"
          ? "Connecting line…"
          : phase === "connected"
            ? fmtClock(seconds)
            : phase === "failed"
              ? "Call failed"
              : "";

  return (
    <div className="fixed inset-0 z-[170] flex flex-col bg-[#05070f]/[0.99] text-[var(--color-pearl)]" role="dialog" aria-modal="true" aria-label={`${kind} call with ${name}`}>
      {/* Remote audio output — the actual WebRTC receive path */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      {/* Remote stage */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-6">
        {kind === "video" && phase === "connected" ? (
          <div
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: 0.28 + remoteLevel * 0.5 }}
          >
            {photo ? (
              <img src={photo} alt="" className="h-full w-full object-cover blur-xl" />
            ) : null}
            <div className="absolute inset-0 bg-[#05070f]/60" />
          </div>
        ) : null}

        <div className="relative z-10 flex flex-col items-center">
          <div className="relative">
            {phase === "connected" ? (
              <span
                className="absolute -inset-3 rounded-full border-2 border-[var(--color-teal-300)]/70 transition-transform duration-150"
                style={{ transform: `scale(${1 + remoteLevel * 0.14})`, opacity: 0.25 + remoteLevel * 0.75 }}
              />
            ) : phase === "ringing" ? (
              <span className="call-ring absolute -inset-3 rounded-full border-2 border-[var(--color-gold-300)]/60" />
            ) : null}
            {photo ? (
              <img
                src={photo}
                alt={name}
                className="h-36 w-36 rounded-full border border-white/15 object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] sm:h-44 sm:w-44"
              />
            ) : (
              <span className="flex h-36 w-36 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] font-display text-5xl font-semibold text-white sm:h-44 sm:w-44">
                {name.charAt(0)}
              </span>
            )}
          </div>

          <h2 className="mt-6 font-display text-[26px] font-semibold">{name}</h2>
          <p className={`mt-1.5 text-[13px] font-bold tabular-nums ${phase === "connected" ? "text-[var(--color-teal-300)]" : "text-[var(--color-mist)]"}`}>
            {statusLabel}
          </p>
          {phase === "connected" ? (
            <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ash)]">
              {kind === "video" ? "Video call" : "Voice call"} · encrypted line · preview room
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 max-w-[36ch] text-center text-[12.5px] font-bold text-red-300">{error}</p>
          ) : null}
        </div>

        {/* Local video PiP */}
        {kind === "video" ? (
          <div className="absolute bottom-6 right-5 z-20 w-[124px] overflow-hidden rounded-2xl border border-white/15 bg-black shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9)] sm:w-[168px]">
            <video ref={localVideoRef} autoPlay playsInline muted className="aspect-[3/4] w-full object-cover" style={{ transform: "scaleX(-1)" }} />
            {!camOn ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/80 text-[10px] font-black uppercase tracking-wider text-white/70">
                Camera off
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div className="relative z-10 flex items-center justify-center gap-5 pb-10 pt-4">
        <button
          type="button"
          onClick={toggleMic}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          className={`flex h-14 w-14 items-center justify-center rounded-full border transition active:scale-95 ${
            micOn
              ? "border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12]"
              : "border-red-400/50 bg-red-500/25 text-red-200"
          }`}
        >
          {micOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0014 0M12 18v3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0014 0M12 18v3M4 4l16 16" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={toggleSpeaker}
          aria-label={speakerOn ? "Speaker off" : "Speaker on"}
          title={speakerOn ? "Speaker on" : "Speaker off"}
          className={`flex h-14 w-14 items-center justify-center rounded-full border transition active:scale-95 ${
            speakerOn
              ? "border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12]"
              : "border-red-400/50 bg-red-500/25 text-red-200"
          }`}
        >
          {speakerOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
              <path d="M15.5 8.5a5 5 0 010 7M18.5 6a9 9 0 010 12" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5L6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
              <path d="M16 9l6 6M22 9l-6 6" />
            </svg>
          )}
        </button>

        {kind === "video" ? (
          <button
            type="button"
            onClick={toggleCam}
            aria-label={camOn ? "Turn camera off" : "Turn camera on"}
            className={`flex h-14 w-14 items-center justify-center rounded-full border transition active:scale-95 ${
              camOn
                ? "border-white/15 bg-white/[0.07] text-white hover:bg-white/[0.12]"
                : "border-red-400/50 bg-red-500/25 text-red-200"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="6" width="13" height="12" rx="2.5" />
              <path d="M16 10.5l5-3v9l-5-3" />
              {!camOn ? <path d="M4 4l16 16" /> : null}
            </svg>
          </button>
        ) : null}

        <button
          type="button"
          onClick={endCall}
          aria-label="End call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e5484d] text-white shadow-[0_18px_44px_-10px_rgba(229,72,77,0.8)] transition hover:bg-[#d93a3f] active:scale-95"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 9c-3.2 0-6.1.9-8.4 2.4-.8.5-1 1.6-.5 2.4l1 1.6c.4.7 1.3 1 2 .7l2.2-.9c.6-.2 1-.8 1-1.4v-1.2c1.7-.5 3.7-.5 5.4 0v1.2c0 .6.4 1.2 1 1.4l2.2.9c.7.3 1.6 0 2-.7l1-1.6c.5-.8.3-1.9-.5-2.4C18.1 9.9 15.2 9 12 9z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
