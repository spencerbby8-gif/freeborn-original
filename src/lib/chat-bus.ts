/**
 * FREEBORN CHAT BUS — the thin Supabase layer over the rules in `chat-sync.ts`.
 *
 * Everything with a decision in it lives in `chat-sync.ts` (pure, exhaustively tested).
 * This file only moves bytes: subscribe, listen, hand the decision core what it asked for,
 * and always leave the polling fallback intact.
 *
 * Two notification paths, deliberately redundant:
 *   - `postgres_changes` on `public.chat_signals` (RLS: participants read, nobody writes from
 *     a client) — durable, works even when the sender's browser dies, and is what carries the
 *     "the other side ended this" and "delete" notices;
 *   - a content-free broadcast relayed by the sender's own client — sub-100 ms while both are
 *     online, and harmless to lose.
 *
 * Neither path is trusted with content or with authorisation. A member who is not in the match
 * learns nothing useful from a channel name, and the HTTP route still decides everything.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  SYNC_LIMITS,
  chatChannelName,
  nextPhase,
  reconnectDelayMs,
  shouldGiveUpReconnecting,
  signalFilter,
  type ChannelPhase,
  type SyncEvent,
} from "@/lib/chat-sync";

export type ChatNotice = {
  /** what changed; unknown kinds are treated as "look again", never as an error */
  kind: "message" | "severed" | "cleared" | "typing" | string;
  matchId?: string;
  at?: string;
};

export type ChatBusHandlers = {
  /** called for every signal AND on reconnect/visibility, i.e. whenever a fetch is due */
  onNotice: (notice: ChatNotice) => void;
  onPhase: (phase: ChannelPhase) => void;
};

export type ChatBus = {
  dispose: () => void;
  /** true while the realtime path is believed to be live (the poll widens to a heartbeat) */
  isJoined: () => boolean;
  forceResync: (reason?: string) => void;
};

const SYNC_EVENT = "fb-message";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Relay a "look again" hint to the other member from the sender's own client.
 * Fire-and-forget: if the channel is not joined we simply do not relay, and the signal row the
 * server wrote still arrives. This must never await, retry or throw into a send path.
 */
export function relayMessageNotice(matchId: string, kind: ChatNotice["kind"] = "message"): void {
  try {
    const client = createSupabaseBrowserClient();
    // No getChannel() in this supabase-js version; find it by topic among the client's channels.
    const ch = client.getChannels().find((c) => c.topic === chatChannelName(matchId));
    if (!ch) return;
    if ((ch.state as string) !== "joined" && (ch.state as string) !== "SUBSCRIBED") return;
    void ch.send({ type: "broadcast", event: SYNC_EVENT, payload: { kind, at: nowIso() } });
  } catch {
    /* the notification is an accelerator; losing it costs latency, never a message */
  }
}

/**
 * Join the conversation channel for one match.
 *
 * The caller owns exactly one bus per open thread and must `dispose()` it on unmount — an
 * undisposed channel keeps delivering into an unmounted component (this is the same bug that
 * made a second call attempt never ring, fixed in `call-bus.ts` by destroying channels rather
 * than reusing them).
 */
export function joinChatChannel(matchId: string, handlers: ChatBusHandlers): ChatBus {
  const client = createSupabaseBrowserClient();
  let phase: ChannelPhase = "idle";
  let attempt = 0;
  let disposed = false;
  let channel: RealtimeChannel | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = (next: ChannelPhase) => {
    phase = next;
    try {
      handlers.onPhase(next);
    } catch {
      /* a render error must not break the transport */
    }
  };

  const step = (ev: SyncEvent) => {
    const next = nextPhase(phase, ev);
    if (next !== phase) emit(next);
    return next;
  };

  const detach = () => {
    if (!channel) return;
    try {
      client.removeChannel(channel);
    } catch {
      try {
        channel.unsubscribe();
      } catch {
        /* already gone */
      }
    }
    channel = null;
  };

  const schedule = (delay: number) => {
    if (timer) clearTimeout(timer);
    if (disposed) return;
    timer = setTimeout(() => {
      timer = null;
      void connect();
    }, delay);
  };

  function connect() {
    if (disposed) return;
    if (shouldGiveUpReconnecting(attempt)) {
      // Stop trying the socket. Polling continues at its own rate and a later `online`/
      // visibility event resets the counter, so this is a pause, not a permanent downgrade.
      step({ t: "error" });
      return;
    }
    step({ t: "start" });
    detach();
    const ch = client
      .channel(chatChannelName(matchId), { config: { broadcast: { self: false } } })
      .on("broadcast", { event: SYNC_EVENT }, (payload) => {
        const p = (payload?.payload ?? {}) as Partial<ChatNotice>;
        handlers.onNotice({ kind: typeof p.kind === "string" ? p.kind : "message", matchId, at: typeof p.at === "string" ? p.at : nowIso() });
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_signals", filter: signalFilter(matchId) },
        (change) => {
          const rec = (change?.new ?? {}) as { kind?: string; created_at?: string };
          handlers.onNotice({
            kind: rec.kind ?? "message",
            matchId,
            at: typeof rec.created_at === "string" ? rec.created_at : nowIso(),
          });
        }
      );
    channel = ch;
    ch.subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        attempt = 0;
        step({ t: "subscribed" });
        // Anything that landed while we were off the channel is fetched, not guessed.
        handlers.onNotice({ kind: "resync", matchId, at: nowIso() });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        step({ t: "error" });
        attempt += 1;
        if (!disposed) schedule(reconnectDelayMs(attempt, Math.random));
      } else if (status === "CLOSED") {
        if (!disposed) {
          step({ t: "error" });
          attempt += 1;
          schedule(reconnectDelayMs(attempt, Math.random));
        }
      }
    });
  }

  const onOnline = () => {
    attempt = 0;
    step({ t: "online" });
    handlers.onNotice({ kind: "resync", matchId, at: nowIso() });
    schedule(SYNC_LIMITS.minRetryMs);
  };
  const onOffline = () => {
    step({ t: "offline" });
  };
  const onVisibility = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible") {
      // Waking up is the moment a backgrounded phone has the most to catch up on.
      handlers.onNotice({ kind: "resync", matchId, at: nowIso() });
      if (phase !== "joined") {
        attempt = 0;
        schedule(SYNC_LIMITS.minRetryMs);
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
  }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

  connect();

  return {
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      }
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      detach();
      step({ t: "close" });
    },
    isJoined: () => phase === "joined",
    forceResync: () => {
      handlers.onNotice({ kind: "resync", matchId, at: nowIso() });
    },
  };
}
