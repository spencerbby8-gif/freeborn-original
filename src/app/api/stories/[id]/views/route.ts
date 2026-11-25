import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMember } from "@/lib/app-auth";
import { isUuid } from "@/lib/uuid";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { readableStory } from "@/lib/story-server";
import { featureRoute } from "@/lib/member-feature-errors";
import { storyAudienceSql } from "@/lib/story-access";
export const GET=featureRoute(async(request:Request,ctx:{params:Promise<{id:string}>})=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const {id}=await ctx.params;if(!isUuid(id))return Response.json({error:"Story not found."},{status:404});
 const own=await readableStory(id,me.id);if(!own||own.author_id!==me.id)return Response.json({error:"Story not found."},{status:404});
 const result=await db.execute(sql`select v.viewer_id as id,u.display_name as name,v.viewed_at as "viewedAt"
 from public.story_views v join public.user_profiles u on u.id=v.viewer_id where v.story_id=${id}::uuid and not exists(select 1 from public.blocked_users b where (b.blocker_id=${me.id}::uuid and b.blocked_id=v.viewer_id) or (b.blocked_id=${me.id}::uuid and b.blocker_id=v.viewer_id)) order by v.viewed_at desc`);
 return Response.json({viewers:result.rows},{headers:{"Cache-Control":"private, no-store"}});
});
export const POST=featureRoute(async(request:Request,ctx:{params:Promise<{id:string}>})=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const blocked=rejectCrossOrigin(request);if(blocked)return blocked;
 const {id}=await ctx.params;if(!isUuid(id))return Response.json({error:"Story not found."},{status:404});
 // Taking the pair and author-audience locks before the INSERT prevents a
 // view receipt from crossing a concurrent block or privacy change.
 const result=await db.transaction(async tx=>{
 const identity=await tx.execute(sql`select author_id from public.member_stories where id=${id}::uuid`);
 const authorId=identity.rows[0]?.author_id;
 if(typeof authorId!=="string" || authorId===me.id)return false;
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(least(${me.id}::text, ${authorId}::text) || ':' || greatest(${me.id}::text, ${authorId}::text), 0))`);
 await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('story-privacy:' || ${authorId}::text, 0))`);
 const inserted=await tx.execute(sql`insert into public.story_views(story_id,viewer_id)
 select s.id,${me.id}::uuid from public.member_stories s left join public.story_preferences p on p.user_id=s.author_id
 where s.id=${id}::uuid and s.author_id=${authorId}::uuid and s.author_id<>${me.id}::uuid and s.expires_at>now() and ${storyAudienceSql(me.id)}
 on conflict(story_id,viewer_id) do update set viewed_at=story_views.viewed_at returning story_id`);
 return inserted.rows.length>0;
 });
 if(!result)return Response.json({error:"Story not available."},{status:404});
 return Response.json({ok:true});
});
