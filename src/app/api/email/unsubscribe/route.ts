import { sql } from "drizzle-orm";
import { db } from "@/db";
export const dynamic='force-dynamic';
async function stop(request:Request){
 const token=new URL(request.url).searchParams.get('token');
 if(!token||!/^[-a-f0-9]{36}$/i.test(token))return new Response('Invalid unsubscribe link.',{status:400});
 try{
 await db.execute(sql`insert into public.member_email_preferences(user_id,matches,messages,likes) select user_id,false,false,false from public.member_email_outbox where unsubscribe_token=${token}::uuid and kind in ('match','message','like') and user_id is not null on conflict(user_id) do update set matches=false,messages=false,likes=false,updated_at=now()`);
 return new Response('Optional Freeborn activity emails are now off. Account security and requested support emails are separate.',{headers:{'Cache-Control':'no-store','Content-Type':'text/plain'}});
 }catch{return new Response('Could not update email preferences. Please try again.',{status:503});}
}
export const POST=stop;
// GET is a confirmation form: mail scanners must not silently change preferences.
export async function GET(request:Request){const token=new URL(request.url).searchParams.get('token');if(!token||!/^[-a-f0-9]{36}$/i.test(token))return new Response('Invalid link.',{status:400});return new Response(`<h1>Freeborn email preferences</h1><p>Stop optional likes, matches and message emails?</p><form method="POST"><button>Stop activity emails</button></form>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"}});}
