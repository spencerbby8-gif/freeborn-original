// LOCAL ONLY. Copies an explicitly named disposable local schema into a new disposable database.
// Exercises the migration with real app table definitions; auth.uid() is a synthetic shim.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const url=new URL('postgresql://postgres:postgres@127.0.0.1:5432/postgres');if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('loopback only');
const admin=new pg.Client({connectionString:url.toString()}),name='fb_realtime_schema_'+randomBytes(6).toString('hex');await admin.connect();let db;
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',M='20000000-0000-4000-8000-000000000001';
try{
 await admin.query(`create database ${name} template member_migration_test`);const u=new URL(url);u.pathname='/'+name;db=new pg.Client({connectionString:u.toString()});await db.connect();
 await db.query("create schema if not exists auth;create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated");
 await db.query('delete from accounts where id=any($1::uuid[])',[[A,B]]);
 for(const [id,email] of [[A,'fixture-a@example.test'],[B,'fixture-b@example.test']]){await db.query('insert into accounts(id,email) values($1,$2)',[id,email]);await db.query("insert into user_profiles(id,email,display_name,birth_date,profile_status,discoverable,onboarding_completed_at,city) values($1,$2,'Fixture','1995-01-01','active',false,now(),'Test')",[id,email])}
 await db.query("insert into matches(id,user_a,user_b,status) values($1,$2,$3,'active')",[M,A,B]);
 const catalog=async()=>(await db.query(`select (select count(*)::int from pg_tables where schemaname='public') tables,(select count(*)::int from information_schema.columns where table_schema='public') columns,(select count(*)::int from pg_indexes where schemaname='public') indexes,(select count(*)::int from pg_constraint x join pg_class t on t.oid=x.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and x.contype='c') checks,(select count(*)::int from public.matches) matches,(select count(*)::int from public.messages) messages`)).rows[0];
 const before=await catalog(),sql=await readFile('supabase/migrations/20261122020000_chat_realtime_fresh_authorization.sql','utf8');await db.query(sql);await db.query(sql);assert.deepEqual(await catalog(),before);
 await db.query('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);const predicate=async()=>(await db.query('select public.can_use_chat_topic($1,true) ok',['fb-chat:'+M])).rows[0].ok;assert.equal(await predicate(),true);await db.query('reset role');
 await db.query('insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[B,A]);await db.query('set role authenticated');assert.equal(await predicate(),false);await db.query('reset role');await db.query('delete from blocked_users where blocker_id=$1 and blocked_id=$2',[B,A]);await db.query('set role authenticated');assert.equal(await predicate(),true);await db.query('reset role');
 await db.query("update matches set status='unmatched',unmatched_by=$2,unmatched_at=now() where id=$1",[M,A]);await db.query('set role authenticated');assert.equal(await predicate(),false);
 console.log('PASS migration applied twice over a cloned local app schema without table/index/check or existing row-count changes');
 console.log('PASS actual local match/block definitions enforce fresh predicate through block, unblock and unmatch');
 console.log('LIMIT auth.uid is a shim; this is not a full clean replay or hosted Realtime test.');
}finally{if(db)await db.end().catch(()=>{});await admin.query(`drop database if exists ${name} with (force)`);await admin.end()}
