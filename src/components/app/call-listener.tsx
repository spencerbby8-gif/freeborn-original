"use client";

/**
 * FREEBORN INCOMING CALLS — listens on the member's personal ring channel.
 * When a match calls, THIS device rings (sound + full-screen prompt),
 * whether the member is on chat, discover, or anywhere in the app.
 */

import { PhotoImage } from "@/components/ui/photo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { callChannel, destroyChannel, getCallSession, getIncomingCall, publish, ringChannel, traceCall, updateCallSession, type RingPayload } from "@/lib/call-bus";
import { startRingtone, stopRingtone } from "@/lib/notify";
import { CallOverlay } from "./call-overlay";
import { holdCallUi } from "@/lib/call-ui-state";

const RING_AUTO_MISS_MS = 45_000;

export function CallListener() {
  const [incoming, setIncoming] = useState<RingPayload | null>(null);
  /* B20 — handlers outside React's render path need the current ring without a
     stale closure, so the payload mirrors into a ref on every change. */
  const incomingRef = useRef<RingPayload | null>(null);
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);
  const [active, setActive] = useState<{ role: "callee"; payload: RingPayload } | null>(null);
  const busyRef = useRef(false);
  /* The callId this member is already ringing or already on, kept in refs so a
     delivery arriving while the socket handler runs can compare against it. */
  const handledIdRef = useRef<string | null>(null);

  useEffect(() => {
    busyRef.current = incoming !== null || active !== null;
    handledIdRef.current = active?.payload.callId ?? incoming?.callId ?? null;
  }, [incoming, active]);

  /* The incoming ring is plain JSX in this component (CallOverlay only mounts
     once a call is answered or placed), so it takes its own hold: while it is
     up, the notification-permission ask - which paints at z-[310], straight on
     top of Answer/Decline - stands down. See src/lib/call-ui-state.ts. */
  useEffect(() => {
    if (incoming === null) return;
    return holdCallUi();
  }, [incoming]);

  /*
   * A ring for the call this member is ALREADY handling is a duplicate
   * delivery, not a second call. Owner report B11 ("the call never reaches the
   * other user, never holds"): measured live, the callee's incoming screen came
   * up from the poll floor at +2.3s and was answered at +2.9s; the caller's
   * broadcast then delivered the SAME callId again at +4.8s. busyRef was
   * already true for that very call, so respondBusy() told the caller "on
   * another call" and declined the live session server-side - the callee's next
   * GET /api/calls/ice came back 410 and the answered call died with "This call
   * isn't available." The ring is delivered on two paths by design (broadcast
   * for speed, poll as the floor), so duplicate delivery of one callId is
   * expected and must be a no-op, never a busy reply.
   */
  const isAlreadyHandled = (callId: string) => handledIdRef.current === callId;

  /* The floor under the broadcast ring. The socket above is the fast path; this
     poll is what still delivers a ring when the socket is not joined yet, is
     mid-reconnect, or is blocked outright - and it needs no Realtime at all.
     Identity, match and kind still come from the server-issued session, never
     from a payload, so nothing about the trust model changes. */
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled || busyRef.current) return;
      const session = await getIncomingCall();
      if (cancelled || busyRef.current || !session) return;
      /* The route already scopes this to the signed-in member's own live rings;
         this is the cheap client-side sanity check on top. */
      if (session.status !== "ringing") return;
      if (isAlreadyHandled(session.id)) {
        traceCall(session.id, "callee", "rx-ring-poll-duplicate");
        return;
      }
      const payload: RingPayload = {
        callId: session.id,
        matchId: session.matchId,
        kind: session.kind,
        from: session.peer,
      };
      handledIdRef.current = payload.callId;
      traceCall(payload.callId, "callee", "rx-ring-poll");
      setIncoming(payload);
      startRingtone();
    };
    void tick();
    const timer = setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let ring: Awaited<ReturnType<typeof ringChannel>> | null = null;

    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      ring = await ringChannel(user.id);
      if (cancelled) { destroyChannel(ring); return; }

      const respondBusy = (callId: string) => {
        void (async () => {
          const chan = await callChannel(callId);
          chan.subscribe((s) => {
            if (s === "SUBSCRIBED") {
              publish(chan, "control", { t: "busy" });
              setTimeout(() => {
                destroyChannel(chan);
                void updateCallSession(callId, "decline").catch(() => undefined);
              }, 500);
            }
          });
        })().catch(() => undefined);
      };

      ring.on("broadcast", { event: "ring" }, (msg) => {
        void (async () => {
          const hint = msg.payload as Partial<RingPayload> | null;
          if (!hint?.callId || cancelled) return;
          // The broadcast is only a hint. Identity, match and call kind come from
          // the server-issued session, so a forged payload cannot impersonate a peer.
          const session = await getCallSession(hint.callId);
          if (cancelled || session.status !== "ringing" || session.calleeId !== user.id) return;
          const payload: RingPayload = { callId: session.id, matchId: session.matchId, kind: session.kind, from: session.peer };
          if (isAlreadyHandled(payload.callId)) {
            traceCall(payload.callId, "callee", "rx-ring-duplicate");
            return;
          }
          traceCall(payload.callId, "callee", "rx-ring");
          if (busyRef.current) { respondBusy(payload.callId); return; }
          handledIdRef.current = payload.callId;
          setIncoming(payload);
          startRingtone();
        })().catch(() => undefined);
      });

      /* B20 — the caller cancelled (or gave up). Their ring screen must fall
         the moment this lands; the liveness poll below is the floor if it is
         lost to a reconnect. */
      ring.on("broadcast", { event: "ring-cancel" }, (msg) => {
        const hint = msg.payload as { callId?: string } | null;
        if (!hint?.callId || cancelled) return;
        traceCall(hint.callId, "callee", "rx-ring-cancel");
        if (incomingRef.current?.callId === hint.callId) {
          stopRingtone();
          setIncoming(null);
        }
      });

      ring.subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") traceCall("ring", "callee", "ring-channel-error", String(status));
      });
    })();

    return () => {
      cancelled = true;
      stopRingtone();
      destroyChannel(ring);
    };
  }, []);

  /* Auto-miss if unanswered. */
  useEffect(() => {
    if (!incoming) return;
    const t = setTimeout(() => {
      stopRingtone();
      setIncoming(null);
    }, RING_AUTO_MISS_MS);
    return () => clearTimeout(t);
  }, [incoming]);

  /* B20 — the ring screen must never outlive the call session. A cancel that
     missed the broadcast (socket mid-reconnect, app in background) is caught
     here: while a ring is showing, re-ask the server whether it still rings,
     and drop the screen the instant it does not. getCallSession throws on the
     410 an ended session returns, which is exactly the "gone" case. */
  useEffect(() => {
    if (!incoming) return;
    let cancelled = false;
    const check = async () => {
      try {
        const session = await getCallSession(incoming.callId);
        if (!cancelled && session.status !== "ringing") {
          traceCall(incoming.callId, "callee", "ring-session-not-ringing");
          stopRingtone();
          setIncoming(null);
        }
      } catch {
        if (!cancelled) {
          traceCall(incoming.callId, "callee", "ring-session-gone");
          stopRingtone();
          setIncoming(null);
        }
      }
    };
    void check();
    const iv = setInterval(() => void check(), 1500);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [incoming]);

  const accept = useCallback(() => {
    if (!incoming) return;
    stopRingtone();
    setActive({ role: "callee", payload: incoming });
    setIncoming(null);
  }, [incoming]);

  const decline = useCallback(() => {
    if (!incoming) return;
    stopRingtone();
    const callId = incoming.callId;
    void (async () => {
      const chan = await callChannel(callId);
      chan.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          publish(chan, "control", { t: "declined" });
          setTimeout(() => {
            destroyChannel(chan);
            void updateCallSession(callId, "decline").catch(() => undefined);
          }, 500);
        }
      });
    })().catch(() => undefined);
    setIncoming(null);
  }, [incoming]);

  return (
    <>
      {/* Incoming call — full screen, impossible to miss */}
      {incoming ? (
        <div className="reference-call reference-call-incoming" role="dialog" aria-modal="true" aria-label="Incoming Freeborn call">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--color-gold-300)]">
            Incoming {incoming.kind === "video" ? "video" : "voice"} call
          </p>
          <div className="flex flex-col items-center gap-4">
            {incoming.from.photo ? (
              <PhotoImage src={incoming.from.photo} alt={incoming.from.name} className="h-36 w-36 rounded-full border-2 border-white/15" imgClassName="animate-pulse object-cover" />
            ) : (
              <span className="flex h-36 w-36 animate-pulse items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] font-display text-5xl font-bold text-white">
                {(incoming.from.name || "?").charAt(0)}
              </span>
            )}
            <p className="reference-call-name">
              {incoming.from.name || "Freeborn member"}
            </p>
            <p className="text-[13px] text-[var(--color-mist)]">is calling you on Freeborn…</p>
          </div>
          <div className="flex items-center gap-10">
            <button
              type="button"
              onClick={decline}
              aria-label="Decline call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_16px_40px_-10px_rgba(239,68,68,0.7)] transition active:scale-95"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 9c-3.2 0-6.1.9-8.5 2.4l2 3.1c1.9-1.1 4.1-1.7 6.5-1.7s4.6.6 6.5 1.7l2-3.1C18.1 9.9 15.2 9 12 9z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={accept}
              aria-label="Answer call"
              className="flex items-center justify-center rounded-full bg-[#2fbf71] p-5 text-white shadow-[0_16px_40px_-10px_rgba(47,191,113,0.7)] transition active:scale-95"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}

      {/* Active call accepted from the listener */}
      {active ? (
        <CallOverlay
          kind={active.payload.kind}
          role="callee"
          matchId={active.payload.matchId}
          callId={active.payload.callId}
          peer={active.payload.from}
          onClose={() => setActive(null)}
        />
      ) : null}
    </>
  );
}
