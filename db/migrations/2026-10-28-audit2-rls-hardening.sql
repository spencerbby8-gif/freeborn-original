-- FREEBORN — audit 2026-10-28, second pass. RLS hardening.
-- APPLIED to live project ihwtpwlszegrjgakqsxx via the Supabase migration API as
-- "freeborn_audit_rls_hardening"; this file records it (same convention as
-- 2026-10-27-audit-f1-f10.sql — the live database is the source of truth).
--
-- WHY: the F4 pass revoked anon grants but left `authenticated` holding
-- TRUNCATE / TRIGGER / REFERENCES on every public table, and no table was forced
-- to apply its policies to the table owner.
--
-- EVIDENCE BEFORE (live queries, 2026-10-28):
--   grants per grantee              authenticated=204, anon=0, service_role=231
--   privileges to authenticated     DELETE INSERT REFERENCES SELECT TRIGGER TRUNCATE UPDATE
--   table owners                    all 'postgres'; pg_roles: postgres bypassrls=true super=false
--   roles holding bypassrls         service_role, supabase_admin, postgres,
--                                   supabase_read_only_user, supabase_etl_admin
--   FORCE RLS probe                 throwaway table owned by postgres with FORCE + no policy
--                                   was still readable by postgres ("owner still sees rows")
--                                   -> because BYPASSRLS outranks FORCE, not because FORCE
--                                   is a no-op in general.
--   authenticated-role test         `set local role authenticated` could SELECT messages
--                                   (rows=0, RLS default-deny) — i.e. RLS is what limits the
--                                   browser role, not grants.
--
-- SAFETY ARGUMENT (why this cannot break privileged operations):
--   * FORCE ROW LEVEL SECURITY is documented to bind the *owner* only, and it is
--     subordinate to BYPASSRLS. Every owner of a public table here is `postgres`,
--     which holds BYPASSRLS, so the app's pooler connection (SUPABASE_TRANSACTION_POOLER
--     -> postgres) behaves exactly as before. Verified after applying: postgres still
--     reads all tables (profiles=8 messages=16 verif=8 accounts=3).
--   * service_role keeps bypassrls=true and all 231 grants -> admin/maintenance paths
--     untouched.
--   * TRUNCATE/TRIGGER/REFERENCES are unused by PostgREST and by this app (the browser
--     never queries tables directly: 0 hits for `.from(` on any public table), so
--     revoking them removes an escalation path without removing a used privilege.
--   * SELECT/INSERT/UPDATE/DELETE for authenticated are deliberately KEPT: the 15
--     policy-bearing tables still behave identically for a member session.
--
-- DOWNGRADE (if a future tool needs the revoked privileges):
--   grant truncate, trigger, references on all tables in schema public to authenticated;
--   alter default privileges in schema public grant truncate, trigger, references on tables to authenticated;
--   do <no FORCE statements needed to undo>: the tables are default-unforced, so a
--   targeted `alter table public.X no force row level security` per table reverses it.

do $$
declare r record;
begin
  for r in select c.relname from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' loop
    execute format('alter table public.%I force row level security', r.relname);
  end loop;
end $$;

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke truncate, trigger, references on all tables in schema public from public;

alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
