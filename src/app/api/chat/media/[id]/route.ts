import { eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMedia } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/media/:id
 * Streams a stored chat attachment. Ids are random uuids (unguessable), and
 * responses are cached forever since blobs are immutable.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [row] = await db
    .select({ mime: chatMedia.mime, data: chatMedia.data })
    .from(chatMedia)
    .where(eq(chatMedia.id, id))
    .limit(1);

  if (!row) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
