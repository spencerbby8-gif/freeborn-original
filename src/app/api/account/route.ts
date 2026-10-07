import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { createSupabaseClientForApi } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/account — account security actions:
 *  - change-password (min 8 chars, enforced by Supabase Auth)
 *  - change-email (sends confirmation to the new address)
 *  - deactivate (hides the profile from the room immediately)
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { action, newPassword, newEmail } = (body ?? {}) as {
    action?: string;
    newPassword?: string;
    newEmail?: string;
  };

  if (action === "change-password") {
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return Response.json(
        { error: "New password must be at least 8 characters." },
        { status: 400 }
      );
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, message: "Password updated." });
  }

  if (action === "change-email") {
    if (typeof newEmail !== "string" || !EMAIL_RE.test(newEmail)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({
      ok: true,
      message: "Confirmation sent — check the new inbox to finish the change.",
    });
  }

  if (action === "deactivate") {
    await db
      .update(userProfiles)
      .set({ discoverable: false, profileStatus: "hidden" })
      .where(eq(userProfiles.id, user.id));
    return Response.json({
      ok: true,
      message: "Your profile is now hidden from the room.",
    });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
