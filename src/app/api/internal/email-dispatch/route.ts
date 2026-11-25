import { workerAuthorized } from "@/lib/member-email";
import { dispatchMemberEmails } from "@/lib/member-notifications";
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
 if(!workerAuthorized(request))return Response.json({error:'Not authorized.'},{status:401});
 try{const result=await dispatchMemberEmails(5);return Response.json(result,{status:result.configured?200:503,headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Email dispatch unavailable.'},{status:503});}
}
// A Vercel/scheduler cron uses a secret bearer token; no user content returned.
export const GET=POST;
