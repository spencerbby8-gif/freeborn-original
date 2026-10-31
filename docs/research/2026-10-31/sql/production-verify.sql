-- PRODUCTION VERIFICATION, run 2026-10-31 against ihwtpwlszegrjgakqsxx.
-- No BEGIN and no COMMIT: the whole string is one implicit transaction, and the last
-- statement raises the report as an exception. An error inside a multi-statement simple
-- query aborts it, so every probe below is rolled back automatically and the session is
-- left idle rather than 'idle in transaction' holding a lock on public.matches.
-- Confirmed afterwards by read-only counts: chat_signals 0 rows, the match back to
-- active|null|null|null, messages 16, chat_media 11, profiles 9, idle-in-transaction 0.
--
-- P7 came back 0 on the first production run and that was the bug §4 of
-- PRODUCTION-MIGRATIONS-2026-10-31.md is about: a policy that reads the RLS-locked
-- `matches` table can never be satisfied. After the definer-function fix the same probe
-- was re-run as two member accounts and reported:
--   actorA_signals=2 all=2 msgs=0 NEG=false Awrite=refused | victimB_signals=2 Bpart=true
--   | strangerC_signals=0 Cpart=false
do $pin$
declare
  report text := '';
  m uuid := '05f33352-a422-4918-8fdf-55bba3656c53';
  a uuid := '772a1827-0cfb-430d-9fc4-771dbce20839';
  b uuid := 'b9bc7ac1-197e-43f1-affc-733b67d4f97c';
  media uuid := '011b4787-5a81-4478-a35c-20430f43c671';
  other uuid;
  n int;
begin
  select id into other from public.user_profiles where id <> a and id <> b limit 1;

  -- P1 the widened CHECK accepts a severed row (with an actor: that is the point), and
  --    severing destroys nothing.
  update public.matches set status='unmatched', unmatched_by=a, unmatched_at=now(), unmatch_reason='not_interested'
    where id=m;
  get diagnostics n = row_count;
  report := report || 'P1a_sever_accepted=' || n;
  if (select count(*) from public.messages where match_id=m) <> 16 then
    report := report || ' P1b_messages=FAIL'; else report := report || ' P1b_messages=16'; end if;
  if (select count(*) from public.chat_media where match_id=m) <> 6 then
    report := report || ' P1c_media=FAIL'; else report := report || ' P1c_media=6'; end if;
  if (select count(*) from public.matches where id=m) <> 1 then
    report := report || ' P1d_row_gone=FAIL'; else report := report || ' P1d_row=kept'; end if;

  -- P2 an unmatched row with no actor is a bug, so it must be refused.
  begin
    update public.matches set status='active', unmatched_by=null, unmatched_at=null where id=m;
    update public.matches set status='unmatched' where id=m;
    report := report || ' P2_no_actor=FAIL(accepted)';
  exception when check_violation then report := report || ' P2_no_actor=refused'; end;

  -- P3 the reason vocabulary is closed.
  begin
    update public.matches set status='unmatched', unmatched_by=a, unmatched_at=now(), unmatch_reason='creepy' where id=m;
    report := report || ' P3_reason=FAIL(accepted)';
  exception when check_violation then report := report || ' P3_reason=refused'; end;

  -- P4 both members remain participants of the severed thread (read-only + reporting).
  update public.matches set unmatch_reason='inappropriate' where id=m;
  if (select count(*) from public.matches where id=m and status='unmatched' and user_a=a and user_b=b and unmatched_by=a) = 1 then
    report := report || ' P4_participants=both_kept'; else report := report || ' P4_participants=FAIL'; end if;

  -- P5 the attachment still resolves for a severed thread through its match, which is all
  --    /api/chat/media/:id needs once read_media delegates to the lifecycle table.
  if (select count(*) from public.chat_media cm join public.matches mm on mm.id=cm.match_id
       where cm.id=media and cm.match_id=m and mm.status='unmatched'
         and (mm.user_a=a or mm.user_b=a) and (mm.user_a=b or mm.user_b=b)) = 1 then
    report := report || ' P5_media_attach=ok'; else report := report || ' P5_media_attach=FAIL'; end if;

  -- P6 chat_signals accepts the four kinds and rejects a made-up one.
  insert into public.chat_signals(match_id,kind) values (m,'severed'),(m,'cleared'),(m,'typing'),(m,'message');
  report := report || ' P6a_kinds=4inserted';
  begin
    insert into public.chat_signals(match_id,kind) values (m,'edited');
    report := report || ' P6b_bogus=FAIL(accepted)';
  exception when check_violation then report := report || ' P6b_bogus=refused'; end;

  -- P7/P8 read as the member, not as postgres: the participant must SEE rows, and the
  --    unsatisfiable-policy bug is invisible from any other vantage point.
  execute 'set local role authenticated';
  execute 'set local request.jwt.claims = ' || quote_literal(json_build_object('sub',a,'role','authenticated','aud','authenticated')::text);
  select count(*) into n from public.chat_signals where match_id=m;
  report := report || ' P7_participant_rows=' || n;
  select count(*) into n from public.messages;
  report := report || ' P7b_messages_rows=' || n;

  execute 'set local request.jwt.claims = ' || quote_literal(json_build_object('sub',other,'role','authenticated','aud','authenticated')::text);
  select count(*) into n from public.chat_signals where match_id=m;
  report := report || ' P8_stranger_rows=' || n;

  -- P9 a member cannot write a signal even to spam a peer.
  begin
    insert into public.chat_signals(match_id,kind) values (m,'message');
    report := report || ' P9_client_write=FAIL(allowed)';
  exception when insufficient_privilege then report := report || ' P9_client_write=refused'; end;
  execute 'reset role';

  -- P10 deleting the match (reachable only from account deletion) takes the signals with it.
  delete from public.chat_signals where match_id=m;
  insert into public.chat_signals(match_id,kind) values (m,'message');
  delete from public.matches where id=m;
  select count(*) into n from public.chat_signals;
  report := report || ' P10_cascade_signals=' || n;
  select count(*) into n from public.messages;
  report := report || ' P10b_cascade_messages=' || n;

  raise exception 'PINREPORT %', report using hint='this abort is intentional: it rolls the probe back';
end
$pin$;
