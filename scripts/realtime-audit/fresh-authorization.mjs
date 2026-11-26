// LOCAL ONLY: disposable PostgreSQL, synthetic identities and mock realtime.messages.
// Not a Supabase Realtime server; cannot test cached sockets or public channels.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const adminUrl=new URL('postgresql://postgres:postgres@127.0.0.1:5432/postgres');
if(!['127.0.0.1','localhost'].includes(adminUrl.hostname))throw Error('loopback only');
const name='fb_realtime_'+randomBytes(6).toString('hex'),admin=new pg.Client({connectionString:adminUrl.toString()});await admin.connect();let db;
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',C='10000000-0000-4000-8000-000000000003',M='20000000-0000-4000-8000-000000000001',topic='fb-chat:'+M;
try{
 await admin.query(`create database ${name}`);const url=new URL(adminUrl);url.pathname='/'+name;db=new pg.Client({connectionString:url.toString()});await db.connect();
 await db.query(`create schema auth;create schema realtime;grant usage on schema auth,realtime,public to authenticated,anon,service_role;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('request.test.topic',true) $$;
  create table public.matches(id uuid primary key,user_a uuid not null,user_b uuid not null,status text not null);
  create table public.blocked_users(blocker_id uuid not null,blocked_id uuid not null,primary key(blocker_id,blocked_id));
  create table realtime.messages(extension text not null,payload jsonb not null default '{}'::jsonb);
  grant select,insert on realtime.messages to authenticated;alter table realtime.messages enable row level security;
  create function public.is_match_participant(p_match uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select exists(select 1 from public.matches m where m.id=p_match and auth.uid() in(m.user_a,m.user_b))$$;
  create function public.can_use_chat_topic(p_topic text,p_write boolean) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select case when auth.uid() is null or p_write is null then false when p_topic ~ '^fb-chat:[0-9a-fA-F-]{36}$' then public.is_match_participant(substring(p_topic from 9)::uuid) else false end$$;
  create function public.can_use_call_topic(p_topic text,p_write boolean) returns boolean language sql stable as $$select p_topic='fb-call:fixture'$$;
  create policy chat_read on realtime.messages for select to authenticated using(extension='broadcast' and public.can_use_chat_topic((select realtime.topic()),false));
  create policy chat_write on realtime.messages for insert to authenticated with check(extension='broadcast' and public.can_use_chat_topic((select realtime.topic()),true));
  create policy call_read on realtime.messages for select to authenticated using(extension='broadcast' and public.can_use_call_topic((select realtime.topic()),false));
  create policy call_write on realtime.messages for insert to authenticated with check(extension='broadcast' and public.can_use_call_topic((select realtime.topic()),true));`);
 await db.query('insert into public.matches values($1,$2,$3,$4)',[M,A,B,'active']);await db.query('insert into public.blocked_users values($1,$2)',[A,B]);
 await db.query('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[B]);assert.equal((await db.query('select public.can_use_chat_topic($1,true) ok',[topic])).rows[0].ok,true);console.log('PASS negative control: prior membership-only predicate permits blocked participant');await db.query('reset role');
 const migration=await readFile('supabase/migrations/20261122020000_chat_realtime_fresh_authorization.sql','utf8');await db.query(migration);await db.query(migration);
 const priv=(await db.query("select has_function_privilege('anon','public.can_use_chat_topic(text,boolean)','execute') anon,has_function_privilege('authenticated','public.can_use_chat_topic(text,boolean)','execute') member,has_function_privilege('service_role','public.can_use_chat_topic(text,boolean)','execute') service")).rows[0];assert.deepEqual(priv,{anon:false,member:true,service:true});console.log('PASS migration applies twice and retains least-privilege execute grants');
 await db.query('set role authenticated');
 async function identity(id,t=topic){await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.test.topic',$2,false)",[id??'',t??''])}
 async function pred(id,t,w){await identity(id,t);return (await db.query('select public.can_use_chat_topic($1,$2) ok',[t,w])).rows[0].ok}
 async function allowInsert(){await db.query("insert into realtime.messages(extension,payload) values('broadcast','{}')")}
 async function denyInsert(){await assert.rejects(()=>allowInsert(),e=>e.code==='42501')}
 for(const who of [A,B]){assert.equal(await pred(who,topic,false),false);assert.equal(await pred(who,topic,true),false);await denyInsert();assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n,0)}
 console.log('PASS fresh read and write authorization denies both members after a block');await db.query('reset role');
 for(const [blocker,blocked] of [[A,B],[B,A]]){await db.query('delete from public.blocked_users');await db.query('insert into public.blocked_users values($1,$2)',[blocker,blocked]);await db.query('set role authenticated');for(const who of [A,B])assert.equal(await pred(who,topic,true),false);await db.query('reset role')}
 await db.query('delete from public.blocked_users');await db.query('insert into public.blocked_users values($1,$2),($2,$1)',[A,B]);await db.query('delete from public.blocked_users where blocker_id=$1 and blocked_id=$2',[A,B]);await db.query('set role authenticated');assert.equal(await pred(A,topic,true),false);assert.equal(await pred(B,topic,true),false);await db.query('reset role');await db.query('delete from public.blocked_users');await db.query('set role authenticated');
 for(const who of [A,B])for(const write of [false,true])assert.equal(await pred(who,topic,write),true);
 await identity(A);await allowInsert();await assert.rejects(()=>db.query("insert into realtime.messages(extension) values('presence')"),e=>e.code==='42501');assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n,1);await identity(B);assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n,1);
 assert.equal(await pred(C,topic,true),false);await denyInsert();assert.equal(await pred(null,topic,true),false);
 assert.equal(await pred(A,'fb-chat:'+M.toUpperCase(),true),true);assert.equal(await pred(A,topic,null),false);
 for(const bad of ['fb-chat:', 'fb-chat:'+M+'x','fb-chat:'+M.replace(/-/g,'x'),'fb-chat:------------------------------------','fb-call:'+M,null])assert.equal(await pred(A,bad,true),false);
 console.log('PASS participants, stranger, missing identity, malformed topics, case and read/write/null');await db.query('reset role');
 for(const status of ['active','archived','blocked','unmatched','other']){await db.query('update public.matches set status=$1 where id=$2',[status,M]);await db.query('set role authenticated');assert.equal(await pred(A,topic,true),status==='active'||status==='archived');await db.query('reset role')}
 await db.query("update public.matches set status='active' where id=$1",[M]);await db.query('set role authenticated');await identity(A,'fb-call:fixture');await allowInsert();assert.ok((await db.query('select count(*)::int n from realtime.messages')).rows[0].n>0);console.log('PASS match lifecycle, both block directions, unblock and unrelated call policy composition');
 await identity(A);await db.query("insert into realtime.messages(extension,payload) values('broadcast','{\"arbitrary\":\"payload\"}')");console.log('PASS limitation confirmed: an authorized publisher can still send arbitrary payloads');
 console.log('LIMIT mock RLS/SQL only: no Supabase Realtime service, permission cache, held socket, public channel, network or hosted acceptance.');
}finally{if(db)await db.end().catch(()=>{});await admin.query(`drop database if exists ${name} with (force)`);await admin.end()}
