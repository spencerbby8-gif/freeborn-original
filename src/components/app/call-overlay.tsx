"use client";

/**
 * FREEBORN CALLS — real end-to-end, device to device.
 *
 * Signaling rides Supabase Realtime (ring → accept → SDP/ICE exchange);
 * the media itself flows peer-to-peer over WebRTC. The caller's own voice is
 * NEVER played back through the speaker — that's what caused the echo.
 */

import { useEffect, useRef, useState } from "react";
import {
  ICE_SERVERS,
  callChannel,
  publish,
  ringChannel,
  type CallSignal,
} from "@/lib/call-bus";

type CallProps = {
  kind: "voice" | "video";
  role: "caller" | "callee";
  matchId: string;
  peer: { id: string; name: string; photo: string };
  /** The signed-in member's own identity — carried in the ring so the
      callee sees who is calling. */
  self?: { id: string; name: string; photo: string };
  onClose: () => void;
};

type CallState = "connecting" | "ringing" | "declined" | "busy" | "live" | "ended" | "error";

const RING_TIMEOUT_MS = 45_000;

export function CallOverlay({ kind, role, matchId, peer, self, onClose }: CallProps) {
  const [state, setState] = useState<CallState>(role === "caller" ? "ringing" : "connecting");
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(kind === "video");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const chanRef = useRef<ReturnType<typeof callChannel> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const closedRef = useRef(false);
  const madeOfferRef = useRef(false);

  const hangup = (notify = true) => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (notify && chanRef.current) publish(chanRef.current, "signal", { t: "hangup" } satisfies CallSignal);
    try {
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    localRef.current?.getTracks().forEach((t) => t.stop());
    setState("ended");
    setTimeout(onClose, 900);
  };

  /* --- WebRTC setup ---------------------------------------------------------- */

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

  const setupPeer = () => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (stream) attachRemote(stream);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && chanRef.current) {
        publish(chanRef.current, "signal", { t: "ice", cand: e.candidate.toJSON() } satisfies CallSignal);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setState("live");
      if (pc.connectionState === "failed") hangup(false);
    };
    return pc;
  };

  const handleSignal = async (sig: CallSignal) => {
    const pc = pcRef.current;
    if (!pc || closedRef.current) return;
    try {
      if (sig.t === "hangup") {
        hangup(false);
      } else if (sig.t === "sdp") {
        await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        if (sig.sdp.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (chanRef.current) publish(chanRef.current, "signal", { t: "sdp", sdp: answer } satisfies CallSignal);
        }
      } else if (sig.t === "ice" && sig.cand) {
        await pc.addIceCandidate(new RTCIceCandidate(sig.cand));
      }
    } catch {
      /* a dropped candidate is recoverable; keep the call alive */
    }
  };

  /* --- Mount: media + channels ------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    (async () => {
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

        setupPeer();
        const chan = callChannel(matchId);
        chanRef.current = chan;
        chan.on("broadcast", { event: "signal" }, (msg) => {
          void handleSignal(msg.payload as CallSignal);
        });
        chan.subscribe((status) => {
          if (status !== "SUBSCRIBED" || cancelled) return;

          if (role === "caller") {
            // Ring the other device for real — with who's calling.
            const ring = ringChannel(peer.id);
            ring.subscribe((s) => {
              if (s === "SUBSCRIBED") {
                void ring
                  .send({
                    type: "broadcast",
                    event: "ring",
                    payload: {
                      matchId,
                      kind,
                      from: self ?? { id: "", name: "Freeborn member", photo: "" },
                    },
                  })
                  .catch(() => undefined);
              }
            });
          } else {
            // Callee already accepted in the listener — tell the caller.
            publish(chan, "control", { t: "accept" } satisfies CallSignal);
          }
        });

        if (role === "caller") {
          // Listen for accept/declined/busy on the call channel too.
          chan.on("broadcast", { event: "control" }, (msg) => {
            const p = msg.payload as CallSignal;
            if (p.t === "declined") setState("declined");
            if (p.t === "busy") setState("busy");
            if (p.t === "accept") {
              void (async () => {
                const pc = pcRef.current;
                if (!pc || madeOfferRef.current) return;
                madeOfferRef.current = true;
                setState("connecting");
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                if (chanRef.current)
                  publish(chanRef.current, "signal", { t: "sdp", sdp: offer } satisfies CallSignal);
              })();
            }
          });
        }
      } catch {
        if (!cancelled) {
          setState("error");
          setTimeout(onClose, 2500);
        }
      }
    })();

    return () => {
      cancelled = true;
      hangup(false);
      try {
        chanRef.current?.unsubscribe();
      } catch {
        /* gone */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Ring timeout (caller) + call timer ------------------------------------- */

  useEffect(() => {
    if (role !== "caller") return;
    const t = setTimeout(() => {
      setState((s) => (s === "ringing" ? "ended" : s));
      hangup();
    }, RING_TIMEOUT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== "live") return;
    const iv = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [state]);

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

  const fmt = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  const statusText =
    state === "ringing"
      ? "Ringing…"
      : state === "connecting"
        ? "Connecting…"
        : state === "declined"
          ? `${peer.name} declined the call`
          : state === "busy"
            ? `${peer.name} is on another call`
            : state === "ended"
              ? "Call ended"
              : state === "error"
                ? "Camera or microphone unavailable"
                : fmt;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#070a14]/98 backdrop-blur-md">
      {/* Hidden remote audio — the ONLY thing that makes sound. */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="flex items-center justify-between px-6 pt-6">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--color-mist)]">
          {kind === "video" ? "Freeborn video call" : "Freeborn voice call"}
        </p>
        <p className="text-[13px] font-black tabular-nums text-[var(--color-gold-300)]">{statusText}</p>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6">
        {kind === "video" && state === "live" ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
        ) : null}

        <div className="relative z-10 flex flex-col items-center gap-4">
          {peer.photo ? (
            <img
              src={peer.photo}
              alt={peer.name}
              className={`rounded-full border-2 border-white/15 object-cover ${state === "ringing" ? "h-36 w-36 animate-pulse" : "h-32 w-32"}`}
            />
          ) : (
            <span className="flex h-32 w-32 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] font-display text-4xl font-bold text-white">
              {peer.name.charAt(0)}
            </span>
          )}
          <p className="font-display text-2xl font-semibold text-[var(--color-pearl)]">{peer.name}</p>
        </div>

        {kind === "video" && (
          <video
            ref={localVideoRef}
            muted
            autoPlay
            playsInline
            className="absolute bottom-24 right-4 z-20 h-40 w-28 rounded-2xl border border-white/20 bg-black object-cover"
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-5 pb-10">
        <button
          type="button"
          onClick={toggleMic}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
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
            className={`flex h-14 w-14 items-center justify-center rounded-full border transition ${
              camOn ? "border-white/15 bg-white/[0.06] text-white" : "border-red-400/50 bg-red-500/20 text-red-300"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="6" width="13" height="12" rx="2.5" />
              <path d="M16 10.5l5-3v9l-5-3" />
            </svg>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => hangup()}
          aria-label="End call"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_16px_40px_-10px_rgba(239,68,68,0.7)] transition active:scale-95"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 9c-3.2 0-6.1.9-8.5 2.4l2 3.1c1.9-1.1 4.1-1.7 6.5-1.7s4.6.6 6.5 1.7l2-3.1C18.1 9.9 15.2 9 12 9z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
