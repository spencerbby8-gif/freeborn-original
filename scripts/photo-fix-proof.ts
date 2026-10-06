/**
 * PROOF: photos are never lost even while the Supabase Storage bucket is
 * missing. Simulates the exact production condition:
 *  - anon/sessionless Supabase client => profile_photos returns nothing
 *  - local mirror row exists for the member
 *  - photosForUser must return the mirror photo (src = /uploads/...)
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { accounts, profilePhotos, userProfiles } from "../src/db/schema";
import { photosForUser } from "../src/lib/onboarding-store";

const TEST_UID = "eeeeeeee-1111-4222-8333-444444444444";

async function main() {
  // 1) seed the local mirror exactly as the save fallback writes it
  await db.insert(accounts).values({ id: TEST_UID, email: "mirror-proof@test.local" }).onConflictDoNothing({ target: accounts.id });
  await db.insert(userProfiles).values({ id: TEST_UID, email: "mirror-proof@test.local", discoverable: false }).onConflictDoNothing({ target: userProfiles.id });
  await db.delete(profilePhotos).where(eq(profilePhotos.userId, TEST_UID));
  await db.insert(profilePhotos).values({
    userId: TEST_UID,
    storagePath: "/uploads/mirror-proof.jpg",
    position: 0,
    isPrimary: true,
  });

  // 2) sessionless supabase client — same visibility as a broken/absent bucket
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY!
  , { auth: { persistSession: false } }) as never;

  const photos = await photosForUser(supabase, TEST_UID);

  console.log("photos resolved:", JSON.stringify(photos));
  if (photos.length === 1 && photos[0].src === "/uploads/mirror-proof.jpg" && photos[0].isCover) {
    console.log("PROOF PASS: mirror fallback returns the uploaded photo — onboarding completion gate will see it.");
  } else {
    console.log("PROOF FAIL: mirror fallback did not return the photo.");
    process.exitCode = 1;
  }

  // cleanup
  await db.delete(profilePhotos).where(eq(profilePhotos.userId, TEST_UID));
  await db.delete(userProfiles).where(eq(userProfiles.id, TEST_UID));
  await db.delete(accounts).where(eq(accounts.id, TEST_UID));
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
  console.error("PROOF ERROR:", e);
  process.exit(1);
});
