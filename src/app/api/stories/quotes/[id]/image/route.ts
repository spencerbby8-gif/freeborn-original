import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMember } from "@/lib/app-auth";
import { isUuid } from "@/lib/uuid";
import { featureRoute } from "@/lib/member-feature-errors";
export const GET=featureRoute(async(request:Request,ctx:{params:Promise<{id:string}>})=>{
 const me=await getMember(request);if(!me)return new Response(null,{status:401});
 const {id}=await ctx.params;if(!isUuid(id))return new Response(null,{status:404});
 // Deliberately independent of story expiry/audience: this is the disclosed private copy.
 const result=await db.execute(sql`select q.image_base64 from public.story_quotes q join public.messages msg on msg.id=q.message_id
 join public.matches m on m.id=msg.match_id where q.message_id=${id}::uuid and m.status='active'
 and (m.user_a=${me.id}::uuid or m.user_b=${me.id}::uuid)
 and not exists(select 1 from public.blocked_users b where (b.blocker_id=m.user_a and b.blocked_id=m.user_b) or (b.blocker_id=m.user_b and b.blocked_id=m.user_a))`);
 if(!result.rows.length)return new Response(null,{status:404,headers:{"Cache-Control":"private, no-store"}});
 return new Response(new Uint8Array(Buffer.from(String(result.rows[0].image_base64),'base64')),{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"}});
});
