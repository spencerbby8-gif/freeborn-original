-- Catalog-derived compatibility completion. The user_profiles -> auth.users
-- recovered FK is intentionally preserved instead of adding a second accounts FK.
alter table public.sessions
  add constraint sessions_account_id_accounts_fk
  foreign key (account_id) references public.accounts(id)
  on delete cascade;
alter table public.verification_requests
  add constraint verification_requests_account_id_accounts_fk
  foreign key (account_id) references public.accounts(id)
  on delete cascade;
