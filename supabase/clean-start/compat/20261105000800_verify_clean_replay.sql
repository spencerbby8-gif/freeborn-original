-- Fail the replay if the resulting security/catalog contract is not present.
do $$
declare n integer;
begin
  select count(*) into n from pg_tables where schemaname='public';
  if n <> 42 then raise exception 'clean replay public table count %, expected 42',n; end if;
  select count(*) into n from information_schema.columns col join pg_class t on t.relname=col.table_name join pg_namespace ns on ns.oid=t.relnamespace and ns.nspname=col.table_schema where col.table_schema='public' and t.relkind='r';
  if n <> 435 then raise exception 'clean replay public column count %, expected 435',n; end if;
  select count(*) into n from pg_indexes where schemaname='public';
  if n <> 122 then raise exception 'clean replay public index count %, expected 122',n; end if;
  select count(*) into n from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace s on s.oid=t.relnamespace where s.nspname='public' and c.contype='c';
  if n <> 74 then raise exception 'clean replay check constraint count %, expected 74',n; end if;
  select count(*) into n from pg_class t join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public' and t.relkind='r' and (not t.relrowsecurity or not t.relforcerowsecurity);
  if n <> 0 then raise exception 'clean replay has % tables without enabled+forced RLS',n; end if;
  select count(*) into n from information_schema.table_privileges where table_schema='public' and grantee='anon';
  if n <> 0 then raise exception 'clean replay has % anonymous public table grants',n; end if;
  if exists (
    select 1 from information_schema.table_privileges tp
    where tp.table_schema='public' and tp.grantee='authenticated'
      and not exists (
        select 1 from pg_policies p
        where p.schemaname='public' and p.tablename=tp.table_name
          and (p.cmd='ALL' or p.cmd=tp.privilege_type)
          and (p.roles @> array['authenticated']::name[] or p.roles @> array['public']::name[])
      )
  ) then
    raise exception 'clean replay has authenticated table privileges without a matching member RLS policy';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    cross join lateral aclexplode(c.relacl) a join pg_roles g on g.oid=a.grantee
    where ns.nspname='public' and c.relkind='S'
      and c.relname in ('chat_signals_id_seq','verification_selfie_retention_audit_id_seq')
      and g.rolname in ('anon','authenticated')
  ) then
    raise exception 'clean replay has anonymous/member sequence grants';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in ('__tmp_probe1','__tmp_probe2')
  ) then
    raise exception 'clean replay contains historical audit probe functions';
  end if;
  if (select public from storage.buckets where id='profile-photos') is not true then raise exception 'profile photo visibility mismatch'; end if;
  if (select public from storage.buckets where id='verification-selfies') is not false then raise exception 'selfie bucket is not private'; end if;
  if (select public from storage.buckets where id='chat-media') is not false then raise exception 'chat bucket is not private'; end if;
  if (select file_size_limit from storage.buckets where id='verification-selfies') <> 6291456 then raise exception 'selfie size bound mismatch'; end if;
  if (select file_size_limit from storage.buckets where id='chat-media') <> 20971520 then raise exception 'chat size bound mismatch'; end if;
  if to_regclass('cron.job') is not null then
    if exists(select 1 from cron.job where jobname='fb15-selfie-retention' and active) then
      raise exception 'FB-15 must remain paused in the clean preview replay';
    end if;
  end if;
end $$;
