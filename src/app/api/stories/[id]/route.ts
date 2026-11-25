import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMember } from "@/lib/app-auth";
import { isUuid } from "@/lib/uuid";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { featureRoute } from "@/lib/member-feature-errors";
export const DELETE=featureRoute(async(request:Request,ctx:{params:Promise<{id:string}>})=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const blocked=rejectCrossOrigin(request);if(blocked)return blocked;
 const {id}=await ctx.params;if(!isUuid(id))return Response.json({error:"Story not found."},{status:404});
 const result=await db.execute(sql`delete from public.member_stories where id=${id}::uuid and author_id=${me.id}::uuid returning id`);
 return result.rows.length?Response.json({ok:true}):Response.json({error:"Story not found."},{status:404});
});
