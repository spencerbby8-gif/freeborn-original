// Hardcoded loopback disposable clone. Drops only this feature's local tables/functions.
import pg from 'pg';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const c=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:5432/notification_migration_test'});await c.connect();
const checks=[],output=process.env.FREEBORN_SETTINGS_EVIDENCE_DIR??'scripts/settings-audit/.evidence';
const query=(s,p)=>c.query(s,p);
const tables=['member_notices','member_email_preferences','member_email_outbox','support_replies'];
const catalog=async()=> (await query(`select (select count(*)::int from pg_tables where schemaname='public') tables,(select count(*)::int from information_schema.columns where table_schema='public') columns,(select count(*)::int from pg_indexes where schemaname='public') indexes,(select count(*)::int from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and c.contype='c') checks`)).rows[0];
try{
 await query('drop function if exists public.capture_member_notification() cascade; drop function if exists public.member_notification_email(uuid);');
 for(const t of tables)await query('drop table if exists public.'+t+' cascade');
 await query("do $$begin if not exists(select 1 from pg_roles where rolname='freeborn_runtime') then create role freeborn_runtime nologin nobypassrls;end if;end$$;");
 await query('grant usage on schema public to freeborn_runtime');
 for(const t of ['conversation_preferences','story_preferences','member_stories','story_views','story_quotes','story_upload_receipts'])await query('drop policy if exists server_access on public.'+t);
 const before=await catalog(),messages=(await query('select count(*)::int n from public.messages')).rows[0].n;
 await query(await fs.readFile('supabase/migrations/20261122000000_member_notification_delivery.sql','utf8'));
 checks.push('Actual additive notification SQL applies successfully in disposable local clone');
 const after=await catalog(),delta=Object.fromEntries(Object.keys(before).map(k=>[k,after[k]-before[k]]));
 assert.deepEqual(delta,{tables:4,columns:36,indexes:8,checks:6});checks.push('Measured additive catalog delta: 4 tables, 36 columns, 8 indexes, 6 checks');
 assert.equal((await query('select count(*)::int n from public.messages')).rows[0].n,messages);checks.push('Existing private messages are preserved');
 for(const t of tables){const {rows:[r]}=await query('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',['public.'+t]);assert.ok(r.relrowsecurity&&r.relforcerowsecurity);}
 checks.push('All four communications tables enforce enabled + forced RLS');
 await query('set role authenticated');try{for(const t of tables)await assert.rejects(query('select * from public.'+t),e=>e.code==='42501');await assert.rejects(query("select public.member_notification_email('10000000-0000-4000-8000-000000000001')"),e=>e.code==='42501');}finally{await query('reset role');}
 checks.push('Actual browser database role denied reads and verified-email helper invocation');
 await query('set role freeborn_runtime');try{for(const t of [...tables,'member_stories','conversation_preferences'])await query('select * from public.'+t+' limit 1');await query("select public.member_notification_email('10000000-0000-4000-8000-000000000001')");}finally{await query('reset role');}
 checks.push('Non-bypass least-privilege runtime role can read new server tables and restricted identity helper');
 const {rows:[fn]}=await query("select prosecdef,proconfig from pg_proc where oid='public.capture_member_notification()'::regprocedure");assert.equal(fn.prosecdef,true);assert.ok(fn.proconfig.includes('search_path=pg_catalog'));checks.push('Capture trigger is security-definer with pinned pg_catalog search path');
 const manifest=JSON.parse(await fs.readFile('supabase/clean-start/manifest.json','utf8'));
 const expectedBefore={tables:50,columns:481,indexes:139,checks:89};const expected={tables:expectedBefore.tables+delta.tables,columns:expectedBefore.columns+delta.columns,indexes:expectedBefore.indexes+delta.indexes,checks:expectedBefore.checks+delta.checks};
 await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/migration-results.json',JSON.stringify({scope:'Local PostgreSQL clone, Auth table mirror; NOT full clean replay or hosted Supabase permission proof.',checks,delta,expectedManifestCatalog:expected,manifestStepsAtTest:manifest.steps.length},null,2));console.log(checks.map(x=>'PASS '+x).join('\n'));
}finally{await c.end();}
