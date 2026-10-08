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
  callChannel,
  destroyChannel,
  getIceConfig,
  newCallId,
  publish,
  ringChannel,
  traceCall,
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
  /** Fired once when a call that actually connected ends — for the call log. */
  onCallEnd?: (kind: "voice" | "video", seconds: number) => void;
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

export function CallOverlay({ kind, role, matchId, peer, self, callId: callIdProp, onCallEnd, onClose }: CallProps) {
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
  /** Self-heal: one automatic ICE restart before declaring the call dead. */
  const restartedRef = useRef(false);
  const healTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const negWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Handshake reliability: broadcasts are fire-and-forget, so the accept and
      the offer are re-sent on a timer until the other side answers. */
  const offerSentRef = useRef<RTCSessionDescriptionInit | null>(null);
  const answerSeenRef = useRef(false);
  const offerSeenRef = useRef(false);
  const acceptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerSentRef = useRef<RTCSessionDescriptionInit | null>(null);
  /** ICE candidates that arrive before the remote description are buffered,
      then flushed — addIceCandidate before setRemoteDescription throws. */
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const iceSentRef = useRef(0);
  /** Shows which path the media actually took. */
  const relaySeenRef = useRef(false);
  /** Call-log bookkeeping: was it ever connected, and for how long. */
  const liveEverRef = useRef(false);
  const secondsRef = useRef(0);
  const loggedRef = useRef(false);

  const setStateBoth = (s: CallState, d?: string) => {
    stateRef.current = s;
    setState(s);
    if (d) setDetail(d);
  };

  const clearTimers = () => {
    if (healTimerRef.current) {
      clearTimeout(healTimerRef.current);
      healTimerRef.current = null;
    }
    if (negWatchRef.current) {
      clearTimeout(negWatchRef.current);
      negWatchRef.current = null;
    }
    if (acceptTimerRef.current) {
      clearInterval(acceptTimerRef.current);
      acceptTimerRef.current = null;
    }
    if (offerTimerRef.current) {
      clearInterval(offerTimerRef.current);
      offerTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (answerTimerRef.current) {
      clearInterval(answerTimerRef.current);
      answerTimerRef.current = null;
    }
  };

  const flushPendingIce = async (pc: RTCPeerConnection) => {
    while (pendingIceRef.current.length > 0 && pc.remoteDescription) {
      const cand = pendingIceRef.current.shift();
      if (!cand) break;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch {
        /* one bad candidate never kills the call */
      }
    }
  };

  /** The answer repeats every 2s until the media path is actually up — a
      dropped broadcast can no longer strand the caller waiting forever. */
  const startAnswerRetransmit = () => {
    if (answerTimerRef.current) return;
    answerTimerRef.current = setInterval(() => {
      const pc = pcRef.current;
      if (closedRef.current || !pc || pc.connectionState === "connected") {
        if (answerTimerRef.current) clearInterval(answerTimerRef.current);
        answerTimerRef.current = null;
        return;
      }
      if (chanRef.current && answerSentRef.current) {
        publish(chanRef.current, "signal", { t: "sdp", sdp: answerSentRef.current } satisfies CallSignal);
        traceCall(callIdRef.current, role, "tx-answer-retry");
      }
    }, 2000);
  };

  const cleanup = useCallback((sendHangup: boolean) => {
    if (closedRef.current) return;
    closedRef.current = true;
    clearTimers();
    /* Call log: report connected calls exactly once. */
    if (liveEverRef.current && !loggedRef.current) {
      loggedRef.current = true;
      onCallEnd?.(kind, secondsRef.current);
    }
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
        traceCall(callIdRef.current, role, sig.sdp.type === "offer" ? "rx-offer" : "rx-answer");
        await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
        await flushPendingIce(pc);
        if (sig.sdp.type === "offer") {
          offerSeenRef.current = true;
          if (acceptTimerRef.current) {
            clearInterval(acceptTimerRef.current);
            acceptTimerRef.current = null;
          }
          setDetail("Answering their offer…");
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          answerSentRef.current = answer;
          if (chanRef.current) {
            publish(chanRef.current, "signal", { t: "sdp", sdp: answer } satisfies CallSignal);
            traceCall(callIdRef.current, role, "tx-answer");
          }
          startAnswerRetransmit();
          setDetail("Securing the connection…");
        } else {
          answerSeenRef.current = true;
          if (offerTimerRef.current) {
            clearInterval(offerTimerRef.current);
            offerTimerRef.current = null;
          }
          setDetail("Answer received — securing the connection…");
        }
        return;
      }
      if (sig.t === "ice" && sig.cand) {
        if (!pc.remoteDescription) {
          pendingIceRef.current.push(sig.cand);
          return;
        }
        await pc.addIceCandidate(new RTCIceCandidate(sig.cand));
      }
    } catch (err) {
      traceCall(callIdRef.current, role, "signal-error", err instanceof Error ? err.message : String(err));
    }
  };

  /* --- One full call attempt ---------------------------------------------------- */

  useEffect(() => {
    closedRef.current = false;
    madeOfferRef.current = false;
    restartedRef.current = false;
    offerSentRef.current = null;
    answerSeenRef.current = false;
    offerSeenRef.current = false;
    relaySeenRef.current = false;
    let cancelled = false;

    /* Watchdog: a handshake stuck in "negotiating" for 25s is a dead path —
       fail fast with a clean "Call again" instead of spinning forever. */
    negWatchRef.current = setTimeout(() => {
      if (closedRef.current) return;
      if (stateRef.current === "negotiating") {
        traceCall(callIdRef.current, role, "watchdog-fired", `iceSent=${iceSentRef.current}`);
        cleanup(false);
        setStateBoth("failed", "Couldn't find a stable path — call again.");
      }
    }, 25_000);

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

        /* Peer connection — STUN + TURN relay (mandatory on mobile carriers). */
        const ice = await getIceConfig();
        if (cancelled) return;
        const pc = new RTCPeerConnection(ice);
        pcRef.current = pc;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.ontrack = (e) => {
          const [s] = e.streams;
          if (s) attachRemote(s);
        };
        pc.onicecandidate = (e) => {
          if (!e.candidate) return;
          if (e.candidate.type === "relay") relaySeenRef.current = true;
          iceSentRef.current += 1;
          if (chanRef.current) {
            publish(chanRef.current, "signal", { t: "ice", cand: e.candidate.toJSON() } satisfies CallSignal);
            if (iceSentRef.current === 1) traceCall(callIdRef.current, role, "tx-ice-first", e.candidate.type ?? "unknown");
          }
        };
        pc.onconnectionstatechange = () => {
          if (closedRef.current) return;
          traceCall(callIdRef.current, role, "conn-state", pc.connectionState);
          if (pc.connectionState === "connected") {
            liveEverRef.current = true;
            restartedRef.current = false;
            if (healTimerRef.current) {
              clearTimeout(healTimerRef.current);
              healTimerRef.current = null;
            }
            setStateBoth(
              "live",
              relaySeenRef.current ? "Connected · relayed path (strong)" : "Connected · direct path"
            );
            /* Keepalive: a quiet ping every 10s keeps the channel warm and
               proves the link is still alive end to end. */
            if (!pingTimerRef.current) {
              pingTimerRef.current = setInterval(() => {
                if (chanRef.current && !closedRef.current) {
                  publish(chanRef.current, "control", { t: "ping" } satisfies CallSignal);
                }
              }, 10_000);
            }
            return;
          }
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            /* SELF-HEAL: one automatic ICE restart before giving up. */
            if (!restartedRef.current) {
              restartedRef.current = true;
              setStateBoth("negotiating", "Connection wobbled — healing it…");
              try {
                pc.restartIce();
              } catch {
                /* unsupported — the watchdog below decides */
              }
              healTimerRef.current = setTimeout(() => {
                if (closedRef.current) return;
                if (pcRef.current?.connectionState !== "connected") {
                  cleanup(false);
                  setStateBoth("failed", "The connection dropped — call again.");
                }
              }, 8_000);
              return;
            }
            cleanup(false);
            setStateBoth("failed", "The connection dropped — call again.");
          }
        };

        /* Fresh call channel for THIS attempt */
        const chan = callChannel(callIdRef.current);
        chanRef.current = chan;
        chan.on("broadcast", { event: "signal" }, (msg) => void handleSignal(msg.payload as CallSignal));
        chan.on("broadcast", { event: "control" }, (msg) => {
          const p = msg.payload as CallSignal;
          if (closedRef.current) return;
          if (p.t === "accept" || p.t === "declined" || p.t === "busy") {
            traceCall(callIdRef.current, role, `rx-${p.t}`);
          }
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
                offerSentRef.current = offer;
                if (chanRef.current) publish(chanRef.current, "signal", { t: "sdp", sdp: offer } satisfies CallSignal);
                setDetail("Offer sent — waiting for their answer…");
                /* Retransmit: broadcasts can drop; the offer repeats every 2s
                   until their answer lands. */
                if (!offerTimerRef.current) {
                  offerTimerRef.current = setInterval(() => {
                    if (closedRef.current || answerSeenRef.current) {
                      if (offerTimerRef.current) clearInterval(offerTimerRef.current);
                      offerTimerRef.current = null;
                      return;
                    }
                    if (chanRef.current && offerSentRef.current) {
                      publish(chanRef.current, "signal", { t: "sdp", sdp: offerSentRef.current } satisfies CallSignal);
                    }
                  }, 2000);
                }
              } catch {
                /* retryable via Call again */
              }
            })();
          }
        });

        chan.subscribe((status) => {
          if (cancelled || closedRef.current) return;
          if (status !== "SUBSCRIBED") {
            traceCall(callIdRef.current, role, "chan-status", String(status));
            return;
          }
          traceCall(callIdRef.current, role, "chan-subscribed");

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
                  .then(() => traceCall(callIdRef.current, role, "tx-ring"))
                  .catch((e) => traceCall(callIdRef.current, role, "tx-ring-fail", String(e)));
              }
            });
          } else {
            // Already accepted in the incoming-call screen.
            publish(chan, "control", { t: "accept" } satisfies CallSignal);
            traceCall(callIdRef.current, role, "tx-accept");
            setDetail("Accepted — waiting for their offer…");
            /* Retransmit: broadcasts can drop; the accept repeats every 1.5s
               until their offer arrives. */
            if (!acceptTimerRef.current) {
              acceptTimerRef.current = setInterval(() => {
                if (closedRef.current || offerSeenRef.current) {
                  if (acceptTimerRef.current) clearInterval(acceptTimerRef.current);
                  acceptTimerRef.current = null;
                  return;
                }
                if (chanRef.current) publish(chanRef.current, "control", { t: "accept" } satisfies CallSignal);
              }, 1500);
            }
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
    const iv = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
    return () => clearInterval(iv);
  }, [state]);

  const callAgain = () => {
    callIdRef.current = newCallId();
    restartedRef.current = false;
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
