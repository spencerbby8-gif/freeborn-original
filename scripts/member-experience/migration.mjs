// Disposable local migration replay. NEVER accepts production credentials.
import pg from 'pg';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const client=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:5432/member_migration_test'});await client.connect();
const checks=[];
const evidence=process.env.FREEBORN_MEMBER_EVIDENCE_DIR??'scripts/member-experience/.evidence';
try{
 await client.query('drop table if exists story_quotes,story_views,member_stories,story_preferences,story_upload_receipts,conversation_preferences cascade');
 await client.query('alter table call_sessions drop column if exists ended_by,drop column if exists end_reason');
 const before=(await client.query('select count(*)::int n from public.messages')).rows[0].n;
 const catalog=async()=> (await client.query(`select
 (select count(*)::int from pg_tables where schemaname='public') as tables,
 (select count(*)::int from information_schema.columns where table_schema='public') as columns,
 (select count(*)::int from pg_indexes where schemaname='public') as indexes,
 (select count(*)::int from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and c.contype='c') as checks`)).rows[0];
 const previousCatalog=await catalog();
 const sql=await fs.readFile('supabase/migrations/20261121230000_member_stories_calls_chat.sql','utf8');
 await client.query(sql);checks.push('Additive migration applies over existing local application tables');
 const nextCatalog=await catalog();
 for(const [key,delta] of Object.entries({tables:6,columns:32,indexes:9,checks:7}))assert.equal(nextCatalog[key]-previousCatalog[key],delta,`${key} delta`);
 checks.push('Measured catalog delta matches manifest update: +6 tables, +32 columns, +9 indexes, +7 checks');
 assert.equal((await client.query('select count(*)::int n from public.messages')).rows[0].n,before);checks.push('Existing private messages are preserved');
 const tables=['conversation_preferences','story_preferences','member_stories','story_views','story_quotes','story_upload_receipts'];
 for(const table of tables){const q=await client.query("select c.relrowsecurity,c.relforcerowsecurity,has_table_privilege('anon',c.oid,'SELECT') anon_read,has_table_privilege('authenticated',c.oid,'SELECT') member_read,has_table_privilege('authenticated',c.oid,'INSERT') member_write from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1",[table]);assert.equal(q.rows[0].relrowsecurity,true);assert.equal(q.rows[0].relforcerowsecurity,true);assert.equal(q.rows[0].anon_read,false);assert.equal(q.rows[0].member_read,false);assert.equal(q.rows[0].member_write,false);}checks.push('All six new tables have RLS enabled and no direct anon/authenticated read/write grants');
 await client.query('set role authenticated');let refused=false;try{await client.query('select * from public.member_stories');}catch(e){refused=e.code==='42501';}finally{await client.query('reset role');}assert.equal(refused,true);checks.push('Real PostgreSQL authenticated role is denied direct story reads');
 await client.query('select public.purge_expired_member_stories()');checks.push('Expiry cleanup function executes successfully');
 const guard=await client.query("select has_function_privilege('anon','public.purge_expired_member_stories()','EXECUTE') a,has_function_privilege('authenticated','public.purge_expired_member_stories()','EXECUTE') b");assert.equal(guard.rows[0].a,false);assert.equal(guard.rows[0].b,false);checks.push('Cleanup is not executable by browser roles');
 console.log(checks.map(x=>'PASS '+x).join('\n'));
 await fs.mkdir(evidence,{recursive:true});
 await fs.writeFile(evidence+'/migration-results.json',JSON.stringify({scope:'Local PostgreSQL only; not hosted Supabase RLS acceptance. Baseline mirror differs from hosted auth.users FK as documented in schema.ts.',checks},null,2));
}finally{await client.end();}
