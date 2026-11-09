-- MED-INLINE-SELFIE: verification selfies leave the relational column and live in
-- the private `verification-selfies` bucket, with the row keeping its identity.
--
-- WHY. `verification_requests.selfie_media` stored the whole photograph as a
-- base64 data URL inside the application database. That put biometric image
-- bytes in relational backups, in the pooler's statement logs' reach, and in
-- every dump/restore path, while the project already owns a private bucket with
-- per-member RLS, a 6 MiB/MIME bound and two purge pipelines (FB-14 account
-- erasure, FB-15 retention) that only ever look at Storage.
--
-- SHAPE OF THE CHANGE. Append-only and history-preserving:
--   * one nullable column, `selfie_storage_path`, is added;
--   * no existing row is rewritten by this migration — the one-time mover
--     (scripts/db/migrate-inline-selfies.mjs) moves bytes and proves the digest;
--   * `id`, `account_id`, `status`, `method`, `reject_reason`, `submitted_at`
--     and `reviewed_at` are never touched, so the verification history and every
--     audit trail that joins on it stay exactly as they were;
--   * a selfie has ONE home: the two columns are mutually exclusive by check
--     constraint, so an image can never be duplicated or half-moved;
--   * FB-15 learns the new home. Rejected/superseded/withdrawn selfies that live
--     in Storage are now enqueued by asset key `request-storage:<id>`, and an
--     object that a `verification_requests` row still references can never be
--     classified as an orphan. Approved references stay held forever, exactly as
--     the inline rule held them.
--
-- The mover is the only writer of `selfie_storage_path` for historical rows, and
-- it goes through `fb15_finalize_selfie_move`, which re-reads the row under a row
-- lock, re-verifies the SHA-256 of the inline text against the value the mover
-- computed BEFORE uploading, proves the Storage object exists with the expected
-- byte length, and only then swaps the reference and nulls the column in one
-- statement. A digest mismatch, a missing object, a size mismatch, an unowned
-- path or an account already inside FB-14 erasure aborts the move and leaves the
-- original bytes untouched.

begin;

/* --- 1. the column --------------------------------------------------------- */

alter table public.verification_requests
  add column if not exists selfie_storage_path text;

comment on column public.verification_requests.selfie_storage_path is
  'Private verification-selfies object holding this attempt''s photograph. Mutually exclusive with selfie_media; set only by the verified mover or by a route that uploaded to Storage first.';

/* --- 2. invariants --------------------------------------------------------- */

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'verification_requests_selfie_one_home') then
    alter table public.verification_requests
      add constraint verification_requests_selfie_one_home
      check (not (selfie_media is not null and selfie_storage_path is not null));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'verification_requests_selfie_path_owned') then
    /* Stricter than `fb15_owned_selfie_path` on purpose. That function also
       accepts the legacy root-level `selfie-<account_id>-...` shape, which
       Storage RLS does NOT: a member is authorised by
       `(storage.foldername(name))[1] = auth.uid()`, so a root-level object could
       never be read back by its own owner for the identity-match gate, and FB-14
       erasure only sweeps the `<account_id>/` prefix. A request reference must
       therefore name an object inside the member's own folder. */
    alter table public.verification_requests
      add constraint verification_requests_selfie_path_owned
      check (
        selfie_storage_path is null
        or (
          public.fb15_owned_selfie_path(account_id, selfie_storage_path)
          and selfie_storage_path like account_id::text || '/%'
        )
      );
  end if;
end;
$$;

/* Retention and erasure both look rows up by path; the partial index keeps that
   lookup off a sequential scan without indexing the (majority) null rows. */
create index if not exists verification_requests_selfie_path_idx
  on public.verification_requests (selfie_storage_path)
  where selfie_storage_path is not null;

/* --- 3. move audit (metadata only) ----------------------------------------- */

/* Deliberately narrower than the FB-15 audit and for the same reason: an audit
   row is read by operators and survives in backups, so it carries no image, no
   data URL, no object path, no account id and no provider text. `request_id` is
   enough to join the restricted source row; the digest proves WHICH bytes moved
   without being the bytes. */
create table if not exists public.verification_selfie_move_audit (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length integer not null check (byte_length > 0),
  event text not null check (event in ('moved','refused')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists vsma_request_idx
  on public.verification_selfie_move_audit (request_id, created_at);

alter table public.verification_selfie_move_audit enable row level security;
alter table public.verification_selfie_move_audit force row level security;

revoke all on public.verification_selfie_move_audit from public, anon, authenticated;
grant all on public.verification_selfie_move_audit to service_role;

drop policy if exists "service_role reads selfie move audit" on public.verification_selfie_move_audit;
create policy "service_role reads selfie move audit"
  on public.verification_selfie_move_audit for all to service_role
  using (true) with check (true);

/* --- 4. the verified mover's commit point ---------------------------------- */

/* SECURITY DEFINER and service_role-only: it must read the inline bytes to hash
   them and write the reference, and no member role may do either. Every refusal
   is audited with the digest the caller claimed, so an operator can see an
   attempted move that did not match without the audit ever holding an image. */
create or replace function public.fb15_finalize_selfie_move(
  p_request_id uuid,
  p_storage_path text,
  p_sha256 text,
  p_byte_length integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.verification_requests%rowtype;
  v_object_id uuid;
  v_object_size bigint;
  v_inline_sha text;
begin
  if p_request_id is null or p_storage_path is null or p_sha256 is null or p_byte_length is null then
    return 'invalid_arguments';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' or p_byte_length <= 0 then
    return 'invalid_arguments';
  end if;

  select * into v_row from public.verification_requests
  where id = p_request_id
  for update;
  if not found then return 'request_absent'; end if;

  /* Already moved: idempotent success only when it landed on exactly this path. */
  if v_row.selfie_media is null then
    if v_row.selfie_storage_path = p_storage_path then return 'already_moved'; end if;
    return 'inline_absent';
  end if;
  if v_row.selfie_storage_path is not null then return 'inline_absent'; end if;

  if not public.fb15_owned_selfie_path(v_row.account_id, p_storage_path)
     or p_storage_path not like v_row.account_id::text || '/%' then
    insert into public.verification_selfie_move_audit (request_id, sha256, byte_length, event)
    values (p_request_id, p_sha256, p_byte_length, 'refused');
    return 'path_invalid';
  end if;

  /* An account inside FB-14 erasure must not gain a fresh Storage object. */
  if exists (select 1 from public.account_deletion_requests d where d.account_id = v_row.account_id) then
    insert into public.verification_selfie_move_audit (request_id, sha256, byte_length, event)
    values (p_request_id, p_sha256, p_byte_length, 'refused');
    return 'erasure_in_progress';
  end if;

  /* Prove the bytes that were uploaded are the bytes that were in the row. The
     digest is recomputed HERE, under the row lock, over the inline text. */
  v_inline_sha := encode(sha256(v_row.selfie_media::bytea), 'hex');
  if v_inline_sha <> lower(p_sha256) then
    insert into public.verification_selfie_move_audit (request_id, sha256, byte_length, event)
    values (p_request_id, p_sha256, p_byte_length, 'refused');
    return 'digest_mismatch';
  end if;

  select o.id, coalesce((o.metadata ->> 'size')::bigint, -1)
    into v_object_id, v_object_size
  from storage.objects o
  where o.bucket_id = 'verification-selfies' and o.name = p_storage_path;
  if v_object_id is null then
    insert into public.verification_selfie_move_audit (request_id, sha256, byte_length, event)
    values (p_request_id, p_sha256, p_byte_length, 'refused');
    return 'object_absent';
  end if;
  if v_object_size <> p_byte_length::bigint then
    insert into public.verification_selfie_move_audit (request_id, sha256, byte_length, event)
    values (p_request_id, p_sha256, p_byte_length, 'refused');
    return 'size_mismatch';
  end if;

  /* One statement: the reference appears in the same commit the bytes disappear,
     so no reader can ever observe a row with neither home. Verdict, method,
     reason and both timestamps are untouched. */
  update public.verification_requests
  set selfie_storage_path = p_storage_path,
      selfie_media = null
  where id = p_request_id
    and selfie_media is not null
    and selfie_storage_path is null
    and encode(sha256(selfie_media::bytea), 'hex') = lower(p_sha256);
  if not found then
    insert into public.verification_selfie_move_audit (request_id, sha256, byte_length, event)
    values (p_request_id, p_sha256, p_byte_length, 'refused');
    return 'lost_race';
  end if;

  insert into public.verification_selfie_move_audit (request_id, sha256, byte_length, event)
  values (p_request_id, p_sha256, p_byte_length, 'moved');
  return 'moved';
end;
$$;

revoke all on function public.fb15_finalize_selfie_move(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.fb15_finalize_selfie_move(uuid, text, text, integer) to service_role;

/* --- 5. FB-15 learns the new home ------------------------------------------ */

/* Scanner. Unchanged rules, two extra candidate branches and one extra orphan
   exclusion. The orphan exclusion is the safety-critical line: without it an
   APPROVED selfie that now lives in Storage would look unreferenced and be
   enqueued for deletion as an orphan. */
create or replace function public.fb15_scan_retention(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  with candidates as (
    select 'request:' || r.id::text as asset_key, r.account_id,
           'verification_requests'::text as source_table, r.id as source_id,
           null::text as storage_path, null::uuid as storage_object_id,
           true as has_inline, 'rejected'::text as reason
    from public.verification_requests r
    where r.status = 'rejected' and r.selfie_media is not null

    union all
    select 'request-storage:' || r.id::text, r.account_id, 'verification_requests'::text, r.id,
           r.selfie_storage_path, o.id, false, 'rejected'::text
    from public.verification_requests r
    left join storage.objects o on o.bucket_id = 'verification-selfies' and o.name = r.selfie_storage_path
    where r.status = 'rejected'
      and r.selfie_storage_path is not null
      and public.fb15_owned_selfie_path(r.account_id, r.selfie_storage_path)

    union all
    select 'check:' || c.id::text, c.user_id, 'verification_selfie_checks'::text, c.id,
           c.storage_path, o.id, false, 'rejected'::text
    from public.verification_selfie_checks c
    left join storage.objects o on o.bucket_id = 'verification-selfies' and o.name = c.storage_path
    where c.status = 'failed'
      and c.storage_path is not null
      and public.fb15_owned_selfie_path(c.user_id, c.storage_path)

    union all
    select 'request:' || r.id::text, r.account_id, 'verification_requests'::text, r.id,
           null::text, null::uuid, true, 'superseded'::text
    from public.verification_requests r
    where r.status = 'pending' and r.selfie_media is not null
      and r.id <> (
        select r2.id from public.verification_requests r2
        where r2.account_id = r.account_id and r2.status = 'pending'
        order by r2.submitted_at desc, r2.id desc limit 1
      )

    union all
    select 'request-storage:' || r.id::text, r.account_id, 'verification_requests'::text, r.id,
           r.selfie_storage_path, o.id, false, 'superseded'::text
    from public.verification_requests r
    left join storage.objects o on o.bucket_id = 'verification-selfies' and o.name = r.selfie_storage_path
    where r.status = 'pending'
      and r.selfie_storage_path is not null
      and public.fb15_owned_selfie_path(r.account_id, r.selfie_storage_path)
      and r.id <> (
        select r2.id from public.verification_requests r2
        where r2.account_id = r.account_id and r2.status = 'pending'
        order by r2.submitted_at desc, r2.id desc limit 1
      )

    union all
    select 'object:' || o.id::text, owner.account_id, 'storage_orphan'::text, null::uuid,
           o.name, o.id, false, 'orphaned'::text
    from storage.objects o
    cross join lateral (
      select case
        when o.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
          then substring(o.name from '^[^/]+')::uuid
        when o.name ~* '^selfie-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-'
          then substring(o.name from '^selfie-([0-9a-f-]{36})-')::uuid
        else null::uuid
      end as account_id
    ) owner
    where o.bucket_id = 'verification-selfies'
      and o.created_at < now() - interval '15 minutes'
      and owner.account_id is not null
      and public.fb15_owned_selfie_path(owner.account_id, o.name)
      and not exists (select 1 from public.account_deletion_requests d where d.account_id = owner.account_id)
      and not exists (select 1 from public.verification_selfie_checks c where c.storage_path = o.name)
      and not exists (select 1 from public.verification_requests r where r.selfie_storage_path = o.name)
  ),
  fresh as (
    select c.* from candidates c
    where not exists (select 1 from public.verification_selfie_retention_jobs j where j.asset_key = c.asset_key)
    order by c.asset_key
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ),
  inserted as (
    insert into public.verification_selfie_retention_jobs (
      asset_key, account_id, source_table, source_id, storage_path, storage_object_id, has_inline, reason
    )
    select asset_key, account_id, source_table, source_id, storage_path, storage_object_id, has_inline, reason
    from fresh
    on conflict (asset_key) do nothing
    returning id, source_table, reason, attempts
  )
  insert into public.verification_selfie_retention_audit (job_id, source_table, event, reason, attempts)
  select id, source_table, 'enqueued', reason, attempts from inserted;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.fb15_scan_retention(integer) from public, anon, authenticated;
grant execute on function public.fb15_scan_retention(integer) to postgres, service_role;

/* Supersede: release whichever home the undecided selfie is in, in the same
   transaction that records the new attempt. Verdicts and reasons stay. */
create or replace function public.fb15_supersede_pending_requests(p_account_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with inserted as (
    insert into public.verification_selfie_retention_jobs (
      asset_key, account_id, source_table, source_id, storage_path, storage_object_id, has_inline, reason
    )
    select 'request:' || r.id::text, r.account_id, 'verification_requests', r.id,
           null::text, null::uuid, true, 'superseded'
    from public.verification_requests r
    where r.account_id = p_account_id and r.status = 'pending' and r.selfie_media is not null
    on conflict (asset_key) do nothing
    returning id, source_table, reason, attempts
  ), inserted_storage as (
    insert into public.verification_selfie_retention_jobs (
      asset_key, account_id, source_table, source_id, storage_path, storage_object_id, has_inline, reason
    )
    select 'request-storage:' || r.id::text, r.account_id, 'verification_requests', r.id,
           r.selfie_storage_path, o.id, false, 'superseded'
    from public.verification_requests r
    left join storage.objects o on o.bucket_id = 'verification-selfies' and o.name = r.selfie_storage_path
    where r.account_id = p_account_id and r.status = 'pending'
      and r.selfie_storage_path is not null
      and public.fb15_owned_selfie_path(p_account_id, r.selfie_storage_path)
    on conflict (asset_key) do nothing
    returning id, source_table, reason, attempts
  ), audited as (
    insert into public.verification_selfie_retention_audit (job_id, source_table, event, reason, attempts)
    select id, source_table, 'enqueued', reason, attempts from inserted
    union all
    select id, source_table, 'enqueued', reason, attempts from inserted_storage
    returning 1
  )
  select (select count(*)::integer from inserted) + (select count(*)::integer from inserted_storage)
    into v_count;

  update public.verification_requests
  set selfie_media = null
  where account_id = p_account_id and status = 'pending' and selfie_media is not null;

  /* The Storage object is removed by the leased worker, not here: this function
     runs inside a member's request and must not delete bytes it cannot verify.
     The reference stays until completion proves absence, so a crash between the
     two leaves a re-scanable job and an object that is still accounted for. */

  return v_count;
end;
$$;

revoke all on function public.fb15_supersede_pending_requests(uuid) from public, anon, authenticated;
grant execute on function public.fb15_supersede_pending_requests(uuid) to service_role;

/* Consent withdrawal: enqueue every copy in either home, then release the
   relational references. Existing non-completed jobs become withdrawn, which
   overrides every hold. */
create or replace function public.fb15_withdraw_selfies(p_account_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  with requests_w as (
    insert into public.verification_selfie_retention_jobs (
      asset_key, account_id, source_table, source_id, has_inline, reason
    )
    select 'request:' || r.id::text, r.account_id, 'verification_requests', r.id, true, 'withdrawn'
    from public.verification_requests r
    where r.account_id = p_account_id and r.selfie_media is not null
    on conflict (asset_key) do update
      set reason = 'withdrawn', status = 'pending', attempts = 0, next_attempt_at = now(),
          lease_token = null, lease_expires_at = null, error_code = null, updated_at = now()
      where public.verification_selfie_retention_jobs.status <> 'completed'
    returning id, source_table, reason, attempts
  ), requests_storage_w as (
    insert into public.verification_selfie_retention_jobs (
      asset_key, account_id, source_table, source_id, storage_path, storage_object_id, has_inline, reason
    )
    select 'request-storage:' || r.id::text, r.account_id, 'verification_requests', r.id,
           r.selfie_storage_path, o.id, false, 'withdrawn'
    from public.verification_requests r
    left join storage.objects o on o.bucket_id = 'verification-selfies' and o.name = r.selfie_storage_path
    where r.account_id = p_account_id
      and r.selfie_storage_path is not null
      and public.fb15_owned_selfie_path(p_account_id, r.selfie_storage_path)
    on conflict (asset_key) do update
      set reason = 'withdrawn', status = 'pending', attempts = 0, next_attempt_at = now(),
          lease_token = null, lease_expires_at = null, error_code = null, updated_at = now()
      where public.verification_selfie_retention_jobs.status <> 'completed'
    returning id, source_table, reason, attempts
  ), checks_w as (
    insert into public.verification_selfie_retention_jobs (
      asset_key, account_id, source_table, source_id, storage_path, storage_object_id, has_inline, reason
    )
    select 'check:' || c.id::text, c.user_id, 'verification_selfie_checks', c.id,
           c.storage_path, o.id, false, 'withdrawn'
    from public.verification_selfie_checks c
    left join storage.objects o on o.bucket_id = 'verification-selfies' and o.name = c.storage_path
    where c.user_id = p_account_id
      and c.storage_path is not null
      and public.fb15_owned_selfie_path(c.user_id, c.storage_path)
    on conflict (asset_key) do update
      set reason = 'withdrawn', status = 'pending', attempts = 0, next_attempt_at = now(),
          lease_token = null, lease_expires_at = null, error_code = null, updated_at = now()
      where public.verification_selfie_retention_jobs.status <> 'completed'
    returning id, source_table, reason, attempts
  ), audited as (
    insert into public.verification_selfie_retention_audit (job_id, source_table, event, reason, attempts)
    select id, source_table, 'withdrawn', reason, attempts from requests_w
    union all
    select id, source_table, 'withdrawn', reason, attempts from requests_storage_w
    union all
    select id, source_table, 'withdrawn', reason, attempts from checks_w
    returning 1
  )
  select (select count(*) from requests_w)
       + (select count(*) from requests_storage_w)
       + (select count(*) from checks_w) into v_count;

  update public.verification_requests set selfie_media = null
  where account_id = p_account_id and selfie_media is not null;

  /* Withdrawal is an erasure request, so the reference is dropped here as well:
     the object itself is removed by the leased worker, and a dangling path would
     otherwise keep pointing at a byte the member asked to have released. */
  update public.verification_requests set selfie_storage_path = null
  where account_id = p_account_id and selfie_storage_path is not null;

  update public.user_profiles set is_verified = false where id = p_account_id;

  return v_count;
end;
$$;

revoke all on function public.fb15_withdraw_selfies(uuid) from public, anon, authenticated;
grant execute on function public.fb15_withdraw_selfies(uuid) to service_role;

/* Completion. Same contract as before, plus: when the purged asset was a
   `verification_requests` Storage reference, the reference is cleared in the
   same transaction that records completion — and only when it still names the
   exact path that was proven absent, so a newer upload at a reused path is never
   unlinked. */
create or replace function public.fb15_complete_retention_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_inline_absent boolean,
  p_storage_absent boolean,
  p_expected_object_id uuid
)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_job public.verification_selfie_retention_jobs%rowtype;
  v_hold text;
begin
  select * into v_job from public.verification_selfie_retention_jobs
  where id = p_job_id and status = 'processing' and lease_token = p_lease_token
  for update;
  if not found then return 'stale_lease'; end if;

  v_hold := public.fb15_job_hold_reason(p_job_id);
  if v_hold is not null then
    update public.verification_selfie_retention_jobs
    set status = 'held', error_code = 'hold_changed', lease_token = null, lease_expires_at = null, updated_at = now()
    where id = p_job_id;
    perform public.fb15_audit(p_job_id, 'hold_protected');
    return 'hold_protected';
  end if;

  if v_job.has_inline then
    if p_inline_absent is not true or exists (
      select 1 from public.verification_requests where id = v_job.source_id and selfie_media is not null
    ) then
      return 'verification_failed';
    end if;
  elsif v_job.storage_path is not null then
    if p_storage_absent is not true then return 'verification_failed'; end if;
    if v_job.storage_object_id is not null then
      if p_expected_object_id is distinct from v_job.storage_object_id then return 'verification_failed'; end if;
      if exists (select 1 from storage.objects where id = v_job.storage_object_id) then return 'verification_failed'; end if;
    elsif exists (select 1 from storage.objects where bucket_id = 'verification-selfies' and name = v_job.storage_path) then
      return 'verification_failed';
    end if;

    /* Clear the relational reference only for the home that was just proven
       empty, and only if it still points at that exact object. */
    if v_job.source_table = 'verification_requests' then
      update public.verification_requests
      set selfie_storage_path = null
      where id = v_job.source_id
        and selfie_storage_path = v_job.storage_path;
      if exists (
        select 1 from public.verification_requests
        where id = v_job.source_id and selfie_storage_path = v_job.storage_path
      ) then
        return 'verification_failed';
      end if;
    end if;
  else
    return 'verification_failed';
  end if;

  update public.verification_selfie_retention_jobs
  set status = 'completed', completed_at = now(), lease_token = null, lease_expires_at = null,
      error_code = null, updated_at = now()
  where id = p_job_id;

  insert into public.verification_selfie_retention_audit (
    job_id, source_table, event, reason, attempts, inline_absent, storage_absent
  ) values (
    v_job.id, v_job.source_table, 'completed', v_job.reason, v_job.attempts,
    case when v_job.has_inline then true else null end,
    case when v_job.storage_path is not null then true else null end
  );
  return 'completed';
end;
$$;

revoke all on function public.fb15_complete_retention_job(uuid, uuid, boolean, boolean, uuid) from public, anon, authenticated;
grant execute on function public.fb15_complete_retention_job(uuid, uuid, boolean, boolean, uuid) to service_role;

/* --- 6. fail-closed verification ------------------------------------------- */

/* If any part of the contract above did not land, the migration fails and the
   transaction rolls back. A half-applied privacy change is worse than none. */
do $$
declare
  v_columns integer;
  v_one_home boolean := false;
  v_owned boolean := false;
  v_leak integer;
begin
  select count(*) into v_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'verification_requests'
    and column_name = 'selfie_storage_path';
  if v_columns <> 1 then
    raise exception 'MED-INLINE-SELFIE: verification_requests.selfie_storage_path is missing';
  end if;

  select exists (select 1 from pg_constraint where conname = 'verification_requests_selfie_one_home')
    into v_one_home;
  if not v_one_home then
    raise exception 'MED-INLINE-SELFIE: the one-home check constraint is missing';
  end if;

  select exists (select 1 from pg_constraint where conname = 'verification_requests_selfie_path_owned')
    into v_owned;
  if not v_owned then
    raise exception 'MED-INLINE-SELFIE: the owned-path check constraint is missing';
  end if;

  /* Compared against fragments that survive pg_get_constraintdef normalisation
     (`like` is rendered as `~~`, casts are made explicit), not against the source
     text of the statement above. */
  if (
    select count(*) from pg_constraint
    where conname = 'verification_requests_selfie_path_owned'
      and position('fb15_owned_selfie_path' in pg_get_constraintdef(oid)) > 0
      and position('/%' in pg_get_constraintdef(oid)) > 0
  ) <> 1 then
    raise exception 'MED-INLINE-SELFIE: the owned-path constraint lost the member-folder requirement';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fb15_finalize_selfie_move' and p.prosecdef = true
  ) then
    raise exception 'MED-INLINE-SELFIE: fb15_finalize_selfie_move is not installed as SECURITY DEFINER';
  end if;

  /* The scanner must never treat a referenced selfie as an orphan. */
  if position('not exists (select 1 from public.verification_requests r where r.selfie_storage_path = o.name)'
      in pg_get_functiondef('public.fb15_scan_retention(integer)'::regprocedure)) = 0 then
    raise exception 'MED-INLINE-SELFIE: fb15_scan_retention lost the verification_requests orphan exclusion';
  end if;
  if position('request-storage:' in pg_get_functiondef('public.fb15_scan_retention(integer)'::regprocedure)) = 0 then
    raise exception 'MED-INLINE-SELFIE: fb15_scan_retention does not enqueue Storage-backed request selfies';
  end if;

  /* No member role may reach the new column, the mover or the move audit. */
  select count(*) into v_leak
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('verification_selfie_move_audit')
    and grantee in ('anon','authenticated','PUBLIC');
  if v_leak > 0 then
    raise exception 'MED-INLINE-SELFIE: % member-role grant(s) leaked onto the move audit', v_leak;
  end if;

  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema = 'public' and routine_name = 'fb15_finalize_selfie_move'
      and grantee in ('anon','authenticated','PUBLIC')
  ) then
    raise exception 'MED-INLINE-SELFIE: the mover function is reachable by a member role';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'verification_selfie_move_audit'
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'MED-INLINE-SELFIE: the move audit is not RLS enabled+forced';
  end if;
end;
$$;

commit;
