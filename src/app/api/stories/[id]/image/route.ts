import { getMember } from "@/lib/app-auth";
import { isUuid } from "@/lib/uuid";
import { readableStory } from "@/lib/story-server";
import { featureRoute } from "@/lib/member-feature-errors";
export const dynamic="force-dynamic";
export const GET=featureRoute(async(request:Request,ctx:{params:Promise<{id:string}>})=>{
 const me=await getMember(request);if(!me)return new Response(null,{status:401});
 const {id}=await ctx.params;if(!isUuid(id))return new Response(null,{status:404});
 const story=await readableStory(id,me.id);if(!story)return new Response(null,{status:404,headers:{"Cache-Control":"private, no-store"}});
 const bytes=Buffer.from(story.image_base64,'base64');
 return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"}});
});
