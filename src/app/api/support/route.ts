import { db } from "@/db";
import { supportRequests } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

const hits = new Map<string, number[]>();
function rateLimited(accountId: string, max: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(accountId) ?? []).filter((t) => now - t < windowMs);
  hits.set(accountId, recent);
  if (recent.length >= max) return true;
  recent.push(now);
  return false;
}

/**
 * POST /api/support — a message from a real member, stored for a real human
 * to read. No canned replies, no ticket bots.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { message, email } = (body ?? {}) as { message?: string; email?: string };
  const clean = (message ?? "").trim();
  if (clean.length < 5) {
    return Response.json({ error: "Tell us a little more. At least a sentence." }, { status: 400 });
  }
  if (clean.length > 4000) {
    return Response.json({ error: "Keep it under 4,000 characters." }, { status: 400 });
  }
  if (rateLimited(member.id, 10, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many messages. Please try again in an hour." }, { status: 429 });
  }

  await db.insert(supportRequests).values({
    accountId: member.id,
    message: clean,
    email: (email ?? "").trim().slice(0, 200) || null,
  });

  return Response.json({ ok: true });
}
