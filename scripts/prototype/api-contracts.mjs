// Local handler contract tests. Auth and database adapters are deliberately
// substituted: this does NOT prove hosted Supabase/RLS acceptance.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const state = {
  user: { id: 'owner-fixture', email: 'owner@example.test' },
  rows: {}, readError: null, writeError: null, writes: [], selects: [],
};
globalThis.__freebornContract = state;
const virtual = {
  '@/lib/supabase/api-auth': `export async function createSupabaseClientForApi(){return {
    auth:{getUser:async()=>({data:{user:globalThis.__freebornContract.user}})},
    from(table){const s=globalThis.__freebornContract;const q={select(){return q},eq(){return q},
      async maybeSingle(){return {data:s.rows[table]??null,error:s.readError}},
      update(patch){s.writes.push({table,patch});return q},
      async upsert(patch){s.writes.push({table,patch});return {error:s.writeError}},
      then(ok,bad){return Promise.resolve({error:s.writeError}).then(ok,bad)}};return q}
  }}`,
  '@/lib/supabase/server':'export async function createSupabaseServerClient(){throw Error("Unexpected hosted client")}',
  '@/lib/app-auth': 'export async function getMember(){return globalThis.__freebornContract.user}',
  '@/db': `export const db={
    select(){const q={from(){return q},where(){return q},orderBy(){return q},limit(){return q},then(ok,bad){return Promise.resolve(globalThis.__freebornContract.selects.shift()??[]).then(ok,bad)}};return q},
    insert(table){return {values(patch){globalThis.__freebornContract.writes.push({table,patch});return {async onConflictDoUpdate(config){globalThis.__freebornContract.writes.at(-1).conflict=config}}}}}
  }`,
};
const bundle = await build({
  stdin: { contents: `export * as settings from './src/app/api/settings/route';export * as notifications from './src/app/api/notifications/route';export * as profileMe from './src/app/api/profile/me/route';export * as onboarding from './src/lib/onboarding-store';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'isolated-contract-adapters', setup(b) {
    b.onResolve({filter:/^@\/(?:lib\/(?:supabase\/(?:api-auth|server)|app-auth)|db)$/}, args=>({path:args.path,namespace:'contract'}));
    b.onLoad({filter:/.*/,namespace:'contract'},args=>({contents:virtual[args.path],loader:'js'}));
  }}],
});
const {settings,notifications,profileMe,onboarding}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
async function notificationGet(request){if(state.user)state.selects.splice(1,0,[]);return notifications.GET(request);}
let passed=0;
function ok(name,fn){fn();passed++;console.log(`ok ${passed} - ${name}`)}
function req(body,method='POST'){return new Request('http://local.test/api/test',{method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});}
function reset(){state.user={id:'owner-fixture',email:'owner@example.test'};state.rows={};state.readError=null;state.writeError=null;state.writes=[];state.selects=[];}
reset();state.user=null;
for(const [name,handler,request] of [['settings read',settings.GET,req(undefined,'GET')],['settings write',settings.POST,req({profile:{interests:['Hiking']}})],['notification read',notifications.GET,req(undefined,'GET')],['notification clear',notifications.POST,req({action:'clear'})]]){
 const r=await handler(request);ok(`${name} rejects an unauthenticated member`,()=>assert.equal(r.status,401));
}
ok('unauthenticated handlers performed no writes',()=>assert.equal(state.writes.length,0));
reset();state.rows={user_profiles:{interests:['Hiking'],relationship_goals:['long_term']},discovery_preferences:{relationship_intents:['friendship']}};
let response=await settings.GET(req(undefined,'GET'));let body=await response.json();
ok('settings returns actual profile interests and saved discovery intents',()=>{assert.deepEqual(body.profile.interests,['Hiking']);assert.deepEqual(body.discovery.relationshipIntents,['friendship']);});
state.readError={message:'adapter unavailable'};response=await settings.GET(req(undefined,'GET'));ok('settings read failure is not converted into writable defaults',()=>assert.equal(response.status,500));
for(const [name,value] of [['non-array','Hiking'],['blank',['  ']],['overlong',['x'.repeat(61)]],['too many',Array(21).fill('Hiking')]]){
 reset();response=await settings.POST(req({profile:{interests:value}}));ok(`${name} interests are rejected before write`,()=>{assert.equal(response.status,400);assert.equal(state.writes.length,0)});
}
reset();response=await settings.POST(req({profile:{interests:[' Hiking ','Hiking','Travel']}}));ok('interests are trimmed and deduplicated on the authenticated owner',()=>{assert.equal(response.status,200);assert.deepEqual(state.writes[0].patch.interests,['Hiking','Travel']);});
reset();response=await settings.POST(req({discovery:{relationshipIntents:['unsupported']}}));ok('unsupported discovery intention is rejected',()=>{assert.equal(response.status,400);assert.equal(state.writes.length,0)});
reset();response=await settings.POST(req({discovery:{user_id:'other-owner',relationshipIntents:['friendship','friendship']}}));ok('discovery intentions deduplicate and cannot choose another owner',()=>{assert.equal(response.status,200);assert.deepEqual(state.writes[0].patch,{user_id:'owner-fixture',relationship_intents:['friendship']});});
reset();state.writeError={message:'adapter write refused'};response=await settings.POST(req({profile:{interests:['Hiking']}}));ok('failed persistence returns a failure, never a save confirmation',()=>assert.equal(response.status,500));
reset();response=await notifications.POST(new Request('http://local.test',{method:'POST',body:'{'}));ok('notification malformed JSON is rejected',()=>assert.equal(response.status,400));
reset();response=await notifications.POST(req({action:'delete-everything'}));ok('unknown notification action cannot write',()=>{assert.equal(response.status,400);assert.equal(state.writes.length,0)});
reset();const before=Date.now();response=await notifications.POST(req({action:'clear',userId:'other-owner',dismissedBefore:'2099-01-01'}));const write=state.writes[0];
ok('clear uses the authenticated owner, never the body owner',()=>{assert.equal(response.status,200);assert.equal(write.patch.userId,'owner-fixture')});
ok('clear cutoff is a server timestamp, not client-supplied time',()=>assert.ok(write.patch.dismissedBefore.getTime()>=before&&write.patch.dismissedBefore.getTime()<=Date.now()));
ok('clear only updates dismissal and preferences bookkeeping, not source messages',()=>{assert.equal(state.writes.length,1);assert.deepEqual(Object.keys(write.conflict.set).sort(),['dismissedBefore','updatedAt']);});
reset();state.selects=[[],[],[],[]];response=await notificationGet(req(undefined,'GET'));body=await response.json();ok('new feed keeps the existing welcome notification',()=>assert.equal(body.notifications[0]?.id,'tip-1'));
reset();state.selects=[[],[],[],[{dismissedBefore:new Date(),matchAlerts:true,messageAlerts:true,likeAlerts:true}]];response=await notificationGet(req(undefined,'GET'));body=await response.json();ok('dismissed feed does not recreate the synthetic welcome notification',()=>assert.deepEqual(body.notifications,[]));
reset();const cutoff=new Date('2026-11-20T12:00:00Z');state.selects=[[],[{likerId:'one',action:'like',createdAt:cutoff},{likerId:'two',action:'like',createdAt:new Date(cutoff.getTime()+1)}],[{id:'one',displayName:'One'}],[],[{id:'two',displayName:'Two'}],[],[],[{dismissedBefore:cutoff,matchAlerts:true,messageAlerts:true,likeAlerts:true}]];response=await notificationGet(req(undefined,'GET'));body=await response.json();ok('clear excludes the cutoff boundary but keeps newer real events',()=>{assert.equal(body.notifications.length,1);assert.equal(body.notifications[0].title,'Two liked you');});
reset();response=await settings.POST(req({privacy:{user_id:'other',hideDistance:true,hideActiveStatus:true,discoveryPaused:true,incognito:true,readReceipts:false}}));ok('Privacy persistence maps flags to the authenticated owner only',()=>{assert.equal(response.status,200);assert.deepEqual(state.writes[0].patch,{user_id:'owner-fixture',hide_distance:true,hide_active_status:true,discovery_paused:true,incognito:true,read_receipts:false});});
reset();response=await settings.POST(req({profile:{messagePrivacy:'verified',discoverPrivacy:'unvaccinated'}}));ok('Audience controls persist recognized values',()=>{assert.equal(response.status,200);assert.equal(state.writes[0].patch.message_privacy,'verified');assert.equal(state.writes[0].patch.discover_privacy,'unvaccinated');});
reset();response=await profileMe.POST(req({language:'Igbo',religion:'Buddhist',occupation:'Cybersecurity'}));ok('Expanded language, religion and work fields use the actual edit-profile handler',()=>{assert.equal(response.status,200);assert.deepEqual(state.writes[0].patch,{language:'Igbo',religion:'Buddhist',occupation:'Cybersecurity'});});
reset();const suppliedClient={from(table){return{update(patch){state.writes.push({table,patch});return{async eq(column,value){state.writes.at(-1).where={column,value};return{error:state.writeError}}}}}}};let nextStep=await onboarding.applyStepPatch('owner-fixture','fixture@example.test','bio',{bio:'A genuine introduction that is long enough.',language:' Igbo ',religion:' Buddhist ',occupation:'Cybersecurity'},suppliedClient);ok('New onboarding choices actually map to saved profile columns',()=>{assert.equal(nextStep,'interests');assert.equal(state.writes[0].patch.language,'Igbo');assert.equal(state.writes[0].patch.religion,'Buddhist');assert.deepEqual(state.writes[0].where,{column:'id',value:'owner-fixture'});});
reset();state.writeError={message:'fixture refused'};let threw=false;try{await onboarding.applyStepPatch('owner-fixture','fixture@example.test','bio',{language:'Igbo'},suppliedClient)}catch{threw=true}ok('Onboarding persistence failure is thrown rather than advancing',()=>assert.equal(threw,true));
console.log(`PASS ${passed} local API contract assertions (substituted adapters; no remote database or RLS claim).`);
delete globalThis.__freebornContract;
