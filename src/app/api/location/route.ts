import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPrivateLocations } from "@/db/schema";
import { getMember } from "@/lib/app-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/location — stores the member's consented browser position so
 * distances between members are computed from real, fresh coordinates.
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

  const { lat, lng, accuracyM } = (body ?? {}) as {
    lat?: number;
    lng?: number;
    accuracyM?: number;
  };

  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return Response.json({ error: "Valid coordinates are required." }, { status: 400 });
  }

  const accuracy =
    typeof accuracyM === "number" && Number.isFinite(accuracyM) && accuracyM >= 0 && accuracyM <= 100000
      ? accuracyM
      : null;

  await db
    .insert(userPrivateLocations)
    .values({
      userId: member.id,
      latitude: lat,
      longitude: lng,
      accuracyM: accuracy,
      source: "browser",
    })
    .onConflictDoUpdate({
      target: userPrivateLocations.userId,
      set: {
        latitude: lat,
        longitude: lng,
        accuracyM: accuracy,
        source: "browser",
        updatedAt: new Date(),
      },
    });

  return Response.json({ ok: true });
}
