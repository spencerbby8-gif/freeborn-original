// LOCAL ONLY. Real handler + disposable DB; Auth and IP reputation are synthetic.
import assert from 'node:assert/strict';
import {createHarness,IDS} from '../member-experience/harness.mjs';
const previous=globalThis.fetch;let calls=0;
globalThis.fetch=async url=>{calls++;assert.match(String(url),/^http:\/\/ip-api\.com\/json\//);return Response.json({status:'success',hosting:true,proxy:false,isp:'synthetic fixture'})};
const h=await createHarness({routes:{security:'src/app/api/security/check/route.ts'}});await h.seed();const email=h.identities[IDS.a].email,q=(s,p=[])=>h.client.query(s,p);let failures=0;
async function reset(){await q('delete from suspensions where email=$1',[email]);await q('delete from security_events where email=$1',[email]);calls=0}
async function check(name,fn){try{await reset();await fn();console.log('PASS '+name)}catch(e){failures++;console.error('FAIL '+name+': '+e.message)}}
const req=(identity,origin,ip='198.51.100.10')=>h.request('security','POST',identity,{}, {},{...(origin?{origin}:{}),'x-nf-client-connection-ip':ip});
try{
 await check('foreign origin cannot reach reputation service or create a suspension',async()=>{const r=await req('a','https://attacker.example');assert.equal(r.status,403);assert.equal(calls,0);assert.equal((await q('select count(*)::int n from suspensions where email=$1',[email])).rows[0].n,0);assert.equal((await q('select count(*)::int n from security_events where email=$1',[email])).rows[0].n,0)});
 await check('signed-out requests remain unauthorized',async()=>{assert.equal((await req(null,'http://fixture.local')).status,401);assert.equal(calls,0)});
 await check('same-origin datacenter verdict still creates the existing suspension',async()=>{const r=await req('a','http://fixture.local');assert.equal(r.status,200);assert.equal((await r.json()).suspended,true);assert.equal(calls,1);assert.equal((await q('select count(*)::int n from suspensions where email=$1 and active',[email])).rows[0].n,1)});
 await check('same-origin existing suspension is returned without an external call',async()=>{await q("insert into suspensions(email,reason,active) values($1,'fixture',true)",[email]);const r=await req('a','http://fixture.local');assert.equal(r.status,200);assert.equal((await r.json()).suspended,true);assert.equal(calls,0)});
 await check('missing Origin remains allowed under the common guard policy',async()=>{const r=await req('a',null,'127.0.0.1');assert.equal(r.status,200);assert.equal((await r.json()).suspended,false);assert.equal(calls,0)});
}finally{await reset();await h.close();globalThis.fetch=previous}
if(failures)process.exitCode=1;
