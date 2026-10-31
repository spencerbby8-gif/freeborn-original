import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { decideMatchAccess, severedMessage, type MatchLifecycleStatus } from "@/lib/match-lifecycle";

/**
 * Start (or reopen) a conversation with another member.
 * In the preview room a conversation implies mutual interest, so if no match
 * exists yet one is created (with a greeting from the other member).
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

  const { with: otherId } = (body ?? {}) as { with?: string };
  if (!otherId) return Response.json({ error: "'with' is required." }, { status: 400 });
  if (otherId === member.id)
    return Response.json({ error: "You can't message yourself." }, { status: 400 });

  const [other] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.id, otherId))
    .limit(1);
  if (!other) return Response.json({ error: "Profile not found." }, { status: 404 });

  /* Their privacy rule: who may start conversations with them. Enforced
     here AND on every message send — truthful, never bypassed. */
  const mp = other.messagePrivacy ?? "everyone";
  if (mp !== "everyone") {
    const [me] = await db
      .select({
        isVerified: userProfiles.isVerified,
        vaccinationStatus: userProfiles.vaccinationStatus,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, member.id))
      .limit(1);
    const allowed =
      mp === "verified" ? me?.isVerified === true : me?.vaccinationStatus === "unvaccinated";
    if (!allowed) {
      const name = other.displayName ?? "This member";
      return Response.json(
        {
          error:
            mp === "verified"
              ? `${name} only accepts messages from verified members.`
              : `${name} only accepts messages from unvaccinated members.`,
          restricted: true,
        },
        { status: 403 }
      );
    }
  }

  const [userA, userB] = [member.id, otherId].sort();
  const existing = await db
    .select()
    .from(matches)
    .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
    .limit(1);

  if (existing.length) {
    /* A severed pair must not be re-openable through the "already matched, here's your thread"
       shortcut — otherwise `status='unmatched'` would be decoration and either member could
       walk back into a conversation the other one ended. */
    const reopen = decideMatchAccess({
      status: existing[0].status as MatchLifecycleStatus,
      isParticipant: true,
      isActor: existing[0].unmatchedBy === member.id,
      hasMessages: false,
      action: "create_or_rematch",
    });
    if (!reopen.allow && reopen.reason !== "deny:already-matched") {
      return Response.json({ error: severedMessage(existing[0].status as MatchLifecycleStatus) }, { status: 409 });
    }
    if (reopen.reason === "deny:already-matched" && existing[0].status !== "active") {
      return Response.json({ error: severedMessage(existing[0].status as MatchLifecycleStatus) }, { status: 409 });
    }
    return Response.json({ matchId: existing[0].id });
  }

  const [match] = await db
    .insert(matches)
    .values({ userA, userB, initiatedBy: member.id, lastMessageAt: new Date() })
    .returning({ id: matches.id });

  // No scripted greeting — the conversation starts empty, honestly.

  return Response.json({ matchId: match.id });
}
