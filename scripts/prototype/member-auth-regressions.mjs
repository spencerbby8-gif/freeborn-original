// Production getMember + real local PostgreSQL temp tables; never hosted member writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {build} from 'esbuild';
import pg from 'pg';
import {getTableColumns} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
const connectionString=process.env.FREEBORN_AUTH_TEST_DB_URL;
if(!connectionString)throw Error('Set FREEBORN_AUTH_TEST_DB_URL to a disposable local database.');
if(!['127.0.0.1','localhost'].includes(new URL(connectionString).hostname))throw Error('Local database only');
const client=new pg.Client({connectionString});await client.connect();
const id='11111111-1111-4111-8111-111111111111',old='22222222-2222-4222-8222-222222222222';
const S={user:{id,email:'recreated@example.test',user_metadata:{}},db:drizzle(client),authError:false};globalThis.__memberAuthRegression=S;
const outfile=new URL('./.member-auth-regression.build.mjs',import.meta.url);
let count=0;async function check(name,fn){await fn();console.log(`ok ${++count} - ${name}`);}
async function load(source){
 const result=await build({stdin:{contents:source+'\nexport {accounts,userProfiles};',resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',packages:'external',plugins:[{name:'local-adapters',setup(b){
 b.onResolve({filter:/^@\/(?:db|lib\/supabase\/api-auth)$/},a=>({path:a.path,namespace:'adapter'}));
 b.onLoad({filter:/.*/,namespace:'adapter'},a=>({contents:a.path==='@/db'?'export const db=globalThis.__memberAuthRegression.db;':`export async function createSupabaseClientForApi(){const S=globalThis.__memberAuthRegression;return {auth:{async getUser(){if(S.authError)throw Error('Auth unavailable');return {data:{user:S.user},error:S.authResponseError}}},from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{display_name:'New member'}}}}}}}`,loader:'js'}));
 }}]});await writeFile(outfile,result.outputFiles[0].text);return import(outfile.href+'?'+Math.random());
}
try{
 await client.query('begin');
 await client.query('create extension if not exists citext with schema public');
 await client.query('set local search_path = pg_temp, public, extensions');
 const current=await readFile('src/lib/app-auth.ts','utf8');
 const baseline=await load(current.replace('.onConflictDoNothing();','.onConflictDoNothing({ target: accounts.id });'));
 for(const [name,table] of [['accounts',baseline.accounts],['user_profiles',baseline.userProfiles]]){
  const columns=Object.values(getTableColumns(table)).map(c=>`"${c.name}" ${c.getSQLType()}${c.name==='id'?' primary key':c.name==='email'?' unique not null':''}`);
  await client.query(`create temporary table ${name} (${columns.join(',')})`);
 }
 await client.query('insert into accounts (id,email) values ($1,$2)',[old,S.user.email]);
 await client.query('insert into user_profiles (id,email,discoverable) values ($1,$2,true)',[id,S.user.email]);

 await client.query('savepoint negative_control');
 await check('Negative control reproduces recreated-email unique violation in the old guard',async()=>{
  await assert.rejects(()=>baseline.getMember(new Request('https://local.test/api/profiles')),e=>e.cause?.code==='23505'||e.code==='23505');
 });await client.query('rollback to savepoint negative_control');
 const fixed=await load(current);
 await check('Recreated email resolves the verified current UUID, not legacy mirror UUID',async()=>{const m=await fixed.getMember(new Request('https://local.test/api/profiles'));assert.equal(m.id,id);assert.equal(m.name,'New member');});
 await check('Read guard neither merges identities nor rewrites existing member visibility',async()=>{
  assert.deepEqual((await client.query('select id,email from accounts')).rows,[{id:old,email:S.user.email}]);
  assert.equal((await client.query('select discoverable from user_profiles where id=$1',[id])).rows[0].discoverable,true);
 });
 await check('Repeat member reads stay idempotent',async()=>assert.equal((await fixed.getMember(new Request('https://local.test'))).id,id));
 await check('Unauthenticated callers cannot create a mirror',async()=>{S.user=null;assert.equal(await fixed.getMember(new Request('https://local.test')),null);assert.equal((await client.query('select count(*)::int n from accounts')).rows[0].n,1);});
 await check('Provider outage responses do not masquerade as a lost session',async()=>{S.authResponseError={status:503};try{await assert.rejects(()=>fixed.getMember(new Request('https://local.test')),/temporarily unavailable/);}finally{S.authResponseError=null;}});
 await check('Invalid token responses still resolve as unauthenticated',async()=>{S.authResponseError={status:401};try{assert.equal(await fixed.getMember(new Request('https://local.test')),null);}finally{S.authResponseError=null;}});
 await check('Upstream failure remains an error, not a fabricated signed-out result',async()=>{S.authError=true;await assert.rejects(()=>fixed.getMember(new Request('https://local.test')),/Auth unavailable/);});
 console.log(`PASS ${count} member-auth regression checks (local PostgreSQL + substituted auth adapter only).`);
}finally{await client.query('rollback').catch(()=>{});await client.end();await unlink(outfile).catch(()=>{});delete globalThis.__memberAuthRegression;}
