import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { mixerVenues } from "@/db/schema";

/**
 * A mixer may never be announced with a venue name unless an un-withdrawn
 * consent row exists for that city and venue.
 *
 * This is the control Unjected did not have. In 2026 it published a Denver
 * mixer at Recess Beer Garden without the venue's agreement; the venue was
 * harassed into cancelling and Unjected ended up in federal court. Nothing in
 * its stack forced a consent check, because nothing stored consent.
 *
 * Any route or job that publishes a venue name MUST call this first. It throws
 * rather than returning false on purpose: a silent false would let a caller
 * forget to handle it, and the failure mode we are preventing is a published
 * venue name, not a failed function call.
 */
export async function requireVenueConsent(city: string, venueName: string): Promise<void> {
  const rows = await db
    .select({ id: mixerVenues.id })
    .from(mixerVenues)
    .where(
      and(
        eq(mixerVenues.city, city),
        eq(mixerVenues.venueName, venueName),
        isNull(mixerVenues.consentWithdrawnAt)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    throw new Error(
      `No recorded venue consent for "${venueName}" in ${city}. Freeborn does not name a venue in any announcement until that venue has agreed in writing and the agreement is recorded in mixer_venues.`
    );
  }
}

/**
 * True when consent is on file. For read-only surfaces (an operator dashboard)
 * that need to display state without enforcing it.
 */
export async function hasVenueConsent(city: string, venueName: string): Promise<boolean> {
  const rows = await db
    .select({ id: mixerVenues.id })
    .from(mixerVenues)
    .where(
      and(
        eq(mixerVenues.city, city),
        eq(mixerVenues.venueName, venueName),
        isNull(mixerVenues.consentWithdrawnAt)
      )
    )
    .limit(1);
  return rows.length > 0;
}
