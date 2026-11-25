// DESTRUCTIVE fixture setup: exact disposable loopback DB only, never a hosted project.
import {execFileSync} from 'node:child_process';import fs from 'node:fs/promises';import pg from 'pg';
const raw=process.env.E2E_DATABASE_URL??'postgresql://postgres:postgres@127.0.0.1:5432/member_experience_test',u=new URL(raw);
if(!['127.0.0.1','localhost'].includes(u.hostname)||u.pathname!=='/member_experience_test'||process.env.SUPABASE_TRANSACTION_POOLER)throw Error('Only the explicitly named disposable loopback member_experience_test database is allowed.');
execFileSync(process.execPath,['scripts/trust/prepare-local-db.mjs'],{env:{...process.env,E2E_DATABASE_URL:raw},stdio:'inherit'});
const c=new pg.Client({connectionString:raw});await c.connect();
try{
 await c.query(`create schema if not exists auth;
 create table if not exists auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
 create table if not exists auth.refresh_tokens(id bigint generated always as identity primary key,user_id text,revoked boolean);
 create table if not exists auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid);`);
 // Replace generated feature mirrors with their actual additive migrations + triggers.
 await c.query('drop table hidden_story_authors,support_replies,member_email_outbox,member_email_preferences,member_notices,story_quotes,story_views,member_stories,story_upload_receipts,story_preferences,conversation_preferences cascade');
 await c.query('alter table call_sessions drop column ended_by,drop column end_reason');
 for(const name of ['20261102040000_fb14_durable_account_deletion.sql','20261102080000_fb14_auth_erasure_bridge.sql','20261121230000_member_stories_calls_chat.sql','20261122000000_member_notification_delivery.sql','20261122010000_hidden_story_authors.sql'])await c.query(await fs.readFile('supabase/migrations/'+name,'utf8'));
 console.log('PASS local fixture baseline + actual feature SQL; Auth/Storage remain local mirrors, NOT hosted proof.');
}finally{await c.end();}
