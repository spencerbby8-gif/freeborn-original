-- ============================================================================
-- UNRUN CHECK (2026-10-30): is POST /api/account {action:"delete"} complete?
-- ============================================================================
-- The handler enumerates 29 tables by hand. Read-only; run against the project
-- and compare `covered_by_account_delete`.
--
-- A row with covered = false is one of two things, and `on_delete` tells you
-- which without guessing:
--   * parent is NOT [CASCADE]  -> member data that SURVIVES deletion
--     (a right-to-erasure gap, and for face/biometric tables the worst kind);
--   * parent IS [CASCADE]      -> the parent delete already takes it, fine;
--   * a RESTRICT/NO ACTION FK into auth.users that is not covered -> the
--     `delete from auth.users` at the end ABORTS and the account cannot be
--     deleted at all, with the 500 surfacing wherever the click came from.
--
-- `policies` counts RLS policies on the child: a covered table with 0 policies
-- is only safe because the route runs as the definer, which is worth seeing
-- next to the number.
-- ============================================================================
with fks as (
  select c.conrelid::regclass::text as child_table,
         a.attname                    as child_col,
         confrelid::regclass::text    as parent_table,
         case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
                            when 'c' then 'CASCADE'  when 'n' then 'SET NULL'
                            when 'd' then 'SET DEFAULT' end as on_delete
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.contype = 'f'
    and c.connamespace = 'public'::regnamespace
    and c.confrelid in ('public.user_profiles'::regclass,
                        'public.accounts'::regclass,
                        'auth.users'::regclass)
),
deleted(tbl text) as (values
  ('public.verification_audit_logs'),('public.profile_photos'),('public.event_interests'),
  ('public.user_private_settings'),('public.notification_preferences'),('public.user_private_locations'),
  ('public.discovery_preferences'),('public.user_trust_history'),('public.verification_rate_limits'),
  ('public.verification_selfie_checks'),('public.verification_challenges'),('public.support_requests'),
  ('public.verification_requests'),('public.sessions'),('public.user_swipes'),('public.user_matches'),
  ('public.blocked_users'),('public.reports'),('public.chat_media'),('public.message_reactions'),
  ('public.messages'),('public.matches'),('public.user_profiles'),('public.accounts'),
  ('auth.refresh_tokens'),('auth.identities'),('auth.users'),
  ('public.warnings'),('public.appeals'),('public.suspensions'),('public.security_events')
)
select f.child_table,
       string_agg(distinct f.child_col, ', ')                              as cols,
       string_agg(distinct f.parent_table || ' [' || f.on_delete || ']', ' + ') as parents,
       bool_or(f.child_table in (select tbl from deleted))                  as covered_by_account_delete,
       bool_or(f.on_delete = 'CASCADE')                                     as cascades_from_parent,
       (select count(*) from pg_policies pp
         where pp.schemaname = 'public'
           and pp.tablename = replace(f.child_table, 'public.', ''))         as policies
from fks f
group by 1
order by covered_by_account_delete, child_table;

-- Also run this for the tables that have NO foreign key at all — the delete
-- list can only be judged complete against the set of tables that carry a
-- user id, and FK-less tables (by column name) are exactly what a
-- constraint-driven review misses:
--   select table_name, column_name from information_schema.columns
--   where table_schema='public'
--     and column_name in ('user_id','account_id','member_id','liker_id','author_id')
--     and table_name not in (/* the 29 in `deleted` above */)
--   order by table_name;
