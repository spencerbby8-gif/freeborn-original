// Destructive ONLY for this feature table in the named local disposable database.
import pg from 'pg';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const url='postgresql://postgres:postgres@127.0.0.1:5432/member_migration_test';const c=new pg.Client({connectionString:url});await c.connect();
try{
 await c.query('drop table if exists public.hidden_story_authors');
 const catalog=async()=>(await c.query(`select (select count(*)::int from pg_tables where schemaname='public') tables,(select count(*)::int from information_schema.columns where table_schema='public') columns,(select count(*)::int from pg_indexes where schemaname='public') indexes,(select count(*)::int from pg_constraint x join pg_class t on t.oid=x.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and x.contype='c') checks`)).rows[0];
 const before=await catalog();const messages=(await c.query('select count(*)::int n from public.messages')).rows[0].n;
 await c.query(await fs.readFile('supabase/migrations/20261122010000_hidden_story_authors.sql','utf8'));
 const after=await catalog();for(const [k,n] of Object.entries({tables:1,columns:3,indexes:1,checks:1}))assert.equal(after[k]-before[k],n,k);
 assert.equal((await c.query('select count(*)::int n from public.messages')).rows[0].n,messages);
 const sec=(await c.query("select c.relrowsecurity rls,c.relforcerowsecurity forced,has_table_privilege('anon',c.oid,'SELECT') anon,has_table_privilege('authenticated',c.oid,'SELECT') member_read,has_table_privilege('authenticated',c.oid,'INSERT') member_write,has_table_privilege('service_role',c.oid,'SELECT') service_read from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='hidden_story_authors'")).rows[0];assert.deepEqual(sec,{rls:true,forced:true,anon:false,member_read:false,member_write:false,service_read:true});
 await c.query('set role authenticated');let denied=false;try{await c.query('select * from public.hidden_story_authors')}catch(e){denied=e.code==='42501'}finally{await c.query('reset role')}assert.equal(denied,true);
 const fks=(await c.query("select count(*)::int n from pg_constraint where conrelid='public.hidden_story_authors'::regclass and contype='f' and confdeltype='c'")).rows[0].n;assert.equal(fks,2);
 console.log('PASS additive migration catalog delta and existing message preservation');console.log('PASS forced RLS, role grants and authenticated direct-read denial');console.log('PASS owner and author foreign keys cascade on account deletion');
}finally{await c.end()}
