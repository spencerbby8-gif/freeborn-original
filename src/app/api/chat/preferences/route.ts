import { and,eq,or } from "drizzle-orm";
import { db } from "@/db";
import { matches,conversationPreferences } from "@/db/schema";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { featureRoute } from "@/lib/member-feature-errors";
import { isUuid } from "@/lib/uuid";
export const POST=featureRoute(async(request:Request)=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const blocked=rejectCrossOrigin(request);if(blocked)return blocked;
 const body=await request.json().catch(()=>null);
 if(!body||!isUuid(body.matchId)||!['nickname','archived','hidden','pinned'].includes(body.setting))return Response.json({error:"Choose a conversation and setting."},{status:400});
 const [match]=await db.select({id:matches.id}).from(matches).where(and(eq(matches.id,body.matchId),or(eq(matches.userA,me.id),eq(matches.userB,me.id)))).limit(1);
 if(!match)return Response.json({error:"Conversation not found."},{status:404});
 const setting=body.setting as 'nickname'|'archived'|'hidden'|'pinned';
 let value: string|null|boolean;
 if(setting==='nickname'){
 if(typeof body.value!=='string'||body.value.trim().length>40)return Response.json({error:"Use a nickname of at most 40 characters."},{status:400});
 value=body.value.trim()||null;
 }else{if(typeof body.value!=='boolean')return Response.json({error:"Use an on or off value."},{status:400});value=body.value;}
 const change={ [setting]:value,updatedAt:new Date() };
 await db.insert(conversationPreferences).values({userId:me.id,matchId:body.matchId,...change}).onConflictDoUpdate({target:[conversationPreferences.userId,conversationPreferences.matchId],set:change});
 return Response.json({ok:true});
});
