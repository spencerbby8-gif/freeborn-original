import { sql } from "drizzle-orm";
import { db } from "@/db";
import { mailConfigured, sendMemberEmail, SUPPORT_INBOX, validEmail, type Mail } from "@/lib/member-email";
type Job={id:string;user_id:string;kind:string;source_id:string;peer_id:string|null;attempts:number;created_at:Date;unsubscribe_token:string};
function appOrigin(){const u=new URL(process.env.NEXT_PUBLIC_APP_URL??'https://freeborndating.com');if(u.protocol!=='https:' && !['localhost','127.0.0.1'].includes(u.hostname))throw Error('invalid_app_origin');return u.origin;}
async function prepare(job:Job):Promise<Mail|null>{
 const origin=appOrigin();
 if(job.kind==='support_ticket'){
  const {rows:[ticket]}=await db.execute<{message:string;email:string|null}>(sql`select message,email from public.support_requests where id=${job.source_id}::uuid`);
  if(!ticket)return null;
  return {to:SUPPORT_INBOX,subject:`Freeborn support request ${job.source_id}`,text:`A member submitted support ticket ${job.source_id}.\n\n${ticket.message}\n\nReply-to requested: ${ticket.email??'account email'}\nReview and reply securely at ${origin}/app/settings/support/inbox. This email may contain private support information.`,...(validEmail(ticket.email)?{replyTo:ticket.email}:{})};
 }
 const {rows:[recipient]}=await db.execute<{email:string|null;profile_status:string}>(sql`select public.member_notification_email(p.id) email,p.profile_status from public.user_profiles p where p.id=${job.user_id}::uuid`);
 if(!recipient?.email||!validEmail(recipient.email))return null;
 const {rows:suppressed}=await db.execute(sql`select 1 from public.member_email_outbox where user_id=${job.user_id}::uuid and delivery_status in ('bounced','complained') and kind<>'support_ticket' limit 1`);
 if(suppressed.length)return null;
 if(['match','message','like'].includes(job.kind)){
  if(recipient.profile_status!=='active')return null;
  const {rows:[allowed]}=await db.execute<{enabled:boolean;blocked:boolean}>(sql`select coalesce((select case ${job.kind} when 'match' then matches when 'message' then messages else likes end from public.member_email_preferences where user_id=${job.user_id}::uuid),false) enabled,exists(select 1 from public.blocked_users where (blocker_id=${job.user_id}::uuid and blocked_id=${job.peer_id}::uuid) or (blocked_id=${job.user_id}::uuid and blocker_id=${job.peer_id}::uuid)) blocked`);
  if(!allowed?.enabled||allowed.blocked)return null;
  if(job.kind==='match'){
   const {rows}=await db.execute(sql`select 1 from public.matches where id=${job.source_id}::uuid and status='active' and ${job.user_id}::uuid in (user_a,user_b)`);if(!rows.length)return null;
  }else if(job.kind==='message'){
   const {rows}=await db.execute(sql`select 1 from public.messages msg join public.matches m on m.id=msg.match_id where msg.id=${job.source_id}::uuid and msg.read_at is null and m.status='active' and ${job.user_id}::uuid in (m.user_a,m.user_b)`);if(!rows.length)return null;
  }else{
   // A daily like nudge must not disclose a blocked/deleted/unliked actor.
   const {rows}=await db.execute(sql`select 1 from public.user_swipes s join public.user_profiles p on p.id=s.liker_id where s.liker_id=${job.source_id}::uuid and s.liked_id=${job.user_id}::uuid and s.action in ('like','superlike') and p.profile_status='active'`);if(!rows.length)return null;
  }
 }
 const copy:Record<string,[string,string,string]>={
 welcome:['Welcome to Freeborn','Your profile setup is complete.\n\n1. Explore Discover and adjust your saved Discovery Preferences.\n2. Like each other to match. Your matches live inside Notifications and Messages.\n3. Open a conversation to chat or start a voice/video call.\n4. Share 24-hour Stories with your matches; exact pictures quoted in private chats can remain after expiry.\n5. Use Settings for privacy, blocked accounts and support.\n\nTake your time. Never send money to someone you meet online.','/app/settings/welcome'],
 match:['You have a new match','Open Freeborn to view your match. No private profile details are included in email.','/app/notifications?view=matches'],
 message:['You have an unread conversation','Open Freeborn to read your messages. Private message contents are never included in these alerts.','/app/chat'],
 like:['New activity in your Likes','Open Freeborn to review your Likes.','/app/likes'],
 verification:['Your verification status has an update','Open Freeborn to see the result. Verification is not a safety guarantee.','/app/verification'],
 appeal:['Your account appeal has an update','Open your appeal to review the recorded decision.','/app/settings/appeal'],
 support_ack:['Your support request was saved',`Your support reference is ${job.source_id}. You can follow the conversation in Help & Support. No response time is promised. Freeborn support is not an emergency service.`,'/app/settings/support'],
 support_reply:['Freeborn support replied','Your support conversation has a new reply. Sign in to read it securely.','/app/settings/support']};
 const c=copy[job.kind];if(!c)return null;
 const unsubscribe=['match','message','like'].includes(job.kind)?`${origin}/api/email/unsubscribe?token=${job.unsubscribe_token}`:undefined;
 return {to:recipient.email,subject:c[0],text:`${c[1]}\n\n${origin}${c[2]}\n\nHelp: ${SUPPORT_INBOX}${unsubscribe?'\nStop optional activity emails: '+unsubscribe:''}`,unsubscribe};
}
/** Atomic SKIP LOCKED claims; bounded retries stay inside provider's 24h dedup window.
 * Stale uncertain sends older than 20h are failed, never blindly resent. */
export async function dispatchMemberEmails(limit=10){
 if(!mailConfigured())return {configured:false,accepted:0,suppressed:0,failed:0};
 await db.execute(sql`update public.member_email_outbox set status='failed',last_error='retry_window_expired' where status in ('pending','sending') and created_at<now()-interval '20 hours'`);
 const {rows:jobs}=await db.execute<Job>(sql`with due as (select id from public.member_email_outbox where attempts<8 and created_at>now()-interval '20 hours' and ((status='pending' and available_at<=now()) or (status='sending' and claimed_at<now()-interval '5 minutes')) order by available_at for update skip locked limit ${Math.min(20,Math.max(1,limit))}) update public.member_email_outbox o set status='sending',claimed_at=now(),attempts=o.attempts+1 from due where o.id=due.id returning o.*`);
 const result={configured:true,accepted:0,suppressed:0,failed:0};
 for(const job of jobs){try{
  const mail=await prepare(job);
  if(!mail){await db.execute(sql`update public.member_email_outbox set status='suppressed',last_error='recipient_or_policy' where id=${job.id}::uuid`);result.suppressed++;continue;}
  const sent=await sendMemberEmail(mail,'freeborn:'+job.id);
  await db.execute(sql`update public.member_email_outbox set status='accepted',provider_id=${sent.id},accepted_at=now(),last_error=null where id=${job.id}::uuid`);result.accepted++;
 }catch(error){const code=error instanceof Error&&/^(mail_http_[0-9]{3}|mail_missing_id|invalid_recipient|mail_not_configured)$/.test(error.message)?error.message:'delivery_attempt_failed';
  const permanent=/^mail_http_4/.test(code)&&!['mail_http_429','mail_http_408'].includes(code);
  await db.execute(sql`update public.member_email_outbox set status=${permanent||job.attempts>=8?'failed':'pending'},last_error=${code},available_at=now()+interval '5 minutes' where id=${job.id}::uuid`);result.failed++;
 }}return result;
}
