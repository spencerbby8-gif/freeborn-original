// Local SQL-backed PostgREST substitute. Auth provider methods are simulated, never hosted proof.
import {createHarness,IDS} from '../member-experience/harness.mjs';
export {IDS};
export const routes={webhook:'src/app/api/email/webhook/route.ts',onboardingComplete:'src/app/api/onboarding/complete/route.ts',settings:'src/app/api/settings/route.ts',account:'src/app/api/account/route.ts',exportData:'src/app/api/account/export/route.ts',support:'src/app/api/support/route.ts',adminSupport:'src/app/api/admin/support/route.ts',notices:'src/app/api/member-notices/route.ts',emailPreferences:'src/app/api/email/preferences/route.ts',unsubscribe:'src/app/api/email/unsubscribe/route.ts',dispatch:'src/app/api/internal/email-dispatch/route.ts',blocks:'src/app/api/blocks/route.ts',consent:'src/app/api/verification/consent/route.ts',verification:'src/app/api/verification/route.ts',appeals:'src/app/api/appeals/route.ts'};
export async function setup(){
 const h=await createHarness({routes,apiAuth:true});await h.seed();
 await h.client.query('delete from appeals where email=any($1::text[])',[Object.values(h.identities).map(m=>m.email)]);
 const state={authUpdates:[],authFailure:false,sqlFailure:false};
 for(const [id,m]of Object.entries(h.identities))await h.client.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) on conflict(id) do update set email=excluded.email,email_confirmed_at=now(),deleted_at=null',[id,m.email]);
 const ident=s=>{if(!/^[a-z_]+$/.test(s))throw Error('invalid local SQL identifier');return '"'+s+'"'};
 globalThis.__settingsSqlAuth=request=>{
  const id=request?.headers.get('authorization')?.replace('Bearer ','');const member=h.identities[id];
  return {auth:{async getUser(){return {data:{user:member?{...member,email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{}}:null},error:null}},async signInWithPassword(p){return {error:p.password==='test-current-password'?null:{message:'Invalid credentials'}}},async signOut(){return {error:null}},async updateUser(p){state.authUpdates.push(p);return {error:state.authFailure?{message:'Simulated provider outage'}:null}}},from(table){
   let mode='select',columns='*',patch,filters=[],single=false,limit,order='',conflict='user_id';
   const q={select(c='*'){columns=c;return q},update(p){mode='update';patch=p;return q},upsert(p,o){mode='upsert';patch=p;conflict=o?.onConflict??'user_id';return q},insert(p){mode='insert';patch=p;return q},eq(k,v){filters.push([k,v]);return q},is(k,v){filters.push([k,v]);return q},order(k,o){order=' order by '+ident(k)+(o?.ascending===false?' desc':' asc');return q},limit(n){limit=n;return q},maybeSingle(){single=true;return q},single(){single=true;return q},async then(resolve,reject){try{
    if(state.sqlFailure)throw Error('Simulated PostgREST outage');
    let text,values=[];const where=()=>filters.length?' where '+filters.map(([k,v])=>v===null?ident(k)+' is null':(values.push(v),ident(k)+'=$'+values.length)).join(' and '):'';
    if(mode==='select'){text='select '+(columns==='*'?'*':columns.split(',').map(c=>ident(c.trim())).join(','))+' from public.'+ident(table)+where()+order+(limit?' limit '+Number(limit):'');}
    else{const keys=Object.keys(patch);if(mode==='update'){if(!keys.length)return resolve({data:null,error:null});values=keys.map(k=>patch[k]);text='update public.'+ident(table)+' set '+keys.map((k,i)=>ident(k)+'=$'+(i+1)).join(',')+where();}
    else {values=keys.map(k=>patch[k]);text='insert into public.'+ident(table)+' ('+keys.map(ident).join(',')+') values ('+keys.map((k,i)=>'$'+(i+1)).join(',')+')';if(mode==='upsert')text+=' on conflict('+ident(conflict)+') do update set '+keys.filter(k=>k!==conflict).map(k=>ident(k)+'=excluded.'+ident(k)).join(',');}
    text+=' returning *';}
    const {rows}=await h.client.query(text,values);resolve({data:single?(rows[0]??null):rows,error:null});
   }catch(error){if(reject&&error.fatal)return reject(error);resolve({data:null,error:{message:error.message,code:error.code}});}}};return q;
  }};
 };
 return {...h,state,async close(){delete globalThis.__settingsSqlAuth;await h.close();}};
}
