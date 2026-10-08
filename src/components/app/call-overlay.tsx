"use client";

/**
 * FREEBORN CALLS — real end-to-end, device to device.
 *
 * Every call gets a UNIQUE channel (fb-call:<callId>) — reusing channels is
 * exactly what made second attempts never ring. Ringing rides the callee's
 * personal ring channel; SDP/ICE handshake and media ride the call channel;
 * audio/video flows peer-to-peer (STUN-assisted WebRTC).
 *
 * The caller's own voice is never routed to the speaker — that kills echo.
 * Every signaling step is shown live in the status line, so a stuck call
 * tells you exactly where it stopped.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ICE_SERVERS,
  callChannel,
  destroyChannel,
  newCallId,
  publish,
  ringChannel,
  type CallSignal,
  type RingPayload,
} from "@/lib/call-bus";

type CallProps = {
  kind: "voice" | "video";
  role: "caller" | "callee";
  matchId: string;
  peer: { id: string; name: string; photo: string };
  self?: { id: string; name: string; photo: string };
  /** Callee receives this from the ring; caller generates it. */
  callId?: string;
  onClose: () => void;
};

type CallState =
  | "preparing"
  | "ringing"
  | "negotiating"
  | "live"
  | "no-answer"
  | "declined"
  | "busy"
  | "ended"
  | "failed";

const RING_TIMEOUT_MS = 45_000;

export function CallOverlay({ kind, role, matchId, peer, self, callId: callIdProp, onClose }: CallProps) {
  const [state, setState] = useState<CallState>("preparing");
  const [detail, setDetail] = useState(role === "caller" ? "Preparing your media…" : "Answering…");
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(kind === "video");
  const [speakerOn, setSpeakerOn] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const callIdRef = useRef(callIdProp ?? newCallId());
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const chanRef = useRef<ReturnType<typeof callChannel> | null>(null);
  const ringChanRef = useRef<ReturnType<typeof ringChannel> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const closedRef = useRef(false);
  const madeOfferRef = useRef(false);
  const stateRef = useRef<CallState>("preparing");

  const setStateBoth = (s: CallState, d?: string) => {
    stateRef.current = s;
    setState(s);
    if (d) setDetail(d);
  };

  const cleanup = useCallback((sendHangup: boolean) => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (sendHangup && chanRef.current) {
      publish(chanRef.current, "control", { t: "hangup" } satisfies CallSignal);
    }
    try {
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    destroyChannel(chanRef.current);
    chanRef.current = null;
    destroyChannel(ringChanRef.current);
    ringChanRef.current = null;
  }, []);

  const endCall = useCallback(() => {
    cleanup(true);
    setStateBoth("ended", "Call ended");
    setTimeout(onClose, 900);
  }, [cleanup, onClose]);

  /* --- Media plumbing ---------------------------------------------------------- */

  const attachRemote = (stream: MediaStream) => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
      void remoteAudioRef.current.play().catch(() => undefined);
    }
    if (kind === "video" && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      void remoteVideoRef.current.play().catch(() => undefined);
    }
  };

  const handleSignal = async (sig: CallSignal) => {
    const pc = pcRef.current;
    if (!pc || closedRef.current) return;
    try {
      if (sig.t === "hangup") {
        cleanup(false);
        setStateBoth("ended", `${peer.name} ended the call`);
        setTimeout(onClose, 1100);
        return;
      }
      if (sig.t === "sdp") {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        if (sig.sdp.type === "offer") {
          setDetail("Answering their offer…");
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (chanRef.current) publish(chanRef.current, "signal", { t: "sdp", sdp: answer } satisfies CallSignal);
          setDetail("Securing the connection…");
        } else {
          setDetail("Answer received — securing the connection…");
        }
        return;
      }
      if (sig.t === "ice" && sig.cand) {
        await pc.addIceCandidate(new RTCIceCandidate(sig.cand));
      }
    } catch {
      /* a dropped packet is recoverable — keep negotiating */
    }
  };

  /* --- One full call attempt ---------------------------------------------------- */

  useEffect(() => {
    closedRef.current = false;
    madeOfferRef.current = false;
    let cancelled = false;

    (async () => {
      setStateBoth("preparing", "Preparing your media…");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: kind === "video" ? { facingMode: "user", width: { ideal: 640 } } : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localRef.current = stream;
        if (kind === "video" && localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          void localVideoRef.current.play().catch(() => undefined);
        }

        /* Peer connection */
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.ontrack = (e) => {
          const [s] = e.streams;
          if (s) attachRemote(s);
        };
        pc.onicecandidate = (e) => {
          if (e.candidate && chanRef.current) {
            publish(chanRef.current, "signal", { t: "ice", cand: e.candidate.toJSON() } satisfies CallSignal);
          }
        };
        pc.onconnectionstatechange = () => {
          if (closedRef.current) return;
          if (pc.connectionState === "connected") setStateBoth("live", "Connected");
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            cleanup(false);
            setStateBoth("failed", "The connection dropped — try again.");
          }
        };

        /* Fresh call channel for THIS attempt */
        const chan = callChannel(callIdRef.current);
        chanRef.current = chan;
        chan.on("broadcast", { event: "signal" }, (msg) => void handleSignal(msg.payload as CallSignal));
        chan.on("broadcast", { event: "control" }, (msg) => {
          const p = msg.payload as CallSignal;
          if (closedRef.current) return;
          if (p.t === "hangup") {
            cleanup(false);
            setStateBoth("ended", `${peer.name} ended the call`);
            setTimeout(onClose, 1100);
          } else if (role === "caller" && p.t === "declined") {
            cleanup(false);
            setStateBoth("declined", `${peer.name} declined the call`);
          } else if (role === "caller" && p.t === "busy") {
            cleanup(false);
            setStateBoth("busy", `${peer.name} is on another call`);
          } else if (role === "caller" && p.t === "accept") {
            void (async () => {
              const pcx = pcRef.current;
              if (!pcx || madeOfferRef.current || closedRef.current) return;
              madeOfferRef.current = true;
              setStateBoth("negotiating", `${peer.name} answered — connecting…`);
              try {
                const offer = await pcx.createOffer();
                await pcx.setLocalDescription(offer);
                if (chanRef.current) publish(chanRef.current, "signal", { t: "sdp", sdp: offer } satisfies CallSignal);
                setDetail("Offer sent — waiting for their answer…");
              } catch {
                /* retryable via Call again */
              }
            })();
          }
        });

        chan.subscribe((status) => {
          if (cancelled || closedRef.current) return;
          if (status !== "SUBSCRIBED") return;

          if (role === "caller") {
            setStateBoth("ringing", `Ringing ${peer.name}…`);
            const ring = ringChannel(peer.id);
            ringChanRef.current = ring;
            ring.subscribe((s) => {
              if (s === "SUBSCRIBED" && !closedRef.current) {
                void ring
                  .send({
                    type: "broadcast",
                    event: "ring",
                    payload: {
                      callId: callIdRef.current,
                      matchId,
                      kind,
                      from: self ?? { id: "", name: "Freeborn member", photo: "" },
                    } satisfies RingPayload,
                  })
                  .catch(() => undefined);
              }
            });
          } else {
            // Already accepted in the incoming-call screen.
            publish(chan, "control", { t: "accept" } satisfies CallSignal);
            setDetail("Accepted — waiting for their offer…");
          }
        });
      } catch {
        if (!cancelled) setStateBoth("failed", "Camera or microphone unavailable.");
      }
    })();

    return () => {
      cancelled = true;
      cleanup(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  /* --- Ring timeout + call timer -------------------------------------------------- */

  useEffect(() => {
    if (role !== "caller") return;
    const t = setTimeout(() => {
      if (stateRef.current === "ringing" || stateRef.current === "preparing") {
        cleanup(true);
        setStateBoth("no-answer", `${peer.name} didn't answer`);
      }
    }, RING_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    if (state !== "live") return;
    const iv = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [state]);

  const callAgain = () => {
    callIdRef.current = newCallId();
    setSeconds(0);
    setAttempt((a) => a + 1);
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
  };
  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    localRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
  };
  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    if (remoteAudioRef.current) remoteAudioRef.current.muted = !next;
    if (remoteVideoRef.current) remoteVideoRef.current.muted = !next;
  };

  const fmt = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const finished = state === "ended" || state === "declined" || state === "busy" || state === "no-answer" || state === "failed";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#070a14]/98 backdrop-blur-md">
      {/* Remote audio — the ONLY output. Local mic is never played back. */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--color-mist)]">
          {kind === "video" ? "Freeborn video call" : "Freeborn voice call"}
        </p>
        <p className="max-w-[55%] truncate text-right text-[12px] font-bold text-[var(--color-gold-300)]">
          {state === "live" ? fmt : detail}
        </p>
      </div>

      {/* Stage */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6">
        {kind === "video" && state === "live" ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
        ) : null}

        <div className="relative z-10 flex flex-col items-center gap-4">
          {peer.photo ? (
            <img
              src={peer.photo}
              alt={peer.name}
              className={`rounded-full border-2 border-white/15 object-cover ${
                state === "ringing" || state === "negotiating" ? "h-36 w-36 animate-pulse" : "h-32 w-32"
              }`}
            />
          ) : (
            <span className="flex h-32 w-32 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] font-display text-4xl font-bold text-white">
              {peer.name.charAt(0)}
            </span>
          )}
          <p className="font-display text-2xl font-semibold text-[var(--color-pearl)]">{peer.name}</p>
          {state === "live" ? (
            <p className="rounded-full border border-[var(--color-teal-500)]/40 bg-[var(--color-teal-500)]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[var(--color-teal-300)]">
              Live · {fmt}
            </p>
          ) : null}
          {finished ? (
            <button
              type="button"
              onClick={role === "caller" ? callAgain : onClose}
              className="btn-ember btn-shine relative mt-2 overflow-hidden rounded-full px-7 py-3 text-[13px] font-black text-white"
            >
              {role === "caller" ? "Call again" : "Close"}
            </button>
          ) : null}
        </div>

        {kind === "video" ? (
          <video
            ref={localVideoRef}
            muted
            autoPlay
            playsInline
            className="absolute bottom-6 right-4 z-20 h-40 w-28 rounded-2xl border border-white/20 bg-black object-cover"
          />
        ) : null}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 pb-10">
        <button
          type="button"
          onClick={toggleSpeaker}
          aria-label={speakerOn ? "Turn speaker off" : "Turn speaker on"}
          title="Speaker"
          className={`flex h-14 w-14 items-center justify-center rounded-full border transition ${
            speakerOn ? "border-white/15 bg-white/[0.06] text-white" : "border-red-400/50 bg-red-500/20 text-red-300"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            {!speakerOn ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}
          </svg>
        </button>

        <button
          type="button"
          onClick={toggleMic}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          title="Mute"
          className={`flex h-14 w-14 items-center justify-center rounded-full border transition ${
            micOn ? "border-white/15 bg-white/[0.06] text-white" : "border-red-400/50 bg-red-500/20 text-red-300"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0014 0M12 18v3" />
            {!micOn ? <path d="M4 4l16 16" /> : null}
          </svg>
        </button>

        {kind === "video" ? (
          <button
            type="button"
            onClick={toggleCam}
            aria-label={camOn ? "Turn camera off" : "Turn camera on"}
            title="Camera"
            className={`flex h-14 w-14 items-center justify-center rounded-full border transition ${
              camOn ? "border-white/15 bg-white/[0.06] text-white" : "border-red-400/50 bg-red-500/20 text-red-300"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="6" width="13" height="12" rx="2.5" />
              <path d="M16 10.5l5-3v9l-5-3" />
              {!camOn ? <path d="M3 3l18 18" /> : null}
            </svg>
          </button>
        ) : null}

        <button
          type="button"
          onClick={endCall}
          aria-label="End call"
          title="End call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_16px_40px_-10px_rgba(239,68,68,0.7)] transition active:scale-95"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12c0-1.5 4-4 9-4s9 2.5 9 4l-2.5 2.5-3-1.5-.5-2a12 12 0 00-6 0l-.5 2-3 1.5L3 12z" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>
    </div>
  );
}
