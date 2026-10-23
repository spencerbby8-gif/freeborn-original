import { eq } from "drizzle-orm";
import { db } from "@/db";
import { securityEvents, userPrivateLocations } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { checkIpReputation, clientIp } from "@/lib/ip-reputation";

export const dynamic = "force-dynamic";

/** Haversine, km. */
function distKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * POST /api/location — saves the member's consented position AFTER running
 * the anti-spoofing gauntlet:
 *   1. impossible coordinates / suspiciously perfect accuracy → rejected
 *   2. teleport vs the previously saved fix (> 900 km/h) → rejected
 *   3. GPS vs IP-location cross-check (> 1,500 km apart) → rejected + logged
 * The web can't read Android's mock-location flag, so physics + IP
 * cross-verification is the strongest honest defense a browser allows.
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

  const email = member.email.toLowerCase();
  const ip = clientIp(request);
  const logSpoof = (detail: string) =>
    db.insert(securityEvents).values({ email, ip, kind: "gps-spoof-suspect", detail });

  /* 1. Null-island & too-perfect accuracy (spoofers love exact values). */
  if (lat === 0 && lng === 0) {
    await logSpoof("null-island fix rejected");
    return Response.json({ error: "That location can't be right. Try again outdoors." }, { status: 400 });
  }
  if (typeof accuracyM === "number" && accuracyM >= 0 && accuracyM < 4) {
    await logSpoof(`impossibly precise accuracy ${accuracyM}m`);
    return Response.json(
      { error: "That GPS reading looks artificial. Move to an open area and retry." },
      { status: 400 }
    );
  }

  /* 1b. Rate limit: real people don't refix every few seconds. */
  const [latestEvent] = await db
    .select({ createdAt: securityEvents.createdAt })
    .from(securityEvents)
    .where(eq(securityEvents.email, member.email.toLowerCase()))
    .limit(1);
  void latestEvent;
  const [prevFix] = await db
    .select({ updatedAt: userPrivateLocations.updatedAt })
    .from(userPrivateLocations)
    .where(eq(userPrivateLocations.userId, member.id))
    .limit(1);
  if (prevFix?.updatedAt && Date.now() - prevFix.updatedAt.getTime() < 5 * 60 * 1000) {
    return Response.json(
      { error: "Location already updated recently. Try again in a few minutes." },
      { status: 429 }
    );
  }

  /* 2. Teleport check vs the last saved fix (+ constant-accuracy mock
        signature: spoofers emit the exact same accuracy every time). */
  const [prev] = await db
    .select()
    .from(userPrivateLocations)
    .where(eq(userPrivateLocations.userId, member.id))
    .limit(1);
  if (
    prev?.accuracyM != null &&
    typeof accuracyM === "number" &&
    accuracyM > 0 &&
    Math.abs(prev.accuracyM - accuracyM) < 0.001 &&
    distKm(prev.latitude ?? 0, prev.longitude ?? 0, lat, lng) > 0.5
  ) {
    await logSpoof(`identical accuracy ${accuracyM}m at a new position — mock signature`);
    return Response.json(
      { error: "That GPS reading doesn't look genuine. Location not saved." },
      { status: 400 }
    );
  }
  if (prev?.latitude != null && prev?.longitude != null) {
    const moved = distKm(prev.latitude, prev.longitude, lat, lng);
    const hoursSince = prev.updatedAt ? (Date.now() - prev.updatedAt.getTime()) / 3_600_000 : 999;
    if (hoursSince < 24 && moved > Math.max(50, 900 * hoursSince)) {
      await logSpoof(`teleport ${Math.round(moved)}km in ${hoursSince.toFixed(1)}h`);
      return Response.json(
        { error: "That jump is physically impossible. Location not updated." },
        { status: 400 }
      );
    }
  }

  /* 3. GPS vs IP country cross-check. */
  const rep = await checkIpReputation(ip);
  if (rep.latitude != null && rep.longitude != null) {
    const ipDistance = distKm(rep.latitude, rep.longitude, lat, lng);
    if (ipDistance > 1500) {
      await logSpoof(`GPS is ${Math.round(ipDistance)}km from IP location (${rep.country ?? "?"})`);
      return Response.json(
        { error: "Your GPS doesn't match your network location. Location not saved." },
        { status: 400 }
      );
    }
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
