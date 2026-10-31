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
  /* nspname||relname, NOT conrelid::regclass::text: the regclass text form drops the
     schema whenever it is on search_path, which made the `in (select tbl from deleted)`
     comparison below false for every single row on 2026-10-30. Qualified names are
     compare-safe either way. (Also: a CTE column list takes names only, so the
     original `deleted(tbl text)` was a syntax error and this check had never run.) */
  select n.nspname || '.' || ch.relname   as child_table,
         a.attname                        as child_col,
         confrelid::regclass::text        as parent_table,
         case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
                            when 'c' then 'CASCADE'  when 'n' then 'SET NULL'
                            when 'd' then 'SET DEFAULT' end as on_delete
  from pg_constraint c
  join pg_class ch on ch.oid = c.conrelid
  join pg_namespace n on n.oid = ch.relnamespace
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.contype = 'f'
    and n.nspname = 'public'
    and c.confrelid in ('public.user_profiles'::regclass,
                        'public.accounts'::regclass,
                        'auth.users'::regclass)
),
deleted(tbl) as (values
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
           and pp.tablename = split_part(f.child_table, '.', 2))            as policies
from fks f
group by 1
order by covered_by_account_delete, child_table;

-- ============================================================================
-- RUN 2 — the tables a constraint-driven review cannot see.
-- A table with an owner column but NO foreign key into user_profiles/accounts/
-- auth.users is invisible above: nothing cascades it, so only the route's own
-- delete list can erase it. moderation_actions is exactly that case (subject_id
-- plus a denormalised subject_email, fk_to_owner = 0), which is why the handler
-- deletes it explicitly by either identifier.
--
-- Result on production `ihwtpwlszegrjgakqsxx`, 2026-10-31, after both
-- 2026-10-30 migrations were applied: exactly one row —
--   table_name | owner_cols | fk_to_owner | policies
--   moderation_actions | subject_id | 0 | 0
-- and it IS in the handler's delete list (src/app/api/account/route.ts, the
-- `subject_id = ${id} or subject_email = ${email}` statement), so the gap is
-- closed in code rather than by a cascade.
-- ============================================================================
select c.table_name,
       string_agg(distinct c.column_name, ', ' order by c.column_name) as owner_cols,
       (select count(*) from pg_constraint k
         where k.conrelid = ('public.' || c.table_name)::regclass and k.contype = 'f'
           and k.confrelid in ('public.user_profiles'::regclass,
                               'public.accounts'::regclass,
                               'auth.users'::regclass))               as fk_to_owner,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.table_name) as policies
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema and t.table_name = c.table_name
 and t.table_type = 'BASE TABLE'
where c.table_schema = 'public'
  and c.column_name in ('user_id','account_id','member_id','liker_id','author_id',
                        'sender_id','subject_id','owner_id','blocked_id')
group by c.table_name
having (select count(*) from pg_constraint k
          where k.conrelid = ('public.' || c.table_name)::regclass and k.contype = 'f'
            and k.confrelid in ('public.user_profiles'::regclass,
                                'public.accounts'::regclass,
                                'auth.users'::regclass)) = 0
order by c.table_name;

-- ============================================================================
-- RESULT OF RUNNING THIS AGAINST PRODUCTION (2026-10-31, after the migrations)
-- 27 child tables carry an FK into user_profiles / accounts / auth.users.
--   covered_by_account_delete = false  (x4): account_devices, enforcement_cases,
--   identity_fingerprints, match_messages -> none of these is in the route's list,
--   and all four CASCADE from user_profiles, so the profile delete already takes
--   them. Including identity_fingerprints, which is the biometric template table.
--   Every other child table is in the route's list.
--   => no surviving member data: nothing carrying a member id outlives
--      POST /api/account {action:"delete"} — read back from this catalog, and the
--      handler's statements were read off src/app/api/account/route.ts, not assumed.
-- ============================================================================
