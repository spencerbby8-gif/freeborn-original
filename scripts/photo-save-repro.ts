/**
 * REPRO: drives the exact server-side photo save path (applyStepPatch with a
 * photos patch) using a sessionless Supabase client — the same Supabase
 * visibility as production while the storage bucket is missing. Prints the
 * real error if anything throws.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { accounts, profilePhotos, userProfiles } from "../src/db/schema";
import { applyStepPatch } from "../src/lib/onboarding-store";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const TEST_UID = "dddddddd-1111-4222-8333-555555555555";

// tiny valid JPEG (1x1) as the browser canvas would produce
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

async function main() {
  // clean slate for the test user
  await db.delete(profilePhotos).where(eq(profilePhotos.userId, TEST_UID));
  await db.delete(userProfiles).where(eq(userProfiles.id, TEST_UID));
  await db.delete(accounts).where(eq(accounts.id, TEST_UID));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  ) as never;

  try {
    const next = await applyStepPatch(
      TEST_UID,
      "photo-repro@test.local",
      "photos",
      { photos: [{ id: "repro-shot-1", src: TINY_JPEG, isCover: true }] },
      supabase
    );
    console.log("applyStepPatch OK -> next step:", next);
  } catch (err) {
    console.log("REPRO CAUGHT THE BUG:", err);
  }

  const rows = await db.select().from(profilePhotos).where(eq(profilePhotos.userId, TEST_UID));
  console.log("local mirror rows:", rows.map((r) => ({ path: r.storagePath, pos: r.position, cover: r.isPrimary })));

  const uploadsDir = join(process.cwd(), "public", "uploads");
  try {
    await mkdir(uploadsDir, { recursive: true });
    const files = await readdir(uploadsDir);
    console.log("files in public/uploads:", files.filter((f) => f.includes("repro-shot-1")));
  } catch (e) {
    console.log("uploads dir read failed:", e);
  }

  // cleanup
  await db.delete(profilePhotos).where(eq(profilePhotos.userId, TEST_UID));
  await db.delete(userProfiles).where(eq(userProfiles.id, TEST_UID));
  await db.delete(accounts).where(eq(accounts.id, TEST_UID));
}

main().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
