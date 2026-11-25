// LOCAL ONLY: executes real route handlers + real PostgreSQL with substituted auth/notify adapters.
// Never import this module from app code. It refuses remote databases.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import fs from 'node:fs/promises';
export const IDS={a:'10000000-0000-4000-8000-000000000001',b:'10000000-0000-4000-8000-000000000002',c:'10000000-0000-4000-8000-000000000003',d:'10000000-0000-4000-8000-000000000004',match:'20000000-0000-4000-8000-000000000001',other:'20000000-0000-4000-8000-000000000002'};
const definitions={stories:'src/app/api/stories/route.ts',privacy:'src/app/api/stories/privacy/route.ts',story:'src/app/api/stories/[id]/route.ts',image:'src/app/api/stories/[id]/image/route.ts',views:'src/app/api/stories/[id]/views/route.ts',reply:'src/app/api/stories/[id]/reply/route.ts',quote:'src/app/api/stories/quotes/[id]/image/route.ts',preferences:'src/app/api/chat/preferences/route.ts',matches:'src/app/api/chat/matches/route.ts',notifications:'src/app/api/notifications/route.ts',messages:'src/app/api/chat/messages/route.ts',call:'src/app/api/calls/session/[id]/route.ts',callStart:'src/app/api/calls/session/route.ts'};
export async function createHarness(options={}){
 const selectedDefinitions={...definitions,...options.routes};
 const database=process.env.E2E_DATABASE_URL??'postgresql://postgres:postgres@127.0.0.1:5432/member_experience_test';
 const url=new URL(database);if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/member_experience_test')throw Error('Harness requires its explicitly named disposable loopback database.');
 if(process.env.SUPABASE_TRANSACTION_POOLER)throw Error('Unset managed database credentials before running tests.');
 process.env.DATABASE_URL=database;process.env.NEXT_PUBLIC_APP_URL='http://fixture.local';
 const file=path.resolve('scripts/member-experience/.routes.build.mjs');
 const entry=Object.entries(selectedDefinitions).map(([key,p])=>`import * as ${key} from './${p}';`).join('\n')+`\nexport const routes={${Object.keys(selectedDefinitions).join(',')}};export {pool} from './src/db';`;
 await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'local-routes.ts'},outfile:file,bundle:true,platform:'node',format:'esm',packages:'external',tsconfig:'tsconfig.json',plugins:[{name:'local-only-auth',setup(b){b.onResolve({filter:/^@\/lib\/(app-auth|chat-notify)$/},args=>({path:args.path,namespace:'local-adapter'}));if(options.apiAuth){b.onResolve({filter:/^@\/lib\/supabase\/api-auth$/},args=>({path:args.path,namespace:'sql-auth-adapter'}));b.onLoad({filter:/.*/,namespace:'sql-auth-adapter'},()=>({contents:`export async function createSupabaseClientForApi(request){return globalThis.__settingsSqlAuth(request)};export function createSessionlessSupabaseClient(){return globalThis.__settingsSqlAuth(null)};`,loader:'js'}));}b.onLoad({filter:/.*/,namespace:'local-adapter'},args=>({contents:args.path.endsWith('app-auth')?`export async function getMember(request){const token=request.headers.get('authorization')?.replace('Bearer ','');return globalThis.__memberTestIdentities?.[token]??null;}export async function getLocalProfile(id){return globalThis.__memberTestProfiles?.[id]??null;}`:`export function scheduleChatNotice(){}`,loader:'js'}));}}]});
 const {routes,pool}=await import(pathToFileURL(file).href+'?t='+Date.now());
 const identities=Object.fromEntries(['a','b','c','d'].map((key,i)=>[IDS[key],{id:IDS[key],email:`qa-${key}@example.test`,name:['QA River','QA Sage','QA Stranger','QA Sky'][i]}]));
 globalThis.__memberTestIdentities=identities;
 if(options.sqlProfiles)globalThis.__memberTestProfiles=Object.fromEntries(Object.entries(identities).map(([id,m])=>[id,{id,displayName:m.name,birthDate:"1995-01-01",occupation:"",interests:[],city:"Test city",isVerified:false}]));
 const client=new pg.Client({connectionString:database});await client.connect();
 // Production retains this legacy INSERT trigger, even though newer app chat
 // uses public.matches. Load its exact migration SQL only in the disposable DB.
 if(options.legacySwipeTrigger){const migration=await fs.readFile('supabase/migrations/20260709210000_phase3_discovery.sql','utf8');const start=migration.indexOf('create or replace function public.handle_mutual_swipe()');const end=migration.indexOf('-- Keep photo_count in sync',start);if(start<0||end<0)throw Error('Legacy trigger fixture not found');await client.query(migration.slice(start,end));}
 async function seed(){
  await client.query("alter table notification_preferences add column if not exists dismissed_before timestamptz");
  await client.query('delete from public.accounts where id=any($1::uuid[])',[Object.values(IDS).slice(0,4)]);
  for(const [i,key] of ['a','b','c','d'].entries()){
   await client.query('insert into public.accounts(id,email) values($1,$2)',[IDS[key],`qa-${key}@example.test`]);
   await client.query("insert into public.user_profiles(id,email,display_name,birth_date,profile_status,discoverable,onboarding_completed_at,city) values($1,$2,$3,'1995-01-01','active',false,now(),'Test city')",[IDS[key],`qa-${key}@example.test`,['QA River','QA Sage','QA Stranger','QA Sky'][i]]);
  }
  await client.query("insert into public.matches(id,user_a,user_b,status) values($1,$2,$3,'active'),($4,$2,$5,'active')",[IDS.match,IDS.a,IDS.b,IDS.other,IDS.d]);
 }
 async function request(route,method='GET',identity='a',body,ctx={},headers={}){
  const h=new Headers(headers);if(identity)h.set('authorization','Bearer '+(IDS[identity]??identity));
  if(body!==undefined&&!(body instanceof FormData)){h.set('content-type','application/json');body=JSON.stringify(body);}
  return routes[route][method](new Request('http://fixture.local/api/test'+(route==='messages'?'?match='+IDS.match:''),{method,headers:h,body}),{params:Promise.resolve(ctx)});
 }
 return {routes,pool,client,seed,request,identities,async close(){delete globalThis.__memberTestIdentities;delete globalThis.__memberTestProfiles;await client.end();await pool.end();}};
}
