-- Preview-only least-privilege runtime role. Password is assigned separately and never stored here.
begin;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'freeborn_runtime') then
    create role freeborn_runtime login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 40;
  else
    -- Supabase's postgres owner is not a superuser and cannot re-alter the
    -- BYPASSRLS attribute even to NOBYPASSRLS. Verify drift instead of
    -- weakening or rotating an existing runtime login during a replay.
    if not exists (
      select 1 from pg_roles where rolname = 'freeborn_runtime'
        and rolcanlogin and not rolinherit and not rolsuper and not rolcreatedb
        and not rolcreaterole and not rolreplication and not rolbypassrls
        and rolconnlimit = 40
    ) then
      raise exception 'freeborn_runtime role attributes differ from the least-privilege contract';
    end if;
  end if;
end $$;
revoke all on schema auth, storage from freeborn_runtime;
revoke create on schema public from freeborn_runtime;
grant usage on schema public to freeborn_runtime;
revoke all on all tables in schema public from freeborn_runtime;
revoke all on all sequences in schema public from freeborn_runtime;
revoke all on all functions in schema public from freeborn_runtime;
grant select, insert, update, delete on public.account_deletion_requests to freeborn_runtime;
grant select, insert, update, delete on public.account_devices to freeborn_runtime;
grant select, insert, update, delete on public.accounts to freeborn_runtime;
grant select, insert, update, delete on public.appeals to freeborn_runtime;
grant select, insert, update, delete on public.blocked_users to freeborn_runtime;
grant select, insert, update, delete on public.call_sessions to freeborn_runtime;
grant select, insert, update, delete on public.chat_media to freeborn_runtime;
grant select, insert, update, delete on public.chat_signals to freeborn_runtime;
grant select, insert, update, delete on public.discovery_preferences to freeborn_runtime;
grant select, insert, update, delete on public.enforcement_cases to freeborn_runtime;
grant select, insert, update, delete on public.event_interests to freeborn_runtime;
grant select, insert, update, delete on public.human_challenges to freeborn_runtime;
grant select, insert, update, delete on public.identity_fingerprints to freeborn_runtime;
grant select, insert, update, delete on public.match_messages to freeborn_runtime;
grant select, insert, update, delete on public.matches to freeborn_runtime;
grant select, insert, update, delete on public.message_reactions to freeborn_runtime;
grant select, insert, update, delete on public.messages to freeborn_runtime;
grant select, insert, update, delete on public.mixer_venues to freeborn_runtime;
grant select, insert, update, delete on public.moderation_actions to freeborn_runtime;
grant select, insert, update, delete on public.notification_preferences to freeborn_runtime;
grant select, insert, update, delete on public.profile_photos to freeborn_runtime;
grant select, insert, update, delete on public.reports to freeborn_runtime;
grant select, insert, update, delete on public.security_events to freeborn_runtime;
grant select, insert, update, delete on public.sessions to freeborn_runtime;
grant select, insert, update, delete on public.storage_cleanup_jobs to freeborn_runtime;
grant select, insert, update, delete on public.support_requests to freeborn_runtime;
grant select, insert, update, delete on public.suspensions to freeborn_runtime;
grant select, insert, update, delete on public.user_matches to freeborn_runtime;
grant select, insert, update, delete on public.user_private_locations to freeborn_runtime;
grant select, insert, update, delete on public.user_private_settings to freeborn_runtime;
grant select, insert, update, delete on public.user_profiles to freeborn_runtime;
grant select, insert, update, delete on public.user_swipes to freeborn_runtime;
grant select, insert, update, delete on public.user_trust_history to freeborn_runtime;
grant select, insert, update, delete on public.verification_audit_logs to freeborn_runtime;
grant select, insert, update, delete on public.verification_challenges to freeborn_runtime;
grant select, insert, update, delete on public.verification_rate_limits to freeborn_runtime;
grant select, insert, update, delete on public.verification_requests to freeborn_runtime;
grant select, insert, update, delete on public.verification_selfie_checks to freeborn_runtime;
grant select, insert, update, delete on public.warnings to freeborn_runtime;
grant usage, select on public.chat_signals_id_seq to freeborn_runtime;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='account_deletion_requests' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.account_deletion_requests for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='account_devices' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.account_devices for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='accounts' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.accounts for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='appeals' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.appeals for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='blocked_users' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.blocked_users for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='call_sessions' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.call_sessions for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='chat_media' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.chat_media for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='chat_signals' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.chat_signals for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='discovery_preferences' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.discovery_preferences for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='enforcement_cases' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.enforcement_cases for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='event_interests' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.event_interests for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='human_challenges' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.human_challenges for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='identity_fingerprints' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.identity_fingerprints for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='match_messages' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.match_messages for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='matches' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.matches for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='message_reactions' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.message_reactions for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='messages' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.messages for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='mixer_venues' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.mixer_venues for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='moderation_actions' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.moderation_actions for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='notification_preferences' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.notification_preferences for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_photos' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.profile_photos for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='reports' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.reports for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='security_events' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.security_events for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='sessions' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.sessions for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='storage_cleanup_jobs' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.storage_cleanup_jobs for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='support_requests' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.support_requests for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='suspensions' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.suspensions for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_matches' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.user_matches for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_private_locations' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.user_private_locations for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_private_settings' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.user_private_settings for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_profiles' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.user_profiles for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_swipes' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.user_swipes for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_trust_history' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.user_trust_history for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='verification_audit_logs' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.verification_audit_logs for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='verification_challenges' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.verification_challenges for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='verification_rate_limits' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.verification_rate_limits for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='verification_requests' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.verification_requests for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='verification_selfie_checks' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.verification_selfie_checks for all to freeborn_runtime using (true) with check (true); end if; end $$;
do $$ begin if not exists (select 1 from pg_policies where schemaname='public' and tablename='warnings' and policyname='freeborn_runtime_all') then create policy freeborn_runtime_all on public.warnings for all to freeborn_runtime using (true) with check (true); end if; end $$;
alter function public.hamming64(text,text) set search_path = public, pg_temp;
grant execute on function public.fb14_active_signins(uuid) to freeborn_runtime;
grant execute on function public.fb14_delete_auth_rows(uuid) to freeborn_runtime;
grant execute on function public.fb14_deletion_status(uuid) to freeborn_runtime;
grant execute on function public.fb15_supersede_pending_requests(uuid) to freeborn_runtime;
grant execute on function public.fb15_withdraw_selfies(uuid) to freeborn_runtime;
grant execute on function public.hamming64(text,text) to freeborn_runtime;
commit;
