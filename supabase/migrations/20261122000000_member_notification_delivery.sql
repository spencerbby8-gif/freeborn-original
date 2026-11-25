-- Additive. Production requires explicit owner approval. No historical backfill/mail blast.
begin;
create table public.member_notices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.user_profiles(id) on delete cascade,
 event_key text not null unique, kind text not null, title text not null, body text not null,
 href text not null check(href like '/app%'), created_at timestamptz not null default now(), read_at timestamptz
);
create index member_notices_user_time_idx on public.member_notices(user_id,created_at desc);
create table public.member_email_preferences (
 user_id uuid primary key references public.user_profiles(id) on delete cascade,
 matches boolean not null default false, messages boolean not null default false, likes boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.member_email_outbox (
 id uuid primary key default gen_random_uuid(), user_id uuid references public.user_profiles(id) on delete cascade,
 event_key text not null unique, kind text not null check(kind in ('welcome','match','message','like','verification','appeal','support_ticket','support_ack','support_reply')),
 source_id uuid not null, peer_id uuid references public.user_profiles(id) on delete cascade,
 created_at timestamptz not null default now(), available_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','sending','accepted','suppressed','failed')),
 attempts integer not null default 0 check(attempts between 0 and 8), claimed_at timestamptz,
 provider_id text, accepted_at timestamptz, last_error text,
 delivery_status text not null default 'unknown' check(delivery_status in ('unknown','delivered','bounced','complained','failed')), delivery_event_at timestamptz, unsubscribe_token uuid not null default gen_random_uuid()
);
create index member_email_outbox_due_idx on public.member_email_outbox(status,available_at);
create table public.support_replies (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_requests(id) on delete cascade,
 author_id uuid references public.user_profiles(id) on delete set null,
 message text not null check(char_length(message) between 5 and 4000), created_at timestamptz not null default now()
);
-- Only a server-held role can reach these tables. Browser JWT roles cannot select or mutate.
do $$ declare t text; begin
 foreach t in array array['member_notices','member_email_preferences','member_email_outbox','support_replies'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 if exists(select 1 from pg_roles where rolname='freeborn_runtime') then
 execute format('grant select,insert,update,delete on public.%I to freeborn_runtime',t);
 execute format('create policy server_access on public.%I for all to freeborn_runtime using (true) with check (true)',t);
 end if;
 end loop;
 -- Additive member features must also work with the documented least-privilege runtime.
 if exists(select 1 from pg_roles where rolname='freeborn_runtime') then
 foreach t in array array['conversation_preferences','story_preferences','member_stories','story_views','story_quotes','story_upload_receipts'] loop
 execute format('grant select,insert,update,delete on public.%I to freeborn_runtime',t);
 execute format('create policy server_access on public.%I for all to freeborn_runtime using (true) with check (true)',t);
 end loop;
 end if;
end $$;
-- Verified recipient lookup: never trust an arbitrary reply-to or stale profile email.
create function public.member_notification_email(member_id uuid) returns text
language sql stable security definer set search_path=pg_catalog as $$
 select email::text from auth.users where id=member_id and email_confirmed_at is not null and deleted_at is null
$$;
revoke all on function public.member_notification_email(uuid) from public,anon,authenticated;
grant execute on function public.member_notification_email(uuid) to service_role;
do $$ begin if exists(select 1 from pg_roles where rolname='freeborn_runtime') then
 grant execute on function public.member_notification_email(uuid) to freeborn_runtime;
end if; end $$;
create function public.capture_member_notification() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare target uuid; peer uuid; k text; ek text; sid uuid; heading text; detail text; link text;
begin
 if tg_table_name='user_swipes' then sid:=new.liker_id; else sid:=new.id; end if;
 if tg_table_name='user_profiles' then
  if new.onboarding_completed_at is null or old.onboarding_completed_at is not null then return new; end if;
  target:=new.id;k:='welcome';ek:='welcome:'||target;
  heading:='Welcome to Freeborn';detail:='Start with Discover and your saved preferences. Like each other to match, then open Messages to chat or call. Share Stories with your matches. Your privacy, safety and support controls are in Settings.';link:='/app/settings/welcome';
 elsif tg_table_name='matches' then
  if new.status<>'active' then return new; end if;
  insert into public.member_email_outbox(user_id,event_key,kind,source_id,peer_id)
   values(new.user_a,'match:'||sid||':'||new.user_a,'match',sid,new.user_b),
         (new.user_b,'match:'||sid||':'||new.user_b,'match',sid,new.user_a) on conflict(event_key) do nothing;
  return new;
 elsif tg_table_name='messages' then
  select case when m.user_a=new.sender_id then m.user_b else m.user_a end into target from public.matches m where m.id=new.match_id and m.status='active' and new.sender_id in (m.user_a,m.user_b);
  if target is null then return new; end if;
  peer:=new.sender_id;k:='message';ek:='message:'||new.match_id||':'||target||':'||to_char(now() at time zone 'UTC','YYYYMMDDHH24');
 elsif tg_table_name='user_swipes' then
  if new.action not in ('like','superlike') then return new; end if;
  target:=new.liked_id;peer:=new.liker_id;k:='like';ek:='like:'||target||':'||to_char(now() at time zone 'UTC','YYYYMMDD');
 elsif tg_table_name='verification_requests' then
  if new.status not in ('approved','rejected') or new.status is not distinct from old.status then return new; end if;
  target:=new.account_id;k:='verification';ek:='verification:'||sid||':'||new.status;heading:='Verification update';detail:='Your verification status has changed. Open Freeborn to review it.';link:='/app/verification';
 elsif tg_table_name='appeals' then
  if new.status is not distinct from old.status and new.verdict is not distinct from old.verdict then return new; end if;
  if new.verdict is null then return new; end if;
  select id into target from public.user_profiles where lower(email::text)=lower(new.email) limit 1;
  if target is null then return new; end if;
  k:='appeal';ek:='appeal:'||sid||':'||md5(new.status||coalesce(new.verdict,''));heading:='Your appeal has an update';detail:='Open your account appeal to review the recorded decision.';link:='/app/settings/appeal';
 elsif tg_table_name='support_requests' then
  insert into public.member_email_outbox(user_id,event_key,kind,source_id) values(new.account_id,'support-ticket:'||sid,'support_ticket',sid),(new.account_id,'support-ack:'||sid,'support_ack',sid) on conflict(event_key) do nothing;
  return new;
 elsif tg_table_name='support_replies' then
  select account_id into target from public.support_requests where id=new.ticket_id;
  k:='support_reply';ek:='support-reply:'||sid;heading:='Support replied to your request';detail:='Your support conversation has a new reply.';link:='/app/settings/support';
 end if;
 if target is null then return new; end if;
 insert into public.member_email_outbox(user_id,event_key,kind,source_id,peer_id,available_at) values(target,ek,k,sid,peer,now()+case when k='message' then interval '10 minutes' when k='like' then interval '1 hour' else interval '0' end) on conflict(event_key) do nothing;
 if heading is not null then
 insert into public.member_notices(user_id,event_key,kind,title,body,href) values(target,ek,k,heading,detail,link) on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.capture_member_notification() from public,anon,authenticated;
create trigger member_welcome after update of onboarding_completed_at on public.user_profiles for each row execute function public.capture_member_notification();
create trigger member_match_email after insert on public.matches for each row execute function public.capture_member_notification();
create trigger member_message_email after insert on public.messages for each row execute function public.capture_member_notification();
create trigger member_like_email after insert or update of action on public.user_swipes for each row execute function public.capture_member_notification();
create trigger member_verification_email after update of status on public.verification_requests for each row execute function public.capture_member_notification();
create trigger member_appeal_email after update of status,verdict on public.appeals for each row execute function public.capture_member_notification();
create trigger member_support_email after insert on public.support_requests for each row execute function public.capture_member_notification();
create trigger member_support_reply_email after insert on public.support_replies for each row execute function public.capture_member_notification();
commit;
