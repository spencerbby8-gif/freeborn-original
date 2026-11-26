// Local only: real route handlers and disposable loopback PostgreSQL; fake auth, no real members.
import assert from 'node:assert/strict';
import {createHarness,IDS} from '../member-experience/harness.mjs';
const h=await createHarness({routes:{blocks:'src/app/api/blocks/route.ts',media:'src/app/api/chat/media/[id]/route.ts',unmatch:'src/app/api/chat/unmatch/route.ts'}});
const checks=[];
async function check(name,fn){try{await fn();checks.push(true);console.log('PASS '+name)}catch(e){checks.push(false);console.error('FAIL '+name,e)}}
const q=(text,params=[])=>h.client.query(text,params);
const block=(who,other,method='POST')=>h.request('blocks',method,who,{profileId:IDS[other]});
const status=async()=>(await q('select status from matches where id=$1',[IDS.match])).rows[0].status;
const mediaId='30000000-0000-4000-8000-000000000001';
const media=(who)=>h.request('media','GET',who,undefined,{id:mediaId});
try{
 await h.seed();
 await q("insert into messages(match_id,sender_id,body) values($1,$2,'Synthetic historical hello')",[IDS.match,IDS.a]);
 await q("insert into chat_media(id,match_id,sender_id,kind,mime,data) values($1,$2,$3,'image','image/png',decode('01020304','hex'))",[mediaId,IDS.match,IDS.a]);
 await q("insert into user_swipes(liker_id,liked_id,action) values($1,$2,'like'),($2,$1,'like')",[IDS.a,IDS.b]);
 await check('Both members can read retained media before block',async()=>{for(const who of ['a','b'])assert.equal((await media(who)).status,200)});
 await check('Blocking removes active match and denies both members sending',async()=>{assert.equal((await block('a','b')).status,200);assert.equal(await status(),'blocked');for(const who of ['a','b'])assert.equal((await h.request('messages','POST',who,{match:IDS.match,text:'blocked test'})).status,403)});
 await check('Blocked pair suppressed from active match and like alerts',async()=>{for(const who of ['a','b']){const r=await h.request('notifications','GET',who);assert.equal(r.status,200);const n=(await r.json()).notifications;assert.equal(n.some(x=>x.id==='match-'+IDS.match||x.id.startsWith('like-'+(who==='a'?IDS.b:IDS.a)+'-')),false)}});
 await check('Unblock restores original match, messages and media',async()=>{assert.equal((await block('a','b','DELETE')).status,200);assert.equal(await status(),'active');for(const who of ['a','b']){const r=await h.request('messages','GET',who);assert.equal(r.status,200);assert.ok((await r.json()).messages.some(x=>x.body==='Synthetic historical hello'));const m=await media(who);assert.equal(m.status,200);assert.deepEqual(Buffer.from(await m.arrayBuffer()),Buffer.from([1,2,3,4]));const list=await h.request('matches','GET',who);assert.ok((await list.json()).matches.some(x=>x.id===IDS.match&&!x.ended))}});
 await check('Old mutual like is not replayed as a like-back notification',async()=>{for(const who of ['a','b']){const n=(await(await h.request('notifications','GET',who)).json()).notifications;assert.equal(n.some(x=>x.id.startsWith('like-'+(who==='a'?IDS.b:IDS.a)+'-')),false);assert.equal(n.filter(x=>x.id==='match-'+IDS.match).length,1)}});
 await check('Opposite-direction block prevents restoration until both independently removed',async()=>{assert.equal((await block('a','b')).status,200);assert.equal((await block('b','a')).status,200);assert.equal((await block('a','b','DELETE')).status,200);assert.equal(await status(),'blocked');assert.equal((await h.request('messages','POST','a',{match:IDS.match,text:'blocked'})).status,403);assert.equal((await block('b','a','DELETE')).status,200);assert.equal(await status(),'active')});
 await check('Explicit unmatch is never restored by block and unblock',async()=>{const r=await h.request('unmatch','POST','a',{with:IDS.b,destructive:true});assert.equal(r.status,200);assert.equal(await status(),'unmatched');await block('a','b');await block('a','b','DELETE');assert.equal(await status(),'unmatched')});
 await check('Parallel opposite block and unblock never restore over remaining block',async()=>{await q("update matches set status='active',unmatched_by=null,unmatched_at=null where id=$1",[IDS.match]);await block('a','b');await Promise.all([block('a','b','DELETE'),block('b','a')]);const remaining=(await q('select count(*)::int n from blocked_users where (blocker_id=$1 and blocked_id=$2) or (blocker_id=$2 and blocked_id=$1)',[IDS.a,IDS.b])).rows[0].n;assert.equal(remaining,1);assert.equal(await status(),'blocked')});
}finally{await h.close()}
if(checks.some(x=>!x))process.exitCode=1;
