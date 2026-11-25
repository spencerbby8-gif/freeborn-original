import { Webhook } from "svix";
import { sql } from "drizzle-orm";
import { db } from "@/db";
export const dynamic='force-dynamic';
/** Svix verifies the raw bytes and timestamp. Do not log recipient data/body. */
export async function POST(request:Request){
 const secret=process.env.RESEND_WEBHOOK_SECRET;if(!secret)return Response.json({error:'Webhook unavailable.'},{status:503});
 if(Number(request.headers.get('content-length')??0)>65536)return new Response(null,{status:413});
 const raw=await request.text();if(raw.length>65536)return new Response(null,{status:413});
 let event:{type:string;created_at:string;data:{email_id:string}};
 try{new Webhook(secret).verify(raw,{'svix-id':request.headers.get('svix-id')??'','svix-timestamp':request.headers.get('svix-timestamp')??'','svix-signature':request.headers.get('svix-signature')??''});event=JSON.parse(raw);if(!event||typeof event.type!=='string')throw Error('invalid_event');}catch{return Response.json({error:'Invalid webhook signature.'},{status:401});}
 const status=({'email.delivered':'delivered','email.bounced':'bounced','email.complained':'complained','email.failed':'failed'} as Record<string,string>)[event.type];
 if(!status)return Response.json({ok:true,ignored:true});
 if(typeof event.data?.email_id!=='string'||!Number.isFinite(Date.parse(event.created_at)))return Response.json({error:'Invalid event.'},{status:400});
 try{
 const {rows:known}=await db.execute(sql`select id from public.member_email_outbox where provider_id=${event.data.email_id} limit 1`);
 if(!known.length)return Response.json({error:'Send result not yet reconciled.'},{status:503});
 await db.execute(sql`update public.member_email_outbox set delivery_status=${status},delivery_event_at=${event.created_at}::timestamptz where provider_id=${event.data.email_id} and (delivery_event_at is null or delivery_event_at<=${event.created_at}::timestamptz) and (delivery_status not in ('bounced','complained') or ${status} in ('bounced','complained'))`);
 return Response.json({ok:true});
 }catch{return Response.json({error:'Delivery evidence could not be recorded.'},{status:503});}
}
