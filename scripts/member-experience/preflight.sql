-- Read-only. Run before approval; rows marked false are deployment blockers.
select 'notification_preferences.dismissed_before' as requirement, exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_preferences' and column_name='dismissed_before') as present
union all select 'call_sessions.ended_by',exists(select 1 from information_schema.columns where table_schema='public' and table_name='call_sessions' and column_name='ended_by')
union all select 'call_sessions.end_reason',exists(select 1 from information_schema.columns where table_schema='public' and table_name='call_sessions' and column_name='end_reason')
union all select name,to_regclass('public.'||name) is not null from unnest(array['conversation_preferences','story_preferences','member_stories','story_views','story_quotes','story_upload_receipts']) name;
