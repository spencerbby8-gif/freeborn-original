-- FB-14 forward fix: the Vercel database role must not need direct auth-schema
-- table grants. These pinned SECURITY DEFINER bridges expose only the two
-- operations account management needs, and only to service_role.

begin;

create or replace function public.fb14_active_signins(p_account_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
  from auth.refresh_tokens
  where user_id = p_account_id
    and revoked is not true;
$$;

revoke all on function public.fb14_active_signins(uuid) from public, anon, authenticated;
grant execute on function public.fb14_active_signins(uuid) to service_role;

create or replace function public.fb14_delete_auth_rows(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from auth.refresh_tokens where user_id = p_account_id;
  delete from auth.identities where user_id = p_account_id;
  delete from auth.users where id = p_account_id;
end;
$$;

revoke all on function public.fb14_delete_auth_rows(uuid) from public, anon, authenticated;
grant execute on function public.fb14_delete_auth_rows(uuid) to service_role;

commit;
