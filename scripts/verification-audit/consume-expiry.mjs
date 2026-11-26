// Local only: actual challenge consumers and isolated disposable PostgreSQL.
import assert from 'node:assert/strict';
import {createHarness,IDS} from '../member-experience/harness.mjs';
process.env.PGPOOL_MAX='4';
const h=await createHarness({routes:{issue:'src/app/api/verification/challenge/route.ts',live:'src/lib/liveness-challenge.ts',pose:'src/lib/pose-challenge.ts'}});
const q=(s,p=[])=>h.client.query(s,p),email=h.identities[IDS.a].email;
const live=id=>h.routes.live.consumeLivenessChallenge(email,id);
const pose=(id,label)=>h.routes.pose.consumePoseChallenge(IDS.a,id,label);
async function issue(){const r=await h.request('issue','POST','a',{});assert.equal(r.status,200);const b=await r.json();assert.ok(b.poseRequired);return b}
async function row(table,id){const where=table==='human_challenges'?'id=$1::uuid':'challenge_token=$1';return (await q(`select status,expires_at<clock_timestamp() as expired from ${table} where ${where}`,[id])).rows[0]}
async function heldExpiry(table,id,call){
 const where=table==='human_challenges'?'id=$1::uuid':'challenge_token=$1';
 await q(`update ${table} set expires_at=clock_timestamp()+interval '2 seconds' where ${where}`,[id]);
 await q('begin');await q(`select id from ${table} where ${where} for update`,[id]);
 const promise=call();let waiting=false;
 try{const deadline=Date.now()+1500;while(Date.now()<deadline){await q('select pg_stat_clear_snapshot()');const r=await q("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and state='active'");if(r.rows[0].n){waiting=true;break}await new Promise(r=>setTimeout(r,20))}assert.ok(waiting,'consumer must block on row lock before expiry');await q('select pg_sleep(2.2)')}finally{await q('commit')}
 const outcome=await promise;assert.equal((await row(table,id)).expired,true);return outcome;
}
let failures=0;async function test(name,fn){try{await fn();console.log('PASS '+name)}catch(e){failures++;console.error('FAIL '+name, e)}}
try{await h.seed();
 await test('liveness is rejected when it expires while its row lock is held',async()=>{const b=await issue();const r=await heldExpiry('human_challenges',b.livenessToken,()=>live(b.livenessToken));assert.equal(r.state,'expired');assert.equal((await row('human_challenges',b.livenessToken)).status,'expired')});
 await test('pose is not verified when it expires while its row lock is held',async()=>{const b=await issue();const r=await heldExpiry('verification_challenges',b.livenessToken,()=>pose(b.livenessToken,b.pose.label));assert.equal(r.state,'expired');assert.equal((await row('verification_challenges',b.livenessToken)).status,'expired')});
 await test('fresh liveness is consumed once across parallel attempts',async()=>{const b=await issue();const r=await Promise.all([live(b.livenessToken),live(b.livenessToken)]);assert.deepEqual(r.map(x=>x.state).sort(),['replayed','verified']);assert.equal((await row('human_challenges',b.livenessToken)).status,'solved')});
 await test('fresh pose is consumed once across parallel attempts',async()=>{const b=await issue();const r=await Promise.all([pose(b.livenessToken,b.pose.label),pose(b.livenessToken,b.pose.label)]);assert.deepEqual(r.map(x=>x.state).sort(),['mismatch','verified']);assert.equal((await row('verification_challenges',b.livenessToken)).status,'consumed')});
 await test('foreign and missing tokens do not consume either proof',async()=>{const b=await issue(),id=b.livenessToken;assert.equal((await h.routes.live.consumeLivenessChallenge('other@example.test',id)).state,'foreign');assert.equal((await h.routes.pose.consumePoseChallenge(IDS.b,id,b.pose.label)).state,'mismatch');assert.equal((await live('bad')).state,'missing');assert.equal((await pose('bad','')).state,'absent');assert.equal((await row('human_challenges',id)).status,'issued');assert.equal((await row('verification_challenges',id)).status,'active')});
 await test('already expired proofs do not verify',async()=>{const b=await issue(),id=b.livenessToken;await q("update human_challenges set expires_at=clock_timestamp()-interval '1 minute' where id=$1",[id]);await q("update verification_challenges set expires_at=clock_timestamp()-interval '1 minute' where challenge_token=$1",[id]);assert.equal((await live(id)).state,'expired');assert.equal((await pose(id,b.pose.label)).state,'expired');assert.equal((await row('human_challenges',id)).status,'expired');assert.equal((await row('verification_challenges',id)).status,'expired')});
 await test('consumer write failure rolls back and leaves proof available',async()=>{for(const [table,call] of [['human_challenges',b=>live(b.livenessToken)],['verification_challenges',b=>pose(b.livenessToken,b.pose.label)]]){const b=await issue();await q("create or replace function public.fixture_consume_fail() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$");await q(`create trigger fixture_consume_fail before update on ${table} for each row execute function public.fixture_consume_fail()`);try{await assert.rejects(()=>call(b))}finally{await q(`drop trigger fixture_consume_fail on ${table}`);await q('drop function public.fixture_consume_fail()')}assert.equal((await row(table,b.livenessToken)).status,table==='human_challenges'?'issued':'active');assert.equal((await call(b)).state,'verified')}});
}finally{for(const table of ['human_challenges','verification_challenges'])await q(`drop trigger if exists fixture_consume_fail on ${table}`);await q('drop function if exists public.fixture_consume_fail()');await q('delete from verification_challenges where user_id=$1',[IDS.a]);await q("delete from human_challenges where email=$1 and purpose='verification'",[email]);await h.close()}
if(failures)process.exitCode=1;
