/** Browser-local, account-scoped feed receipts, NOT message read receipts or Web Push.
 * Store opaque event identities only, never message text, photos or bearer tokens.
 */
export type FeedEvent = { id: string; type: string; at?: string; title?: string; unread?: boolean };
export type FeedReceipts = { delivered: string[]; read: string[] };
const MAX = 2000;
export const feedEventKey = (event: FeedEvent) => `${event.id}|${event.at ?? ""}|${event.type}|${event.type === "verification" ? event.title ?? "" : ""}`;
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
  const fresh = events.filter(item => !delivered.has(feedEventKey(item)));
  for (const item of events) {
    const key = feedEventKey(item);
    delivered.add(key);
    if (pathname.startsWith("/app/notifications") || (pathname.startsWith("/app/likes") && item.type === "like")) read.add(key);
  }
  const pending = events.filter(item => !read.has(feedEventKey(item)));
  return {
    // Initial history is counted but not replayed as a burst of sounds/banners.
    fresh: initial ? [] : fresh,
    alerts: pending.length,
    likes: pending.filter(item => item.type === "like").length,
    receipts: { delivered: [...delivered].slice(-MAX), read: [...read].slice(-MAX) },
  };
}
