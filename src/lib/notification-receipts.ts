/** Browser-local, account-scoped feed receipts, NOT message read receipts or Web Push.
 * Store opaque event identities only, never message text, photos or bearer tokens.
 */
export type FeedEvent = { id: string; type: string; at?: string; title?: string; unread?: boolean; eventId?: string; matchId?: string; unreadIds?: string[] };
export type FeedReceipts = { delivered: string[]; read: string[] };
const MAX = 2000;
export const feedEventKey = (event: FeedEvent) => `${event.id}|${event.at ?? ""}|${event.type}|${event.type === "verification" ? event.title ?? "" : ""}${event.type === "message" && event.eventId ? `|${event.eventId}` : ""}`;
const storageKey = (accountId: string) => `freeborn.feed-receipts.v1.${accountId}`;
export function loadFeedReceipts(accountId: string): FeedReceipts {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(accountId)) ?? "null");
    const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-MAX) : [];
    return { delivered: strings(value?.delivered), read: strings(value?.read) };
  } catch { return { delivered: [], read: [] }; }
}
export function saveFeedReceipts(accountId: string, value: FeedReceipts) {
  try { localStorage.setItem(storageKey(accountId), JSON.stringify(value)); } catch { /* memory state still works */ }
}
export function reconcileFeed(items: FeedEvent[], previous: FeedReceipts, pathname: string, initial: boolean) {
  const delivered = new Set(previous.delivered), read = new Set(previous.read);
  const events = items.filter(item => item.type !== "tip");
  // Individual unread IDs distinguish new messages from a shrinking unread
  // set (read/deletion) and from equal timestamps. Never store message text.
  const messageKeys = (item: FeedEvent) => item.type === "message" && item.matchId && Array.isArray(item.unreadIds)
    ? item.unreadIds.filter(id => typeof id === "string").map(id => `message:${item.matchId}:${id}`) : [];
  const fresh = events.filter(item => {
    // A snapshot already seen is never new even if the bounded store has
    // evicted some of its individual message tokens.
    if (delivered.has(feedEventKey(item))) return false;
    const keys = messageKeys(item);
    return keys.length ? keys.some(key => !delivered.has(key)) : true;
  });
  for (const item of events) {
    const key = feedEventKey(item);
    delivered.add(key);
    messageKeys(item).forEach(messageKey => delivered.add(messageKey));
    if (pathname.startsWith("/app/notifications") || (pathname.startsWith("/app/likes") && item.type === "like")) read.add(key);
  }
  // Keep current snapshot keys ahead of older per-message keys when pruning.
  // This prevents a large unchanged unread backlog from replaying every poll.
  for (const item of events) { const key = feedEventKey(item); delivered.delete(key); delivered.add(key); }
  const pending = events.filter(item => !read.has(feedEventKey(item)));
  return {
    // Initial history is counted but not replayed as a burst of sounds/banners.
    fresh: initial ? [] : fresh,
    alerts: pending.length,
    likes: pending.filter(item => item.type === "like").length,
    receipts: { delivered: [...delivered].slice(-MAX), read: [...read].slice(-MAX) },
  };
}

/** In the foreground, a message in the mounted thread is already being viewed.
 * Do not suppress a different thread or a backgrounded tab. Feed receipts and
 * server-side message read state remain separate. */
export function shouldSurfaceAlert(event: FeedEvent, pathname: string, tabHidden: boolean, activeChat: (matchId: string) => boolean): boolean {
  if (pathname.startsWith("/app/notifications")) return false;
  return !(event.type === "message" && event.matchId && !tabHidden && activeChat(event.matchId));
}
