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
