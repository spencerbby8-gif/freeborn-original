import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, userProfiles } from "@/db/schema";
import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";

export type Member = {
  id: string;
  email: string;
  name: string;
};

/**
 * Resolves the signed-in Supabase member from the request's Bearer token and
 * guarantees a local mirror profile exists (FK anchor for the preview room's
 * swipes, matches, and messages).
 */
export async function getMember(request: Request): Promise<Member | null> {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const member: Member = {
    id: user.id,
    email: user.email,
    name:
      (user.user_metadata?.full_name as string) ||
      user.email.split("@")[0].replace(/[._-]+/g, " "),
  };

  await db
    .insert(accounts)
    .values({ id: member.id, email: member.email })
    .onConflictDoNothing({ target: accounts.id });
  await db
    .insert(userProfiles)
    .values({ id: member.id, email: member.email, discoverable: false })
    .onConflictDoNothing({ target: userProfiles.id });

  // Prefer the Freeborn display name when the member set one in onboarding.
  try {
    const { data } = await supabase
      .from("user_profiles")
      .select("display_name")
      .eq("id", member.id)
      .maybeSingle();
    const dn = (data as { display_name?: string } | null)?.display_name;
    if (dn) member.name = dn;
  } catch {
    // name stays the fallback
  }

  return member;
}

export async function getLocalProfile(profileId: string) {
  const [row] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.id, profileId))
    .limit(1);
  return row ?? null;
}
