-- Complete the member-grant boundary and remove historical audit probe functions.
-- Runtime/service-role sequence grants, application functions, member data and
-- scheduling are unchanged. Both DROPs are idempotent; clean replay never
-- creates the historical probes.

begin;

revoke all on sequence public.chat_signals_id_seq from anon, authenticated;
revoke all on sequence public.verification_selfie_retention_audit_id_seq from anon, authenticated;

drop function if exists public.__tmp_probe1();
drop function if exists public.__tmp_probe2();

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
    join pg_roles g on g.oid = a.grantee
    where n.nspname = 'public'
      and c.relkind = 'S'
      and c.relname in ('chat_signals_id_seq','verification_selfie_retention_audit_id_seq')
      and g.rolname in ('anon','authenticated')
  ) then
    raise exception 'anonymous/member sequence grants remain after cleanup';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('__tmp_probe1','__tmp_probe2')
  ) then
    raise exception 'historical audit probe functions remain after cleanup';
  end if;

  if not has_sequence_privilege('freeborn_runtime','public.chat_signals_id_seq','USAGE')
    or not has_sequence_privilege('freeborn_runtime','public.chat_signals_id_seq','SELECT') then
    raise exception 'runtime chat sequence privilege was changed unexpectedly';
  end if;
end $$;

commit;
