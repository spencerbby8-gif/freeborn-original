import type { SupabaseClient } from "@supabase/supabase-js";
import { chatChannelName, SYNC_TOPICS } from "@/lib/chat-sync";

export type ChatServerNoticeKind = "message" | "severed" | "cleared";

/** REST delivery needs no socket subscription. Keep it short: polling is the floor. */
export const CHAT_NOTICE_TIMEOUT_MS = 1_500;

/**
 * Send a content-free nudge with the already authenticated member's JWT.
 * Authorization has already happened in the HTTP route and is enforced again by
 * Realtime's private-topic RLS. No service-role credential is needed or accepted.
 */
export async function publishChatNotice(
  client: SupabaseClient,
  accessToken: string,
  matchId: string,
  kind: ChatServerNoticeKind,
  now: () => string = () => new Date().toISOString(),
): Promise<boolean> {
  await client.realtime.setAuth(accessToken);
  const channel = client.channel(chatChannelName(matchId), {
    config: { private: true, broadcast: { self: false, ack: true } },
  });
  try {
    const result = await channel.httpSend(
      SYNC_TOPICS.broadcastEvent,
      { kind, at: now() },
      { timeout: CHAT_NOTICE_TIMEOUT_MS },
    );
    return result.success === true;
  } finally {
    // REST-only channels must not accumulate in a long-lived server process.
    try { await client.removeChannel(channel); } catch { /* already gone */ }
  }
}
