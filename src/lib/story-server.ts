import { sql } from "drizzle-orm";
import { db } from "@/db";
import { storyAudienceSql } from "@/lib/story-access";
export async function readableStory(storyId:string,viewerId:string){
 const result=await db.execute(sql`select s.id,s.author_id,s.caption,s.image_base64,s.created_at,s.expires_at
 from public.member_stories s left join public.story_preferences p on p.user_id=s.author_id
 where s.id=${storyId}::uuid and s.expires_at>now() and ${storyAudienceSql(viewerId)} limit 1`);
 return result.rows[0] as {id:string;author_id:string;caption:string;image_base64:string;created_at:Date;expires_at:Date}|undefined;
}
