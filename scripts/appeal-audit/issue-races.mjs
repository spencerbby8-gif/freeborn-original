// Local-only real handlers + disposable loopback PostgreSQL; synthetic identities.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createHarness,IDS} from '../member-experience/harness.mjs';
process.env.PGPOOL_MAX='4';
const h=await createHarness({routes:{issue:'src/app/api/human/issue/route.ts',verify:'src/app/api/human/verify/route.ts'}});let failures=0;
const q=(s,p=[])=>h.client.query(s,p);const email=h.identities[IDS.a].email;
async function check(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failures++;console.error('FAIL '+name+': '+e.message)}}
const issue=(identity='a',purpose='appeal')=>h.request('issue','POST',identity,{purpose,risk:'browser'});
try{
 await h.seed();await q('delete from human_challenges where email=$1',[email]);
 await check('Two simultaneous issue requests serialize and leave one issued challenge',async()=>{
  await q(`create or replace function public.fixture_issue_hold() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(7281930123093); return new; end $$`);
  await q('create trigger fixture_issue_hold before insert on human_challenges for each row execute function public.fixture_issue_hold()');
  let requests=[],waiters=0;await q('begin');try{await q('select pg_advisory_xact_lock(7281930123093)');requests=[issue(),issue()];const deadline=Date.now()+5000;while(Date.now()<deadline){await q('select pg_stat_clear_snapshot()');waiters=(await q("select count(*)::int n from pg_locks l join pg_stat_activity a on a.pid=l.pid where l.locktype='advisory' and not l.granted and a.datname=current_database()")).rows[0].n;if(waiters>=2)break;await new Promise(r=>setTimeout(r,20))}}finally{await q('commit')}
  let responses;try{responses=await Promise.all(requests)}finally{await q('drop trigger fixture_issue_hold on human_challenges');await q('drop function public.fixture_issue_hold()')}
  assert.ok(waiters>=2,'both requests must be observed waiting');assert.deepEqual(responses.map(r=>r.status),[200,200]);const nonces=await Promise.all(responses.map(async r=>(await r.json()).nonce));assert.notEqual(nonces[0],nonces[1]);const rows=(await q("select nonce,status from human_challenges where email=$1 and purpose='appeal' order by issued_at",[email])).rows;assert.equal(rows.length,2);assert.equal(rows.filter(r=>r.status==='issued').length,1,JSON.stringify(rows));assert.equal(rows.filter(r=>r.status==='expired').length,1);assert.ok(nonces.includes(rows.find(r=>r.status==='issued').nonce));
 });
 await check('Insertion failure rolls back expiration of the preceding issued challenge',async()=>{
  await q('delete from human_challenges where email=$1',[email]);const previous=await issue();assert.equal(previous.status,200);const nonce=(await previous.json()).nonce;
  await q(`create or replace function public.fixture_issue_fail() returns trigger language plpgsql as $$ begin raise exception 'fixture forced issuance failure'; end $$`);await q('create trigger fixture_issue_fail before insert on human_challenges for each row execute function public.fixture_issue_fail()');
  let result;try{result=await issue()}finally{await q('drop trigger fixture_issue_fail on human_challenges');await q('drop function public.fixture_issue_fail()')}
  assert.equal(result.status,503);assert.match((await result.json()).error,/try again/i);const row=(await q('select status from human_challenges where email=$1 and nonce=$2',[email,nonce])).rows[0];assert.equal(row.status,'issued');
 });
 await check('New issue expires only same member and purpose issued rows',async()=>{await q('delete from human_challenges where email=$1',[email]);const a=(await (await issue()).json()).nonce;const other=(await (await issue('a','reset')).json()).nonce;const peer=(await (await issue('b','appeal')).json()).nonce;const fresh=(await (await issue()).json()).nonce;const rows=(await q('select email,nonce,status from human_challenges where nonce=any($1::text[])',[[a,other,peer,fresh]])).rows;const status=n=>rows.find(r=>r.nonce===n)?.status;assert.equal(status(a),'expired');for(const n of [other,peer,fresh])assert.equal(status(n),'issued')});
 await check('Superseded nonce fails verification; a previously solved nonce remains solved',async()=>{
  await q('delete from human_challenges where email=$1',[email]);const old=(await (await issue()).json()).nonce;const current=(await (await issue()).json()).nonce;assert.equal((await h.request('verify','POST','a',{nonce:old,solution:'0'})).status,410);
  let solution=0;while(!createHash('sha256').update(`${current}:${solution}`).digest('hex').startsWith('000'))solution++;const verified=await h.request('verify','POST','a',{nonce:current,solution:String(solution)});assert.equal(verified.status,200);const token=(await verified.json()).token;assert.equal((await issue()).status,200);assert.equal((await q('select status from human_challenges where id=$1',[token])).rows[0].status,'solved');
 });
 await check('Issuer lock is scoped to member and purpose',async()=>{
  await q('begin');let blocked,waiters=0;try{await q("select pg_advisory_xact_lock(hashtextextended('human-issue:' || $1::text || ':appeal',0))",[email]);blocked=issue();const deadline=Date.now()+4000;while(Date.now()<deadline){await q('select pg_stat_clear_snapshot()');waiters=(await q("select count(*)::int n from pg_locks l join pg_stat_activity a on a.pid=l.pid where l.locktype='advisory' and not l.granted and a.datname=current_database()")).rows[0].n;if(waiters)break;await new Promise(r=>setTimeout(r,20))}assert.ok(waiters,'the same member and purpose must wait');const [otherPurpose,otherMember]=await Promise.all([issue('a','reset'),issue('b','appeal')]);assert.equal(otherPurpose.status,200);assert.equal(otherMember.status,200)}finally{await q('commit');if(blocked)assert.equal((await blocked).status,200)}
 });
 await check('Invalid purpose, unsigned request and cross-origin request cannot issue',async()=>{assert.equal((await issue('a','verification')).status,400);assert.equal((await h.request('issue','POST',null,{purpose:'appeal'})).status,401);assert.equal((await h.request('issue','POST','a',{purpose:'appeal'},{},{origin:'https://evil.example'})).status,403)});
}finally{await q('drop trigger if exists fixture_issue_hold on human_challenges');await q('drop function if exists public.fixture_issue_hold()');await q('drop trigger if exists fixture_issue_fail on human_challenges');await q('drop function if exists public.fixture_issue_fail()');await h.close()}
if(failures)process.exitCode=1;
