import { after } from "next/server";
import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";
import { publishChatNotice, type ChatServerNoticeKind } from "@/lib/chat-notify-core";

/**
 * Schedule a best-effort server-originated nudge only after the route's durable
 * mutation has succeeded. The response and the message never depend on Realtime.
 */
export function scheduleChatNotice(
  request: Request,
  matchId: string,
  kind: ChatServerNoticeKind,
): void {
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  // Create the request-scoped client while request/cookie context is unquestionably live.
  const clientPromise = createSupabaseClientForApi(request);

  after(async () => {
    try {
      const client = await clientPromise;
      const accessToken = bearerToken ?? (await client.auth.getSession()).data.session?.access_token;
      if (!accessToken) return;
      await publishChatNotice(client, accessToken, matchId, kind);
    } catch {
      // An accelerator may fail. The durable signal, resync and polling remain authoritative.
    }
  });
}
