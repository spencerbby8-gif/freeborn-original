-- Publish only the intended application tables; never switch to ALL TABLES.
do $$
declare r record;
begin
  for r in select * from (values ('chat_signals'),('realtime_health')) as v(tablename) loop
    if not exists (
      select 1 from pg_publication p
      join pg_publication_rel pr on pr.prpubid=p.oid
      join pg_class c on c.oid=pr.prrelid
      join pg_namespace n on n.oid=c.relnamespace
      where p.pubname='supabase_realtime' and n.nspname='public' and c.relname=r.tablename
    ) then
      execute format('alter publication supabase_realtime add table public.%I',r.tablename);
    end if;
  end loop;
end $$;
