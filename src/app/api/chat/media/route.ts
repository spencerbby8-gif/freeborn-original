import { CHAT_FILE_TYPES, CHAT_FILE_MAX, chatFileMime, validChatFileBytes } from "@/lib/chat-file";
import { decideMatchAccess, type MatchLifecycleStatus } from "@/lib/match-lifecycle";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockedUsers, chatMedia, matches, userProfiles } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { isBlockedPair } from "@/lib/conversation-access";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* Strict per-kind whitelists and caps — keeps the store safe and fast. */
const RULES: Record<string, { mimes: Set<string>; maxBytes: number }> = {
  file: { mimes: new Set(Object.values(CHAT_FILE_TYPES)), maxBytes: CHAT_FILE_MAX },
  image: {
    mimes: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
    maxBytes: 8 * 1024 * 1024,
  },
  video: {
    mimes: new Set(["video/mp4", "video/webm", "video/quicktime"]),
    maxBytes: 20 * 1024 * 1024,
  },
  voice: {
    mimes: new Set([
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/x-m4a",
      "audio/webm;codecs=opus",
    ]),
    maxBytes: 8 * 1024 * 1024,
  },
};

const submitLog = new Map<string, number[]>();

function rateLimited(accountId: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (submitLog.get(accountId) ?? []).filter((t) => now - t < windowMs);
  submitLog.set(accountId, hits);
  if (hits.length >= max) return true;
  hits.push(now);
  return false;
}

/**
 * POST /api/chat/media — multipart upload (voice note / photo / video).
 * Multipart instead of base64 JSON: ~35% smaller payloads and no body-bloat
 * failures, which is what was killing voice and video delivery.
 */
export async function POST(request: Request) {
  const member = await getMember(request);
  if (!member) return Response.json({ error: "Not signed in." }, { status: 401 });
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "A multipart upload is required." }, { status: 400 });
  }

  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  const rule = RULES[kind];
  if (!(file instanceof File) || !rule) {
    return Response.json({ error: "A valid file and kind are required." }, { status: 400 });
  }

  /* The conversation this attachment belongs to. Storing it is what makes
     GET /api/chat/media/:id authorisable — without a match link there is no
     way to prove the fetcher is a participant, which is why that route was
     previously wide open. Uploading into someone else's conversation is not a
     thing a member should be able to do either. */
  const matchId = String(form.get("match") ?? "");
  if (!isUuid(matchId)) {
    return Response.json({ error: "match is required." }, { status: 400 });
  }
  const [match] = await db
    .select({ id: matches.id, userA: matches.userA, userB: matches.userB, status: matches.status, unmatchedBy: matches.unmatchedBy })
    .from(matches)
    .where(
      and(
        eq(matches.id, matchId),
        or(eq(matches.userA, member.id), eq(matches.userB, member.id)),
      ),
    )
    .limit(1);
  if (!match) {
    return Response.json({ error: "Match not found." }, { status: 404 });
  }
  if (!decideMatchAccess({status:match.status as MatchLifecycleStatus,isParticipant:true,isActor:match.unmatchedBy===member.id,hasMessages:false,action:"send_message"}).allow) return Response.json({error:"This conversation is read-only."},{status:403});
  const otherId = match.userA === member.id ? match.userB : match.userA;
  if (await isBlockedPair(member.id, otherId)) {
    return Response.json({ error: "This conversation isn't available." }, { status: 403 });
  }

  const mime = kind === "file" ? chatFileMime(file.name) ?? "" : (file.type || "").split(";")[0];
  if (!rule.mimes.has(mime) && !rule.mimes.has(file.type)) {
    return Response.json({ error: `Unsupported ${kind} format (${file.type || "unknown"}).` }, { status: 400 });
  }
  if (file.size > rule.maxBytes) {
    return Response.json(
      { error: `${kind === "voice" ? "Voice note" : "File"} too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB).` },
      { status: 400 }
    );
  }
  if (rateLimited(member.id, 200, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many uploads. Please try again later." }, { status: 429 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (kind === "file" && !validChatFileBytes(mime, bytes)) return Response.json({error:"That document format could not be verified. Choose a PDF, UTF-8 text/CSV, or Office document."},{status:400});
  const outcome = await db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${member.id}::text, ${otherId}::text) || ':' || greatest(${member.id}::text, ${otherId}::text), 0))`);
    const [live]=await tx.select().from(matches).where(eq(matches.id,matchId)).for('update');
    if(!live||(live.userA!==member.id&&live.userB!==member.id))return {error:'missing' as const};
    if(!decideMatchAccess({status:live.status as MatchLifecycleStatus,isParticipant:true,isActor:live.unmatchedBy===member.id,hasMessages:false,action:'send_message'}).allow)return {error:'closed' as const};
    const [block]=await tx.select({id:blockedUsers.id}).from(blockedUsers).where(or(
      and(eq(blockedUsers.blockerId,member.id),eq(blockedUsers.blockedId,otherId)),
      and(eq(blockedUsers.blockerId,otherId),eq(blockedUsers.blockedId,member.id))
    )).limit(1);
    if(block)return {error:'closed' as const};
    const [recipient]=await tx.select({name:userProfiles.displayName,privacy:userProfiles.messagePrivacy}).from(userProfiles).where(eq(userProfiles.id,otherId)).for('share');
    const [sender]=await tx.select({verified:userProfiles.isVerified,vaccination:userProfiles.vaccinationStatus}).from(userProfiles).where(eq(userProfiles.id,member.id)).for('share');
    const privacy=recipient?.privacy??'everyone';
    if(privacy!=='everyone'&&!(privacy==='verified'?sender?.verified===true:sender?.vaccination==='unvaccinated'))return {error:'restricted' as const,privacy,name:recipient?.name??'This member'};
    const [row]=await tx.insert(chatMedia).values({senderId:member.id,matchId,kind,mime,data:bytes}).returning({id:chatMedia.id});
    return {id:row.id};
  });
  if(outcome.error==='missing')return Response.json({error:'Match not found.'},{status:404});
  if(outcome.error==='closed')return Response.json({error:"This conversation isn't available."},{status:403});
  if(outcome.error==='restricted')return Response.json({error:outcome.privacy==='verified'?`${outcome.name} only accepts messages from verified members.`:`${outcome.name} only accepts messages from unvaccinated members.`,restricted:true},{status:403});
  return Response.json({ ok: true, id: outcome.id, kind });
}
