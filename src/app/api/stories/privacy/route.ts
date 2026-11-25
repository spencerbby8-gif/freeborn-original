import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMember } from "@/lib/app-auth";
import { isUuid } from "@/lib/uuid";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { featureRoute } from "@/lib/member-feature-errors";
export const GET=featureRoute(async(request:Request)=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const result=await db.execute(sql`select audience,selected_ids as "selectedIds" from public.story_preferences where user_id=${me.id}::uuid`);
 return Response.json(result.rows[0]??{audience:'all',selectedIds:[]},{headers:{"Cache-Control":"private, no-store"}});
});
export const POST=featureRoute(async(request:Request)=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const blocked=rejectCrossOrigin(request);if(blocked)return blocked;
 const input=await request.json().catch(()=>null);
 if(!input||!['all','exclude','only'].includes(input.audience)||!Array.isArray(input.selectedIds)||input.selectedIds.length>500||!input.selectedIds.every(isUuid))return Response.json({error:"Choose an audience and valid matches."},{status:400});
 const selected:string[]=[...new Set<string>(input.selectedIds)];
 if(selected.length){const valid=await db.execute(sql`select distinct case when m.user_a=${me.id}::uuid then m.user_b else m.user_a end as id
 from public.matches m where m.status='active' and (m.user_a=${me.id}::uuid or m.user_b=${me.id}::uuid)
 and not exists(select 1 from public.blocked_users b where (b.blocker_id=m.user_a and b.blocked_id=m.user_b) or (b.blocker_id=m.user_b and b.blocked_id=m.user_a))`);
 const ids=new Set(valid.rows.map(r=>r.id));if(selected.some(id=>!ids.has(id)))return Response.json({error:"One of those matches is no longer available. Refresh and try again."},{status:400});}
 await db.execute(sql`insert into public.story_preferences(user_id,audience,selected_ids) values(${me.id}::uuid,${input.audience},${JSON.stringify(selected)}::jsonb)
 on conflict(user_id) do update set audience=excluded.audience,selected_ids=excluded.selected_ids,updated_at=now()`);
 return Response.json({ok:true});
});
