-- MED-INLINE-SELFIE follow-up: the move audit must not outlive the member.
--
-- WHY. `20261109030000_fb15_selfie_storage_path.sql` added
-- `public.verification_selfie_move_audit` so an operator can see which bytes moved
-- and which attempted moves were refused. It carries no image, no object path and
-- no account id — but it does carry `sha256` of the inline selfie text and the
-- image `byte_length`, keyed on a `request_id` with no referential tie to the row
-- it describes.
--
-- A Preview rehearsal proved the consequence rather than leaving it to reasoning:
-- after FB-14 account erasure deleted the member's `verification_requests` row,
-- the audit row survived it, holding a digest derived from that member's
-- photograph against a `request_id` that no longer resolved to anything. Erasure
-- that leaves a biometric-derived digest behind is not erasure. For comparison,
-- the pre-existing FB-15 audit (`verification_selfie_retention_audit`) keeps no
-- digest, no byte length and no request id at all — it keys on `job_id`.
--
-- THE FIX. One foreign key, `on delete cascade`: the audit row's lifetime is the
-- request row's lifetime. While the member exists the audit is exactly as useful
-- as before — an operator can still see a `refused` move and the digest the caller
-- claimed — and when erasure deletes the request row the digest goes with it, in
-- the same transaction, with no application code that could forget to.
--
-- WHY THIS CANNOT BREAK THE MOVER. `fb15_finalize_selfie_move` writes an audit row
-- on seven paths (path_invalid, erasure_in_progress, digest_mismatch,
-- object_absent, size_mismatch, lost_race and the successful move). Every one of
-- them runs only after `select ... from public.verification_requests where id =
-- p_request_id for update` has FOUND the row — the function returns
-- `request_absent` before any insert if it did not — and both
-- `invalid_arguments` guards return without inserting anything. So no audit insert
-- can ever name a request that does not exist, and this constraint cannot turn a
-- working mover into a failing one.
--
-- Append-only: no row is rewritten, no column is dropped, no function body
-- changes, and nothing here reads, moves or deletes member media.

begin;

/* Fail closed BEFORE changing anything: a dangling audit row means a member was
   already erased while a digest of their selfie was kept. That is the defect this
   migration closes, so it must be reported, not silently cascaded away — and
   adding the constraint over such a row would fail anyway, with a worse message. */
do $$
declare
  v_dangling integer;
begin
  select count(*) into v_dangling
  from public.verification_selfie_move_audit a
  where not exists (
    select 1 from public.verification_requests r where r.id = a.request_id
  );
  if v_dangling > 0 then
    raise exception
      'MED-INLINE-SELFIE: % move-audit row(s) already outlive their request. Investigate and clear them before applying this migration.',
      v_dangling;
  end if;
end;
$$;

alter table public.verification_selfie_move_audit
  drop constraint if exists verification_selfie_move_audit_request_fkey;

alter table public.verification_selfie_move_audit
  add constraint verification_selfie_move_audit_request_fkey
  foreign key (request_id)
  references public.verification_requests (id)
  on delete cascade;

/* Fail closed after the change too: if the cascade did not land exactly as
   reviewed, or if this migration quietly weakened the one before it, roll the
   whole thing back rather than leave an audit table that outlives its members. */
do $$
declare
  v_count integer;
  v_deltype "char";
  v_leak integer;
begin
  select count(*), max(confdeltype)
    into v_count, v_deltype
  from pg_constraint
  where conname = 'verification_selfie_move_audit_request_fkey'
    and contype = 'f'
    and conrelid = 'public.verification_selfie_move_audit'::regclass
    and confrelid = 'public.verification_requests'::regclass;

  if v_count <> 1 then
    raise exception 'MED-INLINE-SELFIE: expected exactly one move-audit foreign key, found %', v_count;
  end if;

  /* 'c' is ON DELETE CASCADE. Anything else — 'a' (no action), 'r' (restrict),
     'n' (null), 'd' (set default) — would leave the digest behind or block erasure. */
  if v_deltype <> 'c' then
    raise exception 'MED-INLINE-SELFIE: the move-audit foreign key is not ON DELETE CASCADE (confdeltype=%)', v_deltype;
  end if;

  /* Re-proved here so this migration cannot weaken the contract it follows. */
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'verification_selfie_move_audit'
      and column_name in ('selfie_media','data_url','storage_path','object_path','account_id','provider','method')
  ) then
    raise exception 'MED-INLINE-SELFIE: the move audit carries more than metadata';
  end if;

  select count(*) into v_leak
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'verification_selfie_move_audit'
    and grantee in ('anon','authenticated','PUBLIC');
  if v_leak > 0 then
    raise exception 'MED-INLINE-SELFIE: % member-role grant(s) leaked onto the move audit', v_leak;
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'verification_selfie_move_audit'
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'MED-INLINE-SELFIE: the move audit is not RLS enabled+forced';
  end if;
end;
$$;

commit;
