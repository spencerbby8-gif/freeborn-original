import { randomUUID } from "node:crypto";
import { databaseErrorCode } from "@/lib/member-api-errors";
export function featureRoute<C>(handler:(request:Request,context:C)=>Promise<Response>){
 return async(request:Request,context:C)=>{try{return await handler(request,context);}catch(error){
 const requestId=randomUUID();console.error(JSON.stringify({event:"member-feature-failure",requestId,databaseCode:databaseErrorCode(error)??"unknown"}));
 return Response.json({error:"This feature is temporarily unavailable. Please try again.",requestId},{status:503,headers:{"Cache-Control":"private, no-store"}});
 }};
}
