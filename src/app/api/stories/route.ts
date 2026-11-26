import sharp from "sharp";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { featureRoute } from "@/lib/member-feature-errors";
import { storyAudienceSql,STORY_INPUT_LIMIT,STORY_OUTPUT_LIMIT } from "@/lib/story-access";
import { resolvePhotoUrl } from "@/lib/photo-url";
export const dynamic="force-dynamic";
export const GET=featureRoute(async(request:Request)=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const result=await db.execute(sql`select s.id,s.author_id as "authorId",u.display_name as name,s.caption,s.created_at as "createdAt",s.expires_at as "expiresAt",
 (select ph.storage_path from public.profile_photos ph where ph.user_id=s.author_id order by ph.is_primary desc,ph.position limit 1) as photo,
 exists(select 1 from public.story_views v where v.story_id=s.id and v.viewer_id=${me.id}::uuid) as viewed,
 case when s.author_id=${me.id}::uuid then (select count(*)::int from public.story_views v where v.story_id=s.id) else null end as "viewerCount"
 from public.member_stories s join public.user_profiles u on u.id=s.author_id
 left join public.story_preferences p on p.user_id=s.author_id
 where s.expires_at>now() and ${storyAudienceSql(me.id)}
 and not exists(select 1 from public.hidden_story_authors h where h.viewer_id=${me.id}::uuid and h.author_id=s.author_id)
 order by s.created_at asc limit 1000`);
 return Response.json({memberId:me.id,stories:result.rows.map(row=>({...row,name:row.name||"Freeborn member",photo:resolvePhotoUrl(row.photo as string),imageUrl:`/api/stories/${row.id}/image`}))},{headers:{"Cache-Control":"private, no-store"}});
});
export const POST=featureRoute(async(request:Request)=>{
 const me=await getMember(request);if(!me)return Response.json({error:"Not signed in."},{status:401});
 const blocked=rejectCrossOrigin(request);if(blocked)return blocked;
 if(Number(request.headers.get("content-length")??0)>STORY_INPUT_LIMIT+65536)return Response.json({error:"Choose a picture smaller than 4 MB."},{status:413});
 let form:FormData;try{form=await request.formData();}catch{return Response.json({error:"Choose a story picture."},{status:400});}
 const file=form.get("file"),caption=String(form.get("caption")??"").trim();
 if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>STORY_INPUT_LIMIT||!file.size||caption.length>280||form.get("acknowledgeRetention")!=="true")
 return Response.json({error:"Use a JPG, PNG or WebP under 4 MB, a caption under 280 characters, and acknowledge reply-image retention."},{status:400});
 let data:Buffer;try{data=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:24_000_000,animated:false}).rotate().resize({width:1440,height:1920,fit:"inside",withoutEnlargement:true}).jpeg({quality:82}).toBuffer();}catch{return Response.json({error:"We couldn’t read that picture. Try another JPG, PNG or WebP."},{status:400});}
 if(data.length>STORY_OUTPUT_LIMIT)return Response.json({error:"That picture is too detailed. Please use a smaller one."},{status:413});
 const saved=await db.transaction(async tx=>{
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${me.id}))`);
 const count=await tx.execute(sql`select count(*)::int as n from public.story_upload_receipts where user_id=${me.id}::uuid and created_at>now()-interval '24 hours'`);
 if(Number(count.rows[0].n)>=20)return null;
 const result=await tx.execute(sql`insert into public.member_stories(author_id,caption,image_base64) values(${me.id}::uuid,${caption},${data.toString('base64')}) returning id,expires_at`);
 await tx.execute(sql`insert into public.story_upload_receipts(user_id) values(${me.id}::uuid)`);
 return result.rows[0];});
 if(!saved)return Response.json({error:"You can share up to 20 pictures in 24 hours. Try again later."},{status:429});
 return Response.json({ok:true,story:saved},{status:201,headers:{"Cache-Control":"private, no-store"}});
});
