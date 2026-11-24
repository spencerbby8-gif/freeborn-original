// Actual handlers + disposable LOCAL PostgreSQL. Auth/IP/moderation adapters substituted.
// Transaction rolled back. Never accepts a hosted database URL or touches live member data.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {eq} from 'drizzle-orm';
const connectionString=process.env.E2E_DATABASE_URL??'postgresql://postgres:postgres@127.0.0.1:5432/app_db';
if(!['localhost','127.0.0.1','::1'].includes(new URL(connectionString).hostname))throw Error('Disposable local database only');
const client=new pg.Client({connectionString});await client.connect();
const state={db:drizzle(client),user:null,failure:null};globalThis.__memberRuntime=state;
const replacements={
 '@/db':'export const db=globalThis.__memberRuntime.db',
 '@/lib/app-auth':'export async function getMember(){const s=globalThis.__memberRuntime;if(s.failure)throw s.failure;return s.user} export async function getLocalProfile(id){return globalThis.__memberRuntime.lookup(id)}',
 '@/lib/identity-resolve':'export async function suppressedUserIds(){return []}',
 '@/lib/ip-reputation':'export async function checkIpReputation(){return {ok:true}};export function clientIp(){return null}',
};
const bundle=await build({stdin:{contents:`export * as notifications from './src/app/api/notifications/route';export * as likes from './src/app/api/likes/route';export * as location from './src/app/api/location/route';export * as baselineLocation from 'baseline-location';export * as profiles from './src/app/api/profiles/route';export * as schema from './src/db/schema';export * from './src/lib/member-api-errors';export * from './src/lib/auth/signup-outcome';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',packages:'external',plugins:[{name:'local-runtime-adapters',setup(b){b.onResolve({filter:/^baseline-location$/},()=>({path:'baseline-location',namespace:'negative-control'}));b.onLoad({filter:/.*/,namespace:'negative-control'},async()=>({contents:(await readFile('src/app/api/location/route.ts','utf8')).replaceAll('source: "gps"','source: "browser"'),resolveDir:process.cwd()+'/src/app/api/location',loader:'ts'}));b.onResolve({filter:/^@\/(?:db|lib\/(?:app-auth|identity-resolve|ip-reputation))$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:replacements[a.path],loader:'js'}));}}]});
// Keep external package resolution anchored inside the checkout.
const {writeFile,unlink}=await import('node:fs/promises');const modulePath=new URL('./.member-runtime.build.mjs',import.meta.url);await writeFile(modulePath,bundle.outputFiles[0].text);const R=await import(modulePath.href+'?'+Date.now());
state.lookup=async id=>(await state.db.select().from(R.schema.userProfiles).where(eq(R.schema.userProfiles.id,id)).limit(1))[0]??null;
const me=randomUUID(),other=randomUUID();let n=0;const logs=[];const originalError=console.error;console.error=(...args)=>logs.push(args.join(' '));
const req=(path,body)=>new Request('http://local.test'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body:JSON.stringify(body),headers:{'content-type':'application/json'}})});
const check=async(name,fn)=>{await fn();console.log(`PASS ${++n} ${name}`)};
try{
 await client.query('begin');
 for(const [id,name]of [[me,'Viewer'],[other,'Other']]){
  await client.query('insert into accounts(id,email) values($1,$2)',[id,id+'@fixture.test']);
  await client.query("insert into user_profiles(id,email,display_name,birth_date,gender,profile_status,onboarding_stage,discoverable) values($1,$2,$3,'1998-01-02','woman','active','ready',true)",[id,id+'@fixture.test',name]);
 }
 state.user={id:me,email:me+'@fixture.test'};
 await client.query('insert into notification_preferences(user_id) values($1) on conflict do nothing',[me]);
 await client.query('alter table notification_preferences drop column dismissed_before');await client.query('savepoint missing_column');
 await check('Production-shaped missing dismissal column reproduces a real PostgreSQL 42703',async()=>{const r=await R.notifications.GET(req('/api/notifications'));assert.equal(r.status,503);const b=await r.json();assert.match(b.requestId,/^[a-f0-9-]{36}$/);assert(!('notifications' in b));assert(logs.some(s=>JSON.parse(s).databaseCode==='42703'));});
 await client.query('rollback to savepoint missing_column');
 const migration=await readFile('supabase/migrations/20261121210000_notification_dismissal.sql','utf8');
 await client.query(migration);await client.query(migration);
 await check('Existing additive migration restores actual notification GET and is idempotent',async()=>{const r=await R.notifications.GET(req('/api/notifications'));assert.equal(r.status,200);assert(Array.isArray((await r.json()).notifications));});
 await check('Clear feed writes the owner timestamp without deleting source data',async()=>{const before=await client.query('select count(*)::int n from user_swipes');assert.equal((await R.notifications.POST(req('/api/notifications',{action:'clear',userId:other}))).status,200);const after=await client.query('select dismissed_before from notification_preferences where user_id=$1',[me]);assert(after.rows[0].dismissed_before instanceof Date);assert.equal((await client.query('select count(*)::int n from user_swipes')).rows[0].n,before.rows[0].n);});
 await check('Discovery Pass persists an actual swipe and returns acknowledgement',async()=>{const r=await R.likes.POST(req('/api/likes',{profileId:other,choice:'pass'}));assert.equal(r.status,200);assert.equal((await client.query('select action from user_swipes where liker_id=$1 and liked_id=$2',[me,other])).rows[0].action,'pass');});
 await check('Discovery Like succeeds without fabricating a mutual match',async()=>{const r=await R.likes.POST(req('/api/likes',{profileId:other,choice:'like'}));assert.equal(r.status,200);assert.equal((await r.json()).matched,false);});
 await check('Mutual likes create a genuine match',async()=>{await client.query("insert into user_swipes(liker_id,liked_id,action) values($1,$2,'like')",[other,me]);const r=await R.likes.POST(req('/api/likes',{profileId:other,choice:'like'}));assert.equal(r.status,200);assert.equal((await r.json()).matched,true);});
 await client.query('savepoint old_location_source');
 await check('Negative control reproduces browser-source CHECK violation 23514 without weakening the schema',async()=>{const r=await R.baselineLocation.POST(req('/api/location',{lat:6.45,lng:7.5,accuracyM:30}));assert.equal(r.status,500);assert(logs.some(raw=>JSON.parse(raw).databaseCode==='23514'));});
 await client.query('rollback to savepoint old_location_source');
 await check('Location save uses actual coordinates and preserves refix rate limit',async()=>{const body={lat:6.45,lng:7.5,accuracyM:30};assert.equal((await R.location.POST(req('/api/location',body))).status,200);assert.equal((await client.query('select source from user_private_locations where user_id=$1',[me])).rows[0].source,'gps');assert.equal((await R.location.POST(req('/api/location',body))).status,429);});
 await check('Anonymous reads/writes cannot become success or mutate a member',async()=>{state.user=null;for(const [handler,url,body]of [[R.notifications.GET,'/api/notifications'],[R.notifications.POST,'/api/notifications',{action:'clear'}],[R.likes.POST,'/api/likes',{profileId:other,choice:'pass'}],[R.location.POST,'/api/location',{lat:0,lng:0}]])assert.equal((await handler(req(url,body))).status,401);state.user={id:me,email:me+'@fixture.test'};});
 await check('Transient database failures have operation-specific errors and correlation IDs',async()=>{state.failure={cause:{code:'08006',message:'SECRET SQL / GPS / email must never leak'}};for(const [handler,url,body]of [[R.notifications.GET,'/api/notifications'],[R.likes.POST,'/api/likes',{profileId:other,choice:'pass'}],[R.location.POST,'/api/location',{lat:6.45,lng:7.5}]]){const r=await handler(req(url,body));assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');const b=await r.json();assert(!JSON.stringify(b).includes('SECRET'));assert(b.requestId);}state.failure=null;});
 await check('Diagnostics omit SQL, identities, GPS and arbitrary upstream messages',async()=>{assert(logs.length>=4);for(const raw of logs){const log=JSON.parse(raw);assert.deepEqual(Object.keys(log).sort(),['databaseCode','event','operation','requestId']);assert(!raw.includes('SECRET'));}});
 const identity={id:'new-user',identities:[{provider:'email'}]};
 for(const [name,data,error,expected]of [
  ['new email identity',{user:identity,session:null},null,'confirmation-required'],
  ['obfuscated duplicate',{user:{id:'fake-user',identities:[]},session:null},null,'existing-account'],
  ['existing provider error',{user:null,session:null},{code:'user_already_exists'},'existing-account'],
  ['legacy duplicate error',{user:null,session:null},{message:'User already registered'},'existing-account'],
  ['genuine authenticated session',{user:identity,session:{access_token:'fixture'}},null,'signed-in'],
  ['absent user',{user:null,session:null},null,'unavailable'],
  ['missing identities',{user:{id:'ambiguous'},session:null},null,'unavailable'],
  ['provider failure',{user:null,session:null},{message:'unavailable'},'unavailable'],
 ])await check('Signup outcome: '+name,async()=>assert.equal(R.signupOutcome(data,error),expected));
 console.log(`PASS ${n} real local PostgreSQL/handler and signup classification checks. Auth/IP/moderation substituted; transaction rolled back; not hosted member acceptance.`);
}finally{console.error=originalError;await client.query('rollback').catch(()=>{});await client.end();await unlink(modulePath).catch(()=>{});delete globalThis.__memberRuntime;}
