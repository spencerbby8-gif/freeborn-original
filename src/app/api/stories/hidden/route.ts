import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMember } from "@/lib/app-auth";
import { featureRoute } from "@/lib/member-feature-errors";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { storyAudienceSql } from "@/lib/story-access";
import { isUuid } from "@/lib/uuid";

export const dynamic="force-dynamic";

/** A viewer's private feed preference. This does not block or change audience. */
export const GET=featureRoute(async(request:Request)=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const result=await db.execute(sql`select h.author_id as id,h.hidden_at as "hiddenAt",
 case when exists(select 1 from public.matches m where m.status='active' and
 ((m.user_a=h.viewer_id and m.user_b=h.author_id) or (m.user_b=h.viewer_id and m.user_a=h.author_id)))
 and not exists(select 1 from public.blocked_users b where (b.blocker_id=h.viewer_id and b.blocked_id=h.author_id) or (b.blocker_id=h.author_id and b.blocked_id=h.viewer_id))
 then coalesce(u.display_name,'Freeborn member') else null end as name
 from public.hidden_story_authors h join public.user_profiles u on u.id=h.author_id
 where h.viewer_id=${me.id}::uuid order by h.hidden_at desc,h.author_id`);
 return Response.json({hidden:result.rows},{headers:{"Cache-Control":"private, no-store"}});
});

async function input(request:Request){const body=await request.json().catch(()=>null);return isUuid(body?.authorId)?body.authorId:null;}
export const POST=featureRoute(async(request:Request)=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const cross=rejectCrossOrigin(request);if(cross)return cross;
 const authorId=await input(request);if(!authorId||authorId===me.id)return Response.json({error:"Choose another member."},{status:400});
 const success=await db.transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${me.id}::text, ${authorId}::text) || ':' || greatest(${me.id}::text, ${authorId}::text), 0))`);
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('story-privacy:' || ${authorId}::text, 0))`);
 const existing=await tx.execute(sql`select 1 from public.hidden_story_authors where viewer_id=${me.id}::uuid and author_id=${authorId}::uuid`);
 if(existing.rows.length)return true;
 const eligible=await tx.execute(sql`select 1 from public.member_stories s left join public.story_preferences p on p.user_id=s.author_id
 where s.author_id=${authorId}::uuid and s.expires_at>now() and ${storyAudienceSql(me.id)} limit 1`);
 if(!eligible.rows.length)return false;
 await tx.execute(sql`insert into public.hidden_story_authors(viewer_id,author_id) values(${me.id}::uuid,${authorId}::uuid) on conflict do nothing`);
 return true;
 });
 if(!success)return Response.json({error:"That story is no longer available."},{status:404});
 return Response.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
});
export const DELETE=featureRoute(async(request:Request)=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const cross=rejectCrossOrigin(request);if(cross)return cross;
 const authorId=await input(request);if(!authorId||authorId===me.id)return Response.json({error:"Choose another member."},{status:400});
 await db.transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${me.id}::text, ${authorId}::text) || ':' || greatest(${me.id}::text, ${authorId}::text), 0))`);
 await tx.execute(sql`delete from public.hidden_story_authors where viewer_id=${me.id}::uuid and author_id=${authorId}::uuid`);
 });
 return Response.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
});
