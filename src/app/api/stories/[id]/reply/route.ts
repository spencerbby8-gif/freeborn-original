import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMember } from "@/lib/app-auth";
import { isUuid } from "@/lib/uuid";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { featureRoute } from "@/lib/member-feature-errors";
import { storyAudienceSql } from "@/lib/story-access";
import { scoreScamMessage } from "@/lib/scam-guard";
import { scheduleChatNotice } from "@/lib/chat-notify";
export const POST=featureRoute(async(request:Request,ctx:{params:Promise<{id:string}>})=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const blocked=rejectCrossOrigin(request);if(blocked)return blocked;
 const {id}=await ctx.params;const body=await request.json().catch(()=>null);
 if(!isUuid(id)||!body||typeof body.text!=='string'||!body.text.trim()||body.text.trim().length>2000||!isUuid(body.clientId))return Response.json({error:"Write a reply under 2000 characters."},{status:400});
 const text=body.text.trim();
 const result=await db.transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${me.id}))`);
 // Lost responses can be retried without duplicating a private message or image copy.
 const prior=await tx.execute(sql`select q.message_id as "messageId",m.match_id as "matchId" from public.story_quotes q join public.messages m on m.id=q.message_id
 where q.sender_id=${me.id}::uuid and q.client_id=${body.clientId}::uuid`);
 if(prior.rows.length)return {code:200,data:prior.rows[0]};
 // The first lookup is only for finding the author and taking the correct
 // pair lock. All authorization is evaluated again AFTER acquiring it.
 const identity=await tx.execute(sql`select author_id from public.member_stories where id=${id}::uuid`);
 const authorId=identity.rows[0]?.author_id;
 if(typeof authorId!=="string" || authorId===me.id)return {code:404,data:{error:"This story is no longer available."}};
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${me.id}::text, ${authorId}::text) || ':' || greatest(${me.id}::text, ${authorId}::text), 0))`);
 // Serializes audience changes even when the preferences row doesn't yet exist.
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('story-privacy:' || ${authorId}::text, 0))`);
 const story=await tx.execute(sql`select s.* from public.member_stories s left join public.story_preferences p on p.user_id=s.author_id
 where s.id=${id}::uuid and s.author_id=${authorId}::uuid and s.author_id<>${me.id}::uuid and s.expires_at>now() and ${storyAudienceSql(me.id)} for share of s`);
 const row=story.rows[0];if(!row)return {code:404,data:{error:"This story is no longer available."}};
 const active=await tx.execute(sql`select m.id from public.matches m join public.user_profiles u on u.id=${row.author_id}::uuid
 join public.user_profiles viewer on viewer.id=${me.id}::uuid
 where m.status='active' and ((m.user_a=${me.id}::uuid and m.user_b=u.id) or (m.user_b=${me.id}::uuid and m.user_a=u.id))
 and not exists(select 1 from public.blocked_users b where (b.blocker_id=m.user_a and b.blocked_id=m.user_b) or (b.blocker_id=m.user_b and b.blocked_id=m.user_a))
 and (coalesce(u.message_privacy,'everyone')='everyone' or (u.message_privacy='verified' and viewer.is_verified=true) or (u.message_privacy='unvaccinated' and viewer.vaccination_status='unvaccinated')) for update of m for share of u, viewer`);
 const matchId=active.rows[0]?.id;if(!matchId)return {code:403,data:{error:"This conversation cannot receive your reply."}};
 const count=await tx.execute(sql`select count(*)::int as n from public.messages where sender_id=${me.id}::uuid and created_at>now()-interval '1 minute'`);
 if(Number(count.rows[0].n)>=20)return {code:429,data:{error:"Please wait a moment before replying again."}};
 const scam=scoreScamMessage(text,0);
 const message=await tx.execute(sql`insert into public.messages(match_id,sender_id,body,flagged) values(${matchId}::uuid,${me.id}::uuid,${text},${scam.shouldWarn}) returning id`);
 const messageId=message.rows[0].id;
 await tx.execute(sql`insert into public.story_quotes(message_id,story_id,author_id,image_base64,sender_id,client_id,caption)
 values(${messageId}::uuid,${id}::uuid,${row.author_id}::uuid,${row.image_base64},${me.id}::uuid,${body.clientId}::uuid,${row.caption})`);
 await tx.execute(sql`update public.matches set last_message_at=now() where id=${matchId}::uuid`);
 await tx.execute(sql`insert into public.chat_signals(match_id,kind) values(${matchId}::uuid,'message')`);
 return {code:201,data:{matchId,messageId}};
 });
 if(result.code<300&&'matchId' in result.data)scheduleChatNotice(request,String(result.data.matchId),'message');
 return Response.json(result.data,{status:result.code,headers:{"Cache-Control":"private, no-store"}});
});
