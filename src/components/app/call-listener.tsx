"use client";

/**
 * FREEBORN INCOMING CALLS — listens on the member's personal ring channel.
 * When a match calls, THIS device rings (sound + full-screen prompt),
 * whether the member is on chat, discover, or anywhere in the app.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { callChannel, publish, type RingPayload } from "@/lib/call-bus";
import { startRingtone, stopRingtone } from "@/lib/notify";
import { CallOverlay } from "./call-overlay";

const RING_AUTO_MISS_MS = 45_000;

export function CallListener() {
  const [incoming, setIncoming] = useState<RingPayload | null>(null);
  const [active, setActive] = useState<{ role: "callee"; payload: RingPayload } | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    busyRef.current = incoming !== null || active !== null;
  }, [incoming, active]);

  useEffect(() => {
    let cancelled = false;
    let ring: ReturnType<ReturnType<typeof createSupabaseBrowserClient>["channel"]> | null = null;

    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      ring = supabase.channel(`fb-ring:${user.id}`);

      ring.on("broadcast", { event: "ring" }, (msg) => {
        const payload = msg.payload as RingPayload;
        if (!payload?.matchId || cancelled) return;
        if (busyRef.current) {
          // Already ringing or on a call — tell the caller we're busy.
          const busyChan = callChannel(payload.matchId);
          busyChan.subscribe((s) => {
            if (s === "SUBSCRIBED") publish(busyChan, "control", { t: "busy" });
          });
          return;
        }
        setIncoming(payload);
        startRingtone();
      });

      ring.subscribe();
    })();

    return () => {
      cancelled = true;
      stopRingtone();
      try {
        ring?.unsubscribe();
      } catch {
        /* gone */
      }
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

  const accept = useCallback(() => {
    if (!incoming) return;
    stopRingtone();
    setActive({ role: "callee", payload: incoming });
    setIncoming(null);
  }, [incoming]);

  const decline = useCallback(() => {
    if (!incoming) return;
    stopRingtone();
    const chan = callChannel(incoming.matchId);
    chan.subscribe((s) => {
      if (s === "SUBSCRIBED") publish(chan, "control", { t: "declined" });
    });
    setIncoming(null);
  }, [incoming]);

  return (
    <>
      {/* Incoming call — full screen, impossible to miss */}
      {incoming ? (
        <div className="fixed inset-0 z-[220] flex flex-col items-center justify-between bg-[#070a14]/98 px-6 py-12 backdrop-blur-md">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--color-gold-300)]">
            Incoming {incoming.kind === "video" ? "video" : "voice"} call
          </p>
          <div className="flex flex-col items-center gap-4">
            {incoming.from.photo ? (
              <img
                src={incoming.from.photo}
                alt={incoming.from.name}
                className="h-36 w-36 animate-pulse rounded-full border-2 border-white/15 object-cover"
              />
            ) : (
              <span className="flex h-36 w-36 animate-pulse items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] font-display text-5xl font-bold text-white">
                {(incoming.from.name || "?").charAt(0)}
              </span>
            )}
            <p className="font-display text-3xl font-semibold text-[var(--color-pearl)]">
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
          peer={active.payload.from}
          onClose={() => setActive(null)}
        />
      ) : null}
    </>
  );
}
