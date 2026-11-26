import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getMember } from "@/lib/app-auth";
import { rejectCrossOrigin } from "@/lib/request-guard";
import { validEmail } from "@/lib/member-email";
import { isSupportTopic, SUPPORT_TOPICS } from "@/lib/support-topics";
export const dynamic="force-dynamic";
/** Tickets and the mail outbox are committed atomically by a database trigger.
 * Returning a reference proves persistence, NOT inbox receipt or human review. */
export async function POST(request:Request){
 const blocked=rejectCrossOrigin(request);if(blocked)return blocked;
 const member=await getMember(request);if(!member)return Response.json({error:'Not signed in.'},{status:401});
 let body:unknown;try{body=await request.json();}catch{return Response.json({error:'Invalid request body.'},{status:400});}
 if(!body||typeof body!=='object')return Response.json({error:'Invalid request body.'},{status:400});
 const {message,email,topic} = body as {message?:unknown;email?:unknown;topic?:unknown};
 if(typeof message!=='string'||message.trim().length<5||message.trim().length>4000)return Response.json({error:'Use 5 to 4,000 characters for your message.'},{status:400});
 if(topic!==undefined&&!isSupportTopic(topic))return Response.json({error:'Choose a valid support topic.'},{status:400});
 if(email!==undefined&&(typeof email!=='string'||email.trim()&&!validEmail(email.trim())))return Response.json({error:'Enter a valid reply-to email or leave it empty.'},{status:400});
 const storedMessage = isSupportTopic(topic) ? `Topic: ${SUPPORT_TOPICS[topic]}\n\n${message.trim()}` : message.trim();
 try{
 const result=await db.transaction(async tx=>{
  // Per-account lock + durable quota survives serverless restarts and concurrent requests.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${member.id}))`);
  const {rows:[quota]}=await tx.execute<{n:number}>(sql`select count(*)::int n from public.support_requests where account_id=${member.id}::uuid and created_at>now()-interval '1 hour'`);
  if(quota.n>=10)return null;
  const {rows:[ticket]}=await tx.execute<{id:string}>(sql`insert into public.support_requests(account_id,message,email) values(${member.id}::uuid,${storedMessage},${typeof email==='string'&&email.trim()?email.trim():member.email}) returning id`);
  // Never claim an email was queued if the database trigger/schema is missing or broken.
  // Keep the ticket and its two outbox events in the same transaction; any failure rolls back.
  const {rows:[queued]}=await tx.execute<{n:number}>(sql`select count(*)::int as n from public.member_email_outbox where source_id=${ticket.id}::uuid and kind in ('support_ticket','support_ack')`);
  if(queued.n!==2)throw new Error('Support outbox events were not created');
  return ticket;
 });
 if(!result)return Response.json({error:'Too many requests. Please try again in an hour.'},{status:429,headers:{'Retry-After':'3600'}});
 return Response.json({ok:true,ticketId:result.id,delivery:'queued',message:'Saved to support. Email forwarding is queued; delivery and human review are not yet confirmed.'},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Your request could not be saved. Please try again.'},{status:503});}
}
export async function GET(request:Request){
 const member=await getMember(request);if(!member)return Response.json({error:'Not signed in.'},{status:401});
 try{const {rows}=await db.execute(sql`select t.id,t.message,t.status,t.created_at,coalesce((select json_agg(json_build_object('id',r.id,'message',r.message,'createdAt',r.created_at) order by r.created_at) from public.support_replies r where r.ticket_id=t.id),'[]'::json) replies,(select case when delivery_status<>'unknown' then delivery_status else status end from public.member_email_outbox o where o.source_id=t.id and o.kind='support_ticket' limit 1) forwarding from public.support_requests t where t.account_id=${member.id}::uuid order by t.created_at desc limit 25`);return Response.json({tickets:rows},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Support history unavailable.'},{status:503});}
}
