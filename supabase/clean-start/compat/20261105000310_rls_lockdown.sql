-- Final deny-by-default boundary for every public base table.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security',r.tablename);
    execute format('alter table public.%I force row level security',r.tablename);
    execute format('revoke all on public.%I from anon',r.tablename);
  end loop;
end $$;
