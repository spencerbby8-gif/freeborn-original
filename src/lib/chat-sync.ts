/**
 * FREEBORN CHAT SYNC — the decision core for keeping a conversation up to date.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until 2026-10-30 the chat screen did one thing: `setInterval(load, 2500)` (chat-view.tsx).
 * That is a correct-by-brute-force design: it never misses a message, and it also never stops —
 * every open thread costs a request every 2.5 s whether anything happened or not, on mobile data,
 * and the sender's own message appeared only after the next tick.
 *
 * The reverse-engineering pass over Bumble/Hinge/Tinder found NO realtime transport anywhere in
 * the acquired surface (`new WebSocket(`, `socket.io`, `Pusher(`, `EventSource(` → zero across 67
 * files), so there is no competitor mechanism to copy here; the closest thing found was Hinge's
 * realtime *client* wrapping a channel publish in `maxRetries || 5` with a `2^n + 100*random()`
 * wait. That is the part worth stealing: bounded retries with jitter, so a room full of clients
 * reconnecting after one outage does not stampede the same instant.
 *
 * What this deployment actually allows is narrower than a normal Supabase realtime design, and
 * that fact drove the architecture. Read-only inspection of production (2026-10-30) shows
 * `messages`, `matches`, `chat_media` and `message_reactions` are `relrowsecurity = true` AND
 * `relforcerowsecurity = true` with **zero policies**: the member client may read none of them,
 * and `postgres_changes` applies the same RLS, so subscribing to `messages` would deliver
 * nothing at all. There is also no service-role key in this app's environment (drizzle reaches
 * Postgres through `SUPABASE_TRANSACTION_POOLER`), so a route cannot POST to the realtime
 * broadcast API either.
 *
 * So the design is three layers, and each one is allowed to fail:
 *
 *   1. NOTIFY — a `chat_signals` row (RLS: participants may SELECT, nobody may write from the
 *      client) lands on `postgres_changes`; plus the sender's own client relays a content-free
 *      broadcast. Instant when it works.
 *   2. POLL — an interval that widens to a heartbeat while notify is healthy and tightens back
 *      down the moment it is not. This is the guarantee, and it is what makes losing a
 *      notification a latency event rather than a lost message.
 *   3. RESYNC — any of wake/online/rejoin/gap runs an immediate full fetch.
 *
 * Notifications carry no message content on purpose: they say "look again", never "here is the
 * text". A channel name is a UUID, but a channel is not a secret, so anything sent over it must
 * be safe to read. Authorisation stays entirely in the HTTP route (`decideMatchAccess`), which is
 * the only place that has a verified member.
 *
 * This module is pure and has no Supabase import, exactly like `match-lifecycle.ts` and
 * `media-access.ts`: the whole fact space is then executable in the harness
 * (`npm run test:harness`, section [18]) instead of being argued about in prose.
 */

/** Every shape a message row can arrive in, normalised by `mergeMessages`. */
export type SyncMessage = {
  id: string;
  body: string;
  at: string;
  mine: boolean;
  read?: boolean;
  flagged?: boolean;
};

/** A message the member typed that the server has not confirmed yet. */
export type PendingMessage = {
  tempId: string;
  body: string;
  at: number;
  /** attempts > 0 means it is being retried after a failure, not sent for the first time */
  attempts: number;
  failed: boolean;
  /** the stored row's id, once the server has acknowledged this echo (see `ackPending`) */
  ackId?: string;
};

export type ChannelPhase = "idle" | "connecting" | "joined" | "errored" | "closed";

export type SyncEvent =
  | { t: "start" }
  | { t: "subscribed" }
  | { t: "error" }
  | { t: "offline" }
  | { t: "online" }
  | { t: "visible" }
  | { t: "hidden" }
  | { t: "notice" }
  | { t: "close" };

export const SYNC_LIMITS = {
  /** Retries are bounded and always fall back to polling, so a dead channel is never fatal. */
  maxReconnectAttempts: 5, // matches the ceiling found in Hinge's realtime client
  minRetryMs: 250,
  maxRetryMs: 20_000,
  /** Jitter is what stops every client retrying in the same tick after one outage. */
  jitterMs: 100,
  /** Poll cadences (ms). `null` = do not poll at all. */
  pollLiveMs: 2_500,
  pollNotifiedMs: 20_000,
  pollHeartbeatMs: 45_000,
  pollRecoveringMs: 1_000,
  /** A pending echo older than this stops being shown; the server copy wins. */
  pendingTtlMs: 60_000,
  maxPendingPerThread: 20,
} as const;

/* ------------------------------------------------------------------------- *
 * Connection state machine
 * ------------------------------------------------------------------------- */

/**
 * Legal transitions only. Two rules matter and are pinned in the harness:
 *  - `closed` is terminal: a torn-down channel must never be revived by a late event,
 *    because the component that owns it has already unsubscribed its handlers;
 *  - `online`/`visible` never jump straight to `joined`; only a real subscribe callback can
 *    claim the channel is live. Otherwise a flapping network would show "connected" on a
 *    channel that is not subscribed, and the widened heartbeat would then drop messages.
 */
export function nextPhase(phase: ChannelPhase, ev: SyncEvent): ChannelPhase {
  if (ev.t === "close") return "closed";
  if (phase === "closed") return "closed";
  switch (phase) {
    case "idle":
      return ev.t === "start" ? "connecting" : phase;
    case "connecting":
      if (ev.t === "subscribed") return "joined";
      if (ev.t === "error" || ev.t === "offline") return "errored";
      return phase;
    case "joined":
      if (ev.t === "error" || ev.t === "offline") return "errored";
      if (ev.t === "start") return "connecting";
      return phase;
    case "errored":
      if (ev.t === "start" || ev.t === "online") return "connecting";
      return phase;
    default:
      return phase;
  }
}

/** `2^attempt * base`, clamped, plus deterministic jitter supplied by the caller. */
export function reconnectDelayMs(
  attempt: number,
  rand: () => number = () => 0
): number {
  const n = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  const exp = Math.min(SYNC_LIMITS.maxRetryMs, SYNC_LIMITS.minRetryMs * 2 ** Math.min(n, 16));
  // `rand` is called once and its result coerced: `typeof r` against an undeclared name would
  // have silently returned "undefined" and made jitter a permanent zero, which is exactly what
  // the [18] pin below caught.
  const raw = Number(rand ? rand() : 0);
  // Non-finite input is coerced to zero jitter rather than poisoning the delay: a NaN here
  // becomes setTimeout(fn, NaN) === an immediate call, i.e. an unbounded retry loop.
  const jitter = Math.round(
    (Number.isFinite(raw) ? Math.max(0, Math.min(0.999, raw)) : 0) * SYNC_LIMITS.jitterMs
  );
  return exp + jitter;
}

/** Gives up after `maxReconnectAttempts`; polling then carries the conversation alone. */
export function shouldGiveUpReconnecting(attempt: number): boolean {
  return attempt >= SYNC_LIMITS.maxReconnectAttempts;
}

/* ------------------------------------------------------------------------- *
 * Poll policy — the part that decides whether the app is chatty or laggy
 * ------------------------------------------------------------------------- */

export type PollContext = {
  phase: ChannelPhase;
  visible: boolean;
  online: boolean;
  /** consecutive failed fetches; drives recovery tightening */
  failures: number;
};

/**
 * `null` means "no timer". While the tab is hidden or the browser says we are offline, polling
 * is pointless: nothing renders, and requests would only queue. Both paths end with an immediate
 * resync (visibilitychange / online), so nothing is missed — this is the one place where being
 * quieter is also more correct.
 */
export function pollIntervalMs(ctx: PollContext): number | null {
  if (!ctx.online || !ctx.visible) return null;
  if (ctx.failures > 0) return SYNC_LIMITS.pollRecoveringMs;
  switch (ctx.phase) {
    case "joined":
      return SYNC_LIMITS.pollHeartbeatMs;
    case "connecting":
    case "idle":
      return SYNC_LIMITS.pollLiveMs;
    case "errored":
      return SYNC_LIMITS.pollNotifiedMs;
    default:
      return SYNC_LIMITS.pollLiveMs;
  }
}

/** A notify event means "fetch now"; `closed`/hidden contexts must not schedule a fetch. */
export function shouldFetchNow(ctx: { phase: ChannelPhase; visible: boolean; online: boolean }, ev: SyncEvent): boolean {
  if (ctx.phase === "closed") return false;
  if (ev.t === "notice") return ctx.visible && ctx.online;
  if (ev.t === "visible" || ev.t === "online" || ev.t === "subscribed") return ctx.online;
  return false;
}

/** How many misses before the client stops trusting the channel and returns to tight polling. */
export function noteFailureCount(prev: number, ok: boolean): number {
  return ok ? 0 : prev + 1;
}

/* ------------------------------------------------------------------------- *
 * Merge, dedupe, reconcile
 * ------------------------------------------------------------------------- */

/**
 * The server list is authoritative: its order, its rows, its ids. Local-only rows are the
 * un-acked echoes, appended after the server rows (they are always newer) and ordered by their
 * own timestamp. Ids are unique, so a duplicate id is a bug elsewhere and is dropped rather
 * than rendered twice.
 */
/**
 * A pending echo, rendered as a message. Kept here so the shape of an un-acked bubble is
 * decided in one place: `read` is false (nobody can have read it), and `pending: true` is what
 * the UI uses to offer a retry without inventing a second list of bubbles.
 */
export function pendingToMessage(p: PendingMessage): SyncMessage & { pending: true; failed: boolean } {
  return {
    id: p.tempId,
    body: p.body,
    at: new Date(p.at).toISOString(),
    mine: true,
    read: false,
    pending: true,
    failed: p.failed,
  };
}

/**
 * The server list is authoritative: its order, its rows, its ids. `extra` is whatever the
 * client has that the server cannot know about yet — un-acked echoes, in practice — and is
 * appended after it, because it is always newer. Ids are unique, so a duplicate id is a bug
 * elsewhere and is dropped rather than rendered twice.
 */
export function mergeMessages<T extends { id: string }>(remote: readonly T[], extra: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of [...remote, ...extra]) {
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/**
 * Reconciling the optimistic echo.
 *
 * The old code dropped a pending item when `server.some(m => m.mine && m.body === p.body)`
 * matched within 20 s. Text-matching is wrong in both directions: typing the same words twice
 * makes one copy vanish, and a slow server (>20 s) makes a real message disappear and then
 * reappear. When the POST returns the stored row (`ackId`), identity is exact; body matching
 * survives only as the fallback for servers that return nothing.
 */
export function reconcilePending(
  pending: readonly PendingMessage[],
  ack: { tempId?: string; ackId?: string; serverRows?: readonly { id?: string; body: string; mine: boolean; at?: string }[] }
): PendingMessage[] {
  const now = Date.now();
  const rows = ack.serverRows ?? [];
  const consumed = new Set<number>();
  return pending.filter((p) => {
    // A failed send is the member's to retry or dismiss; the sync loop must never eat it.
    if (p.failed) return true;
    if (ack.tempId && p.tempId === ack.tempId) return false;
    if (ack.ackId && p.ackId === ack.ackId) return false;
    if (now - p.at > SYNC_LIMITS.pendingTtlMs) return false;
    /* Legacy fallback for a server that returns no id: pair each echo with AT MOST ONE
       matching server row. One-to-one is the whole point — a naive `.some()` retires every
       duplicate the member typed ("ok" twice) against the single row that arrived first,
       which is how a real message could vanish. */
    const i = rows.findIndex(
      (r, idx) =>
        !consumed.has(idx) &&
        r.mine &&
        r.body === p.body &&
        (r.at == null || Math.abs(Date.parse(r.at) - p.at) < 5_000)
    );
    if (i >= 0) {
      consumed.add(i);
      return false;
    }
    return true;
  });
}

/** Attach the server id to the echo it answers, so a duplicate render is impossible. */
export function ackPending(
  pending: readonly PendingMessage[],
  tempId: string,
  ackId: string
): PendingMessage[] {
  return pending.map((p) => (p.tempId === tempId ? { ...p, ackId } : p));
}

export function markPendingFailed(pending: readonly PendingMessage[], tempId: string): PendingMessage[] {
  return pending.map((p) => (p.tempId === tempId ? { ...p, failed: true, attempts: p.attempts + 1 } : p));
}

export function queuePending(
  pending: readonly PendingMessage[],
  item: { tempId: string; body: string; at?: number }
): PendingMessage[] {
  const next = [...pending, { tempId: item.tempId, body: item.body, at: item.at ?? Date.now(), attempts: 0, failed: false }];
  // A bounded queue: an unbounded one turns a dead connection into a memory leak plus a
  // wall of messages that all land at once when it returns.
  return next.length > SYNC_LIMITS.maxPendingPerThread ? next.slice(next.length - SYNC_LIMITS.maxPendingPerThread) : next;
}

/* ------------------------------------------------------------------------- *
 * Gap detection
 * ------------------------------------------------------------------------- */

/**
 * A missed notification looks exactly like a quiet conversation, so the client compares what it
 * was told with what it got. `knownCount` counts server rows since the last full resync; a
 * notification that produced no new rows means we missed something between the last fetch and
 * now, and the recovery is a full fetch, not another nudge.
 */
export type GapView = {
  lastFetchAt: number;
  knownCount: number;
  noticesSinceFetch: number;
};

export function detectGap(view: GapView, fetched: { count: number; newestAt: string | null }): "ok" | "new-rows" | "silence" | "older-than-known" {
  if (fetched.count > view.knownCount) return "new-rows";
  if (fetched.count < view.knownCount) return "older-than-known"; // the thread was wiped/severed under us
  if (view.noticesSinceFetch > 0) return "silence";
  return "ok";
}

/** Newest-first guard: a signal row older than the newest message we already hold is stale. */
export function noticeIsStale(signalAt: string | null | undefined, newestHeldAt: string | null): boolean {
  if (!signalAt) return false;
  if (!newestHeldAt) return false;
  const a = Date.parse(signalAt);
  const b = Date.parse(newestHeldAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a < b;
}

export const SYNC_TOPICS = {
  channelPrefix: "fb-chat:",
  broadcastEvent: "fb-message",
  signalTable: "chat_signals",
} as const;

export function chatChannelName(matchId: string): string {
  return `${SYNC_TOPICS.channelPrefix}${matchId}`;
}

export function signalFilter(matchId: string): string {
  return `match_id=eq.${matchId}`;
}
