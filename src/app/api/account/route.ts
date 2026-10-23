import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, userProfiles } from "@/db/schema";
import {
  createSessionlessSupabaseClient,
  createSupabaseClientForApi,
} from "@/lib/supabase/api-auth";
import { MIN_PASSWORD_LENGTH, passwordTooShort } from "@/lib/password";
import { rejectCrossOrigin } from "@/lib/request-guard";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/account — account facts for the Account tab: email, when the
 * account was created, and how many active sign-ins (refresh tokens) exist.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: "Not signed in." }, { status: 401 });
  /* CSRF: this POST can deactivate or PERMANENTLY DELETE the account,
     including auth.users. rejectCrossOrigin() no-ops on the GET above. */
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const [account] = await db
    .select({ createdAt: accounts.createdAt })
    .from(accounts)
    .where(eq(accounts.id, user.id))
    .limit(1);

  const signIns = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from auth.refresh_tokens where user_id = ${user.id}::uuid and revoked is not true`
  );

  return Response.json({
    email: user.email,
    createdAt: account?.createdAt ?? null,
    activeSignIns: signIns.rows[0]?.n ?? 0,
  });
}

/**
 * POST /api/account — account security actions:
 *  - change-password (requires the CURRENT password; minimum length from
 *    MIN_PASSWORD_LENGTH, enforced here and in Supabase Auth alike)
 *  - change-email (sends confirmation to the new address)
 *  - deactivate (hides the profile from the room immediately — reversible)
 *  - delete (permanent — removes the member's data and auth account)
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseClientForApi(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return Response.json({ error: "Not signed in." }, { status: 401 });
  /* CSRF: this POST can deactivate or PERMANENTLY DELETE the account,
     including auth.users. rejectCrossOrigin() no-ops on the GET above. */
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { action, currentPassword, newPassword, newEmail } = (body ?? {}) as {
    action?: string;
    currentPassword?: string;
    newPassword?: string;
    newEmail?: string;
  };

  if (action === "change-password") {
    if (passwordTooShort(newPassword)) {
      return Response.json(
        { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    /* B5. This route used to accept no current password at all, and Supabase's
       own re-authentication switch
       (security_update_password_require_current_password) was off. Together
       that meant a stolen session, or simply an unattended logged-in device,
       could quietly replace the account password and convert a hijacked session
       into a permanent hijack the real owner could no longer reverse. Terms
       clause 3 promised the opposite of what the code did.

       The credential is now verified here, and the Supabase switch is turned on
       as well so the rule also holds for any other caller of updateUser. */
    if (typeof currentPassword !== "string" || currentPassword.length === 0) {
      return Response.json(
        { error: "Enter your current password to change it." },
        { status: 400 }
      );
    }

    const checker = createSessionlessSupabaseClient();
    const { error: credentialError } = await checker.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (credentialError) {
      /* 403, not 500, and a generic message. The old code returned
         `error.message` verbatim with a 500 status, which leaked provider
         internals and told a member their own mistyped password was a server
         failure. */
      return Response.json(
        { error: "That current password is not correct." },
        { status: 403 }
      );
    }
    /* signInWithPassword minted a real refresh token server-side even though
       this client does not persist a session. Left alone it would inflate the
       "active sign-ins" count this same route reports from auth.refresh_tokens,
       so every password change would look like a new device. */
    await checker.auth.signOut().catch(() => undefined);

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return Response.json(
        { error: "We could not change your password. Please try again." },
        { status: 502 }
      );
    }
    return Response.json({ ok: true, message: "Password updated." });
  }

  if (action === "change-email") {
    if (typeof newEmail !== "string" || !EMAIL_RE.test(newEmail)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) {
      return Response.json(
        { error: "We could not start that email change. Please try again." },
        { status: 502 }
      );
    }
    return Response.json({
      ok: true,
      message: "Confirmation sent. Check the new inbox to finish the change.",
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

  if (action === "delete") {
    /* Permanent deletion — distinct from deactivate (which is reversible).
       Children first, then the profile, the account mirror, and finally the
       auth rows. The member's session is invalidated by removing refresh
       tokens; the client signs out on success. All queries parameterized. */
    const id = user.id;
    const email = user.email;
    const del = (q: ReturnType<typeof sql>) => db.execute(q);
    await del(sql`delete from public.verification_audit_logs where user_id = ${id}`);
    await del(sql`delete from public.profile_photos where user_id = ${id}`);
    await del(sql`delete from public.event_interests where user_id = ${id}`);
    await del(sql`delete from public.user_private_settings where user_id = ${id}`);
    await del(sql`delete from public.notification_preferences where user_id = ${id}`);
    await del(sql`delete from public.user_private_locations where user_id = ${id}`);
    await del(sql`delete from public.discovery_preferences where user_id = ${id}`);
    await del(sql`delete from public.user_trust_history where user_id = ${id}`);
    await del(sql`delete from public.verification_rate_limits where user_id = ${id}`);
    await del(sql`delete from public.verification_selfie_checks where user_id = ${id}`);
    await del(sql`delete from public.verification_challenges where user_id = ${id}`);
    await del(sql`delete from public.support_requests where account_id = ${id}`);
    await del(sql`delete from public.verification_requests where account_id = ${id}`);
    await del(sql`delete from public.sessions where account_id = ${id}`);
    await del(sql`delete from public.user_swipes where liker_id = ${id} or liked_id = ${id}`);
    await del(sql`delete from public.user_matches where user_a = ${id} or user_b = ${id}`);
    await del(sql`delete from public.blocked_users where blocker_id = ${id} or blocked_id = ${id}`);
    await del(sql`delete from public.reports where subject_id = ${id} or reporter_id = ${id}`);
    await del(sql`delete from public.warnings where email = ${email}`);
    await del(sql`delete from public.appeals where email = ${email}`);
    await del(sql`delete from public.suspensions where email = ${email}`);
    await del(sql`delete from public.security_events where email = ${email}`);
    await del(sql`delete from public.chat_media where sender_id = ${id}`);
    await del(sql`delete from public.message_reactions where message_id in (select id from public.messages where match_id in (select id from public.matches where user_a = ${id} or user_b = ${id}))`);
    await del(sql`delete from public.messages where match_id in (select id from public.matches where user_a = ${id} or user_b = ${id})`);
    await del(sql`delete from public.matches where user_a = ${id} or user_b = ${id}`);
    await del(sql`delete from public.user_profiles where id = ${id}`);
    await del(sql`delete from public.accounts where id = ${id}`);
    await del(sql`delete from auth.refresh_tokens where user_id = ${id}::uuid`);
    await del(sql`delete from auth.identities where user_id = ${id}::uuid`);
    await del(sql`delete from auth.users where id = ${id}::uuid`);
    return Response.json({
      ok: true,
      message: "Your account and data have been permanently deleted.",
    });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
