import { timingSafeEqual } from "node:crypto";
export const SUPPORT_INBOX = "support@freeborndating.com";
export const EMAIL_RE = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
export function validEmail(value: unknown): value is string { return typeof value === "string" && value.length <= 200 && EMAIL_RE.test(value); }
export function escapeEmail(value: string) { return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
export function workerAuthorized(request: Request) {
 const secret=process.env.CRON_SECRET; if(!secret || secret.length<24)return false;
 const got=Buffer.from(request.headers.get('authorization')??'');const expected=Buffer.from('Bearer '+secret);
 return got.length===expected.length && timingSafeEqual(got,expected);
}
export function mailConfigured() { return Boolean(process.env.RESEND_API_KEY && validEmail(process.env.FREEBORN_EMAIL_FROM)); }
export type Mail = {to:string;subject:string;text:string;replyTo?:string;unsubscribe?:string};
/** A provider ID means ACCEPTED, never a claim of delivery/inbox placement. */
export async function sendMemberEmail(mail: Mail,key:string):Promise<{id:string}> {
 if(!mailConfigured())throw new Error('mail_not_configured');
 if(!validEmail(mail.to)||mail.replyTo&&!validEmail(mail.replyTo))throw new Error('invalid_recipient');
 const res=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:`Freeborn <${process.env.FREEBORN_EMAIL_FROM}>`,to:[mail.to],subject:mail.subject,text:mail.text,html:`<div style="background:#171724;color:#eee7db;padding:28px;font-family:Arial,sans-serif"><h1 style="font-family:Georgia,serif">Freeborn</h1><div style="white-space:pre-wrap;line-height:1.6">${escapeEmail(mail.text)}</div></div>`,reply_to:mail.replyTo??SUPPORT_INBOX,...(mail.unsubscribe?{headers:{'List-Unsubscribe':`<${mail.unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}:{})})});
 if(!res.ok)throw new Error(`mail_http_${res.status}`);
 const json=await res.json();if(typeof json.id!=='string'||!json.id)throw new Error('mail_missing_id');return {id:json.id};
}
