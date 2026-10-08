import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventInterests } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/events/interest — the member's own interest + how many members
 * want a mixer in the same city (real numbers only, never inflated).
 */
export async function GET(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const city = (url.searchParams.get("city") ?? "").trim();

  const [mine] = await db
    .select()
    .from(eventInterests)
    .where(eq(eventInterests.userId, member.id))
    .limit(1);

  let sameCity = 0;
  const targetCity = city || mine?.city || "";
  if (targetCity) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventInterests)
      .where(sql`lower(${eventInterests.city}) = lower(${targetCity})`);
    sameCity = count;
  }

  return Response.json({ interested: Boolean(mine), myCity: mine?.city ?? "", sameCity });
}

/**
 * POST /api/events/interest — register interest in a Freeborn mixer in a city.
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
  const { city } = (body ?? {}) as { city?: string };
  const clean = (city ?? "").trim().slice(0, 80);
  if (clean.length < 2) {
    return Response.json({ error: "Tell us which city." }, { status: 400 });
  }

  await db
    .insert(eventInterests)
    .values({ userId: member.id, city: clean })
    .onConflictDoUpdate({ target: eventInterests.userId, set: { city: clean } });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(eventInterests)
    .where(sql`lower(${eventInterests.city}) = lower(${clean})`);

  return Response.json({ ok: true, sameCity: count });
}
