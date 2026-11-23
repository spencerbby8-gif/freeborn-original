// Production route logic with deterministic auth/DB adapters, NOT hosted RLS acceptance.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const S={user:{id:'viewer'},queue:[]};globalThis.__discovery=S;
const mocks={
 '@/lib/app-auth':'export async function getMember(){return globalThis.__discovery.user}',
 '@/lib/identity-resolve':'export async function suppressedUserIds(){if(globalThis.__discovery.suppressionError)throw Error("Suppression unavailable");return globalThis.__discovery.suppressed??[]}',
 '@/db':`export const db={select(){const q={from(){return q},where(){return q},orderBy(){return q},limit(){return q},groupBy(){return q},then(ok,bad){if(!globalThis.__discovery.queue.length)throw Error('Unexpected DB read');return Promise.resolve(globalThis.__discovery.queue.shift()).then(ok,bad)}};return q}}`,
};
const built=await build({stdin:{contents:`export * as profiles from './src/app/api/profiles/route';export * as filters from './src/components/app/filters';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@\/(?:db|lib\/(?:app-auth|identity-resolve))$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
const {profiles,filters}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const now=new Date();const A={id:'a',displayName:'Ada',firstName:'Ada',birthDate:'1998-01-02',createdAt:now,lastActiveAt:now,gender:'woman',occupation:'Teacher',educationLevel:"Bachelor's degree",religion:'Christian',language:'English',city:'City',vaccinationStatus:'vaccinated',isVerified:false,values:['Kindness'],interests:['Hiking'],lifestylePreferences:['Active lifestyle'],relationshipGoals:['long_term'],maritalStatus:'Never married',hasKids:'No kids',wantsKids:'Want kids',drinking:'Socially',smoking:'Never',promptAnswers:[],bio:'A profile'};
const B={...A,id:'b',displayName:'Bea',occupation:'Engineer',educationLevel:"Master's degree",gender:'man',religion:'Muslim',language:'Igbo',vaccinationStatus:'unvaccinated',isVerified:true,interests:['Music'],relationshipGoals:['friendship']};
async function get(params='',o={}){
 S.queue=[[{isVerified:o.viewerVerified??true,vaccinationStatus:'vaccinated',values:[],interests:[],relationshipGoals:[]}],o.blocks??[],o.swipes??[],[o.prefs??{ageMin:18,ageMax:99,distanceKm:500,showGenders:[],relationshipIntents:[],verifiedOnly:false,photosRequired:true,vaccinationPreference:'any'}],o.rows??[A,B],[],o.privacy??[],[],[],[{userId:'a',storagePath:'a.jpg',isPrimary:true,position:0},{userId:'b',storagePath:'b.jpg',isPrimary:true,position:0}],o.locations??[{userId:'viewer',latitude:0,longitude:0},{userId:'a',latitude:0,longitude:.01},{userId:'b',latitude:0,longitude:5}],[]];
 const r=await profiles.GET(new Request('http://local.test/api/profiles?'+params));return {status:r.status,...await r.json()};
}
let n=0;async function check(name,fn){await fn();console.log('ok '+(++n)+' - '+name)}
const ids=r=>r.profiles.map(p=>p.id).sort();
S.user=null;await check('Anonymous discovery is refused',async()=>assert.equal((await get()).status,401));S.user={id:'viewer'};
await check('Unfiltered fixture has exactly two real-shape results',async()=>assert.deepEqual(ids(await get()),['a','b']));
for(const [query,id] of [['gender=woman','a'],['interests=Music','b'],['intent=long_term','a'],['religion=Muslim','b'],['language=Igbo','b'],['occupation=Teacher','a'],['education=Master%27s%20degree','b'],['verified=1','b'],['vax=vaccinated','a'],['lifestyle=Active%20lifestyle','a']])await check('Actual handler applies '+query,async()=>{const result=ids(await get(query));assert.ok(result.includes(id));if(!query.startsWith('lifestyle'))assert.equal(result.length,1);});
await check('Incompatible age range excludes rather than fabricates',async()=>assert.deepEqual(ids(await get('ageMin=60')),[]));
await check('Incoming block hides candidate',async()=>assert.deepEqual(ids(await get('',{blocks:[{blockerId:'a',blockedId:'viewer'}]})),['b']));
await check('Outgoing block hides candidate',async()=>assert.deepEqual(ids(await get('',{blocks:[{blockerId:'viewer',blockedId:'b'}]})),['a']));
await check('Swiped candidate does not silently recycle',async()=>assert.deepEqual(ids(await get('',{swipes:[{likedId:'a'}]})),['b']));
await check('Paused profile is excluded',async()=>assert.deepEqual(ids(await get('',{privacy:[{userId:'a',discoveryPaused:true}]})),['b']));
await check('Incognito stranger is excluded',async()=>assert.deepEqual(ids(await get('',{privacy:[{userId:'a',incognito:true}]})),['b']));
await check('Verified audience refuses unverified viewer',async()=>assert.deepEqual(ids(await get('',{viewerVerified:false,rows:[{...A,discoverPrivacy:'verified'},B]})),['b']));
await check('Distance hidden in JSON, not merely in CSS',async()=>{const r=await get('distance=40',{privacy:[{userId:'a',hideDistance:true}]});assert.equal(r.profiles[0].distanceKm,null);assert.equal(r.profiles[0].hideDistance,true);assert.ok(!JSON.stringify(r).includes('latitude'));});
await check('Saved location enforces distance without browser GPS',async()=>assert.deepEqual(ids(await get('distance=40')),['a']));
await check('Anywhere explicitly overrides saved distance cap',async()=>assert.deepEqual(ids(await get('distance=500',{prefs:{distanceKm:5,photosRequired:true}})),['a','b']));
await check('Missing origin never silently ignores a distance cap',async()=>{const r=await get('distance=40',{locations:[]});assert.deepEqual(r.profiles,[]);assert.equal(r.locationRequired,true);});
await check('Hidden active status is null and cannot be selected with active-only',async()=>{const o={privacy:[{userId:'a',hideActiveStatus:true}]};const r=await get('',o);assert.equal(r.profiles.find(p=>p.id==='a').presence,null);assert.deepEqual(ids(await get('online=1',o)),['b']);});
await check('Explicit Everyone/Any/off clear restrictive saved defaults',async()=>{const r=await get('gender=&intent=&vax=any&verified=0',{prefs:{showGenders:['woman'],relationshipIntents:['long_term'],vaccinationPreference:'vaccinated',verifiedOnly:true,distanceKm:500,photosRequired:true}});assert.deepEqual(ids(r),['a','b']);});
await check('Query builder encodes cleared and default choices explicitly',async()=>{const q=filters.buildProfileParams({...filters.DEFAULT_FILTERS},null);for(const [key,val]of Object.entries({gender:'',intent:'',vax:'any',verified:'0',distance:'500',ageMin:'18',ageMax:'99'}))assert.equal(q.get(key),val);});
await check('Combined lifestyle/values selection matches declared profile values',async()=>{const r=await get('lifestyle=Kindness');assert.equal(r.profiles.length,2);});
await check('Everyone with all optional restrictions cleared includes both genders and no-photo members',async()=>{const r=await get('gender=&intent=&vax=any&verified=0&photos=0&distance=500&ageMin=18&ageMax=99',{rows:[A,B,{...A,id:'c',displayName:'No photo'}],prefs:{photosRequired:true,distanceKm:5,showGenders:['woman'],relationshipIntents:['friendship'],verifiedOnly:true}});assert.deepEqual(ids(r),['a','b','c']);});
await check('Everyone cannot override a restricted audience',async()=>{const r=await get('gender=&verified=0&photos=0&distance=500',{viewerVerified:false,rows:[{...A,discoverPrivacy:'verified'},B]});assert.deepEqual(ids(r),['b']);});
await check('Unknown audience rule fails closed',async()=>assert.deepEqual(ids(await get('',{rows:[{...A,discoverPrivacy:'unknown'},B]})),['b']));
await check('Candidate chips and health declaration are actually returned from stored profile fields',async()=>{const r=await get();const p=r.profiles.find(p=>p.id==='b');assert.deepEqual(p.relationshipGoals,['friendship']);assert.equal(p.vaccinationStatus,'unvaccinated');assert.equal(p.verified,true);});
await check('Suppression lookup failure cannot return an unfiltered deck',async()=>{S.suppressionError=true;try{await assert.rejects(()=>get(),/Suppression unavailable/);}finally{S.suppressionError=false;}});
console.log(`PASS ${n} production discovery/filter/privacy logic checks with substituted adapters. No hosted RLS or SQL acceptance claim.`);delete globalThis.__discovery;
