// LOCAL ONLY: real HTTP handlers, disposable PostgreSQL, synthetic Auth. No external calls.
import assert from 'node:assert/strict';
import {createHarness,IDS} from '../member-experience/harness.mjs';
const routes={verification:'src/app/api/verification/route.ts',verificationCheck:'src/app/api/verification/check/route.ts',heartbeat:'src/app/api/heartbeat/route.ts',onboarding:'src/app/api/onboarding/route.ts',profileMe:'src/app/api/profile/me/route.ts',callTrace:'src/app/api/calls/trace/route.ts',interest:'src/app/api/events/interest/route.ts',callback:'src/app/api/auth/callback-exchange/route.ts'};
const h=await createHarness({routes,apiAuth:true});await h.seed();
let authCalls=0,profileWrites=0;globalThis.__settingsSqlAuth=async()=>{authCalls++;return {auth:{getUser:async()=>({data:{user:{id:IDS.a,email:h.identities[IDS.a].email}}})},from:()=>({update:()=>({eq:async()=>{profileWrites++;return {error:null}}})})}};
const make=(origin,body='{}')=>new Request('http://fixture.local/api/test',{method:'POST',headers:{authorization:`Bearer ${IDS.a}`,'content-type':'text/plain',...(origin?{origin}:{})},body});
let failures=0;try{
 for(const [name] of Object.entries(routes)){
  try{authCalls=0;const response=await h.routes[name].POST(make('https://attacker.example'));assert.equal(response.status,403);if(name==='onboarding'||name==='profileMe')assert.equal(authCalls,0);console.log('PASS foreign origin refused before auth or mutation: '+name)}catch(e){failures++;console.error('FAIL foreign origin: '+name+': '+e.message)}
 }
 for(const [name] of Object.entries(routes)){
  try{const response=await h.routes[name].POST(make('http://fixture.local'));assert.notEqual(response.status,403);assert.ok([200,400].includes(response.status),`unexpected ${response.status}`);console.log('PASS same-origin request reaches existing handling: '+name)}catch(e){failures++;console.error('FAIL same-origin: '+name+': '+e.message)}
 }
 try{const r=await h.routes.heartbeat.POST(make(null));assert.equal(r.status,200);console.log('PASS absent Origin remains permitted for same-origin/native compatibility')}catch(e){failures++;console.error('FAIL missing origin: '+e.message)}
 try{const payload=JSON.stringify({city:'Fixture City'});const bad=await h.routes.interest.POST(make('https://attacker.example',payload));assert.equal(bad.status,403);assert.equal((await h.client.query('select count(*)::int n from event_interests where user_id=$1',[IDS.a])).rows[0].n,0);const good=await h.routes.interest.POST(make('http://fixture.local',payload));assert.equal(good.status,200);assert.equal((await h.client.query('select city from event_interests where user_id=$1',[IDS.a])).rows[0].city,'Fixture City');console.log('PASS event interest: foreign text/plain cannot write, same-origin writes local DB')}catch(e){failures++;console.error('FAIL event interest write: '+e.message)}
 try{profileWrites=0;const payload=JSON.stringify({displayName:'Fixture Name'});assert.equal((await h.routes.profileMe.POST(make('https://attacker.example',payload))).status,403);assert.equal(profileWrites,0);assert.equal((await h.routes.profileMe.POST(make('http://fixture.local',payload))).status,200);assert.equal(profileWrites,1);console.log('PASS profile edit: foreign text/plain cannot write, same-origin reaches synthetic adapter')}catch(e){failures++;console.error('FAIL profile edit: '+e.message)}
}finally{await h.client.query("delete from event_interests where user_id=$1",[IDS.a]);delete globalThis.__settingsSqlAuth;await h.close()}
if(failures)process.exitCode=1;
