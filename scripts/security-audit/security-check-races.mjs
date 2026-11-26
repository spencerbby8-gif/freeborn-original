// LOCAL ONLY: real security-check handler, synthetic Auth/provider and disposable PostgreSQL.
import assert from 'node:assert/strict';
import {createHarness,IDS} from '../member-experience/harness.mjs';
process.env.PGPOOL_MAX='4';const previous=globalThis.fetch;globalThis.fetch=async()=>Response.json({status:'success',hosting:true,proxy:false,isp:'synthetic fixture'});
const h=await createHarness({routes:{security:'src/app/api/security/check/route.ts'}});await h.seed();const email=h.identities[IDS.a].email,q=(s,p=[])=>h.client.query(s,p);let errors=0;
const call=()=>h.request('security','POST','a',{}, {},{origin:'http://fixture.local','x-nf-client-connection-ip':'198.51.100.10'});
async function reset(){await q('delete from suspensions where email=$1',[email]);await q('delete from security_events where email=$1',[email])}
async function check(name,fn){try{await reset();await fn();console.log('PASS '+name)}catch(e){errors++;console.error('FAIL '+name+': '+e.message)}}
try{
 await check('simultaneous datacenter checks create a single suspension and audit event',async()=>{
  const key=7281930124100;await q(`create or replace function public.fixture_security_barrier() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(${key}); return new; end $$`);await q('create trigger fixture_security_barrier before insert on suspensions for each row execute function public.fixture_security_barrier()');
  await q('begin');let jobs,waiting=0;try{await q(`select pg_advisory_xact_lock(${key})`);jobs=[call(),call()];const deadline=Date.now()+5000;while(Date.now()<deadline){await q('select pg_stat_clear_snapshot()');waiting=(await q("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and state='active'")).rows[0].n;if(waiting>=2)break;await new Promise(r=>setTimeout(r,20))}}finally{await q('commit')}
  let replies;try{replies=await Promise.all(jobs)}finally{await q('drop trigger fixture_security_barrier on suspensions');await q('drop function public.fixture_security_barrier()')}
  assert.ok(waiting>=2,'both checks must reach held locks');for(const r of replies){assert.equal(r.status,200);assert.equal((await r.json()).suspended,true)}assert.equal((await q('select count(*)::int n from suspensions where email=$1 and active',[email])).rows[0].n,1);assert.equal((await q("select count(*)::int n from security_events where email=$1 and kind='datacenter-blocked'",[email])).rows[0].n,1);
 });
 await check('suspension created during reputation lookup is returned without duplicate writes',async()=>{
  const saved=globalThis.fetch;let release,entered;const started=new Promise(r=>{entered=r});const gate=new Promise(r=>{release=r});globalThis.fetch=async()=>{entered();await gate;return Response.json({status:'success',hosting:true,proxy:false,isp:'synthetic fixture'})};
  const job=call();try{await started;await q("insert into suspensions(email,reason,active) values($1,'fixture_reason',true)",[email])}finally{release();globalThis.fetch=saved}const response=await job;assert.equal(response.status,200);assert.equal((await response.json()).reason,'fixture_reason');assert.equal((await q('select count(*)::int n from suspensions where email=$1',[email])).rows[0].n,1);assert.equal((await q('select count(*)::int n from security_events where email=$1',[email])).rows[0].n,0);
 });
 await check('failed suspension insert rolls back event and returns an uncertain 503',async()=>{
  await q("create or replace function public.fixture_security_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic failure'; end$$");await q('create trigger fixture_security_fail before insert on suspensions for each row execute function public.fixture_security_fail()');let result;try{result=await call()}finally{await q('drop trigger fixture_security_fail on suspensions');await q('drop function public.fixture_security_fail()')}assert.equal(result.status,503);assert.equal((await q('select count(*)::int n from suspensions where email=$1',[email])).rows[0].n,0);assert.equal((await q('select count(*)::int n from security_events where email=$1',[email])).rows[0].n,0);
 });
}finally{await q('drop trigger if exists fixture_security_barrier on suspensions');await q('drop trigger if exists fixture_security_fail on suspensions');await q('drop function if exists public.fixture_security_barrier()');await q('drop function if exists public.fixture_security_fail()');await reset();await h.close();globalThis.fetch=previous}
if(errors)process.exitCode=1;
