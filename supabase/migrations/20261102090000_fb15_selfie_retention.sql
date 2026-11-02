-- FB-15: lifecycle retention for verification selfies.
-- Additive only. No existing member row is rewritten by this migration and no
-- image bytes are copied into the queue/audit. The user-approved policy rule is
-- Privacy clause 7: pending reviews and approved account references are held;
-- rejected/superseded images are released; there is no invented pending TTL.

begin;

create table if not exists public.verification_selfie_retention_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_key text not null unique,
  account_id uuid not null,
  source_table text not null
    check (source_table in ('verification_requests','verification_selfie_checks','storage_orphan')),
  source_id uuid,
  storage_path text,
  storage_object_id uuid,
  has_inline boolean not null default false,
  reason text not null check (reason in ('rejected','superseded','withdrawn','orphaned')),
  status text not null default 'pending'
    check (status in ('pending','processing','held','completed','failed','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  error_code text check (
    error_code is null or error_code in (
      'storage_list_failed','storage_remove_failed','storage_verify_failed',
      'inline_purge_failed','hold_changed','path_invalid','stale_lease','internal_error'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint vsrj_source_shape check (
    (source_table = 'storage_orphan' and source_id is null and storage_path is not null and has_inline = false)
    or (source_table <> 'storage_orphan' and source_id is not null)
  ),
  constraint vsrj_inline_shape check (
    has_inline = false or (source_table = 'verification_requests' and storage_path is null and storage_object_id is null)
  ),
  constraint vsrj_processing_has_lease check (
    status <> 'processing' or (lease_token is not null and lease_expires_at is not null)
  ),
  constraint vsrj_completed_has_time check (status <> 'completed' or completed_at is not null)
);

create index if not exists vsrj_due_idx
  on public.verification_selfie_retention_jobs (status, next_attempt_at, lease_expires_at, created_at);
create index if not exists vsrj_account_idx
  on public.verification_selfie_retention_jobs (account_id, status);
create unique index if not exists vsrj_storage_object_unique
  on public.verification_selfie_retention_jobs (storage_object_id)
  where storage_object_id is not null;

-- Metadata-only audit: no image, data URL, object path, raw provider error, or
-- free-form payload. Job ids are enough for an operator to join the restricted
-- queue when investigating a failure.
create table if not exists public.verification_selfie_retention_audit (
  id bigint generated always as identity primary key,
  job_id uuid not null,
  source_table text not null,
  event text not null check (event in ('enqueued','hold_protected','hold_released','completed','failed','requeued','withdrawn')),
  reason text not null,
  attempts integer not null default 0,
  inline_absent boolean,
  storage_absent boolean,
  hold_reason text,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists vsra_job_idx on public.verification_selfie_retention_audit (job_id, created_at);

alter table public.verification_selfie_retention_jobs enable row level security;
alter table public.verification_selfie_retention_jobs force row level security;
alter table public.verification_selfie_retention_audit enable row level security;
alter table public.verification_selfie_retention_audit force row level security;

revoke all on public.verification_selfie_retention_jobs from public, anon, authenticated;
revoke all on public.verification_selfie_retention_audit from public, anon, authenticated;
grant all on public.verification_selfie_retention_jobs to service_role;
grant all on public.verification_selfie_retention_audit to service_role;

drop policy if exists "service_role manages selfie retention jobs" on public.verification_selfie_retention_jobs;
create policy "service_role manages selfie retention jobs"
  on public.verification_selfie_retention_jobs for all to service_role
  using (true) with check (true);

drop policy if exists "service_role reads selfie retention audit" on public.verification_selfie_retention_audit;
create policy "service_role reads selfie retention audit"
  on public.verification_selfie_retention_audit for all to service_role
  using (true) with check (true);

create or replace function public.fb15_owned_selfie_path(p_account_id uuid, p_path text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    p_account_id is not null
    and p_path is not null
    and length(p_path) between 1 and 512
    and p_path !~ '(^/|^[A-Za-z][A-Za-z0-9+.-]*:|\\|(^|/)\.\.(/|$))'
    and (
      p_path like p_account_id::text || '/%'
      or (p_path like 'selfie-' || p_account_id::text || '-%' and p_path not like '%/%')
    );
$$;

revoke all on function public.fb15_owned_selfie_path(uuid, text) from public, anon, authenticated;
grant execute on function public.fb15_owned_selfie_path(uuid, text) to service_role;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vsrj_path_owned') then
    alter table public.verification_selfie_retention_jobs
      add constraint vsrj_path_owned
      check (storage_path is null or public.fb15_owned_selfie_path(account_id, storage_path));
  end if;
end;
$$;

-- Hold rules. withdrawn overrides every hold (erasure trigger). Pending reviews
-- and approved references are held; there is no age-based expiry.
create or replace function public.fb15_job_hold_reason(p_job_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.verification_selfie_retention_jobs%rowtype;
  v_status text;
  v_latest uuid;
begin
  select * into v_job from public.verification_selfie_retention_jobs where id = p_job_id;
  if not found or v_job.reason = 'withdrawn' or v_job.source_table = 'storage_orphan' then
    return null;
  end if;

  if v_job.source_table = 'verification_requests' then
    select status into v_status from public.verification_requests where id = v_job.source_id;
    if v_status = 'approved' then return 'approved_reference'; end if;
    if v_status = 'pending' and v_job.reason <> 'superseded' then return 'pending_review'; end if;
    if v_status = 'pending' and v_job.reason = 'superseded' then
      select id into v_latest
      from public.verification_requests
      where account_id = v_job.account_id and status = 'pending'
      order by submitted_at desc, id desc
      limit 1;
      if v_latest = v_job.source_id then return 'pending_review'; end if;
    end if;
    return null;
  end if;

  if v_job.source_table = 'verification_selfie_checks' then
    select status into v_status from public.verification_selfie_checks where id = v_job.source_id;
    if v_status = 'approved' then return 'approved_reference'; end if;
    if v_status in ('pending','error') then return 'pending_review'; end if;
  end if;
  return null;
end;
$$;

revoke all on function public.fb15_job_hold_reason(uuid) from public, anon, authenticated;
grant execute on function public.fb15_job_hold_reason(uuid) to service_role;

create or replace function public.fb15_audit(p_job_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.verification_selfie_retention_audit (
    job_id, source_table, event, reason, attempts, hold_reason, error_code
  )
  select j.id, j.source_table, p_event, j.reason, j.attempts,
         public.fb15_job_hold_reason(j.id), j.error_code
  from public.verification_selfie_retention_jobs j
  where j.id = p_job_id;
end;
$$;

revoke all on function public.fb15_audit(uuid, text) from public, anon, authenticated;
grant execute on function public.fb15_audit(uuid, text) to service_role;

-- Scanner. It registers work; it never deletes bytes. Orphan objects must be
-- older than 15 minutes (the existing challenge TTL, used only as an upload-race
-- guard, not as a retention period) and must sit on an owned, unreferenced path.
-- Candidates that already have a job are excluded BEFORE the limit so that
-- completed/failed rows can never starve newer work.
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

-- Called before a fresh verification attempt. Inline bytes are released in the
-- same transaction that records durable verification work; verdicts/reasons stay.
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
      asset_key, account_id, source_table, source_id, has_inline, reason
    )
    select 'request:' || r.id::text, r.account_id, 'verification_requests', r.id, true, 'superseded'
    from public.verification_requests r
    where r.account_id = p_account_id and r.status = 'pending' and r.selfie_media is not null
    on conflict (asset_key) do nothing
    returning id, source_table, reason, attempts
  ), audited as (
    insert into public.verification_selfie_retention_audit (job_id, source_table, event, reason, attempts)
    select id, source_table, 'enqueued', reason, attempts from inserted
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  update public.verification_requests
  set selfie_media = null
  where account_id = p_account_id and status = 'pending' and selfie_media is not null;

  return v_count;
end;
$$;

revoke all on function public.fb15_supersede_pending_requests(uuid) from public, anon, authenticated;
grant execute on function public.fb15_supersede_pending_requests(uuid) to service_role;

-- Consent withdrawal removes the seal and enqueues every selfie copy. Existing
-- non-completed jobs for the same asset are converted to withdrawn (withdrawn
-- overrides holds). Completed jobs are left alone. Metadata/verdict rows remain.
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
    select id, source_table, 'withdrawn', reason, attempts from checks_w
    returning 1
  )
  select (select count(*) from requests_w) + (select count(*) from checks_w) into v_count;

  update public.verification_requests set selfie_media = null
  where account_id = p_account_id and selfie_media is not null;

  update public.user_profiles set is_verified = false where id = p_account_id;

  return v_count;
end;
$$;

revoke all on function public.fb15_withdraw_selfies(uuid) from public, anon, authenticated;
grant execute on function public.fb15_withdraw_selfies(uuid) to service_role;

-- Claim: (1) expire exhausted stale leases, (2) move held work to 'held' and
-- audit the transition once, (3) release held work whose hold has cleared,
-- (4) lease a batch of due work. Held jobs are never leased.
create or replace function public.fb15_claim_retention_jobs(p_limit integer default 10)
returns table (
  id uuid, asset_key text, account_id uuid, source_table text, source_id uuid,
  storage_path text, storage_object_id uuid, has_inline boolean, reason text,
  attempts integer, lease_token uuid
)
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.verification_selfie_retention_jobs j
  set status = 'failed', error_code = 'stale_lease', lease_token = null, lease_expires_at = null, updated_at = now()
  where j.status = 'processing' and j.lease_expires_at <= now() and j.attempts >= j.max_attempts;

  with held as (
    update public.verification_selfie_retention_jobs j
    set status = 'held', error_code = 'hold_changed', lease_token = null, lease_expires_at = null, updated_at = now()
    where j.status in ('pending','processing')
      and public.fb15_job_hold_reason(j.id) is not null
    returning j.id, j.source_table, j.reason, j.attempts, public.fb15_job_hold_reason(j.id) as hold_reason
  )
  insert into public.verification_selfie_retention_audit (job_id, source_table, event, reason, attempts, hold_reason, error_code)
  select h.id, h.source_table, 'hold_protected', h.reason, h.attempts, h.hold_reason, 'hold_changed' from held h;

  with released as (
    update public.verification_selfie_retention_jobs j
    set status = 'pending', attempts = 0, next_attempt_at = now(), error_code = null, updated_at = now()
    where j.status = 'held' and public.fb15_job_hold_reason(j.id) is null
    returning j.id, j.source_table, j.reason, j.attempts
  )
  insert into public.verification_selfie_retention_audit (job_id, source_table, event, reason, attempts)
  select r.id, r.source_table, 'hold_released', r.reason, r.attempts from released r;

  insert into public.verification_selfie_retention_audit (job_id, source_table, event, reason, attempts, error_code)
  select j.id, j.source_table, 'failed', j.reason, j.attempts, j.error_code
  from public.verification_selfie_retention_jobs j
  where j.status = 'failed'
    and not exists (
      select 1 from public.verification_selfie_retention_audit a
      where a.job_id = j.id and a.event = 'failed' and a.attempts = j.attempts
    );

  return query
  with candidate as (
    select j.id
    from public.verification_selfie_retention_jobs j
    where (
      j.status = 'pending' and j.next_attempt_at <= now() and j.attempts < j.max_attempts
    ) or (
      j.status = 'processing' and j.lease_expires_at <= now() and j.attempts < j.max_attempts
    )
    order by j.created_at, j.id
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.verification_selfie_retention_jobs j
  set status = 'processing', attempts = j.attempts + 1,
      lease_token = gen_random_uuid(), lease_expires_at = now() + interval '5 minutes',
      error_code = null, updated_at = now()
  from candidate c
  where j.id = c.id
  returning j.id, j.asset_key, j.account_id, j.source_table, j.source_id,
            j.storage_path, j.storage_object_id, j.has_inline, j.reason, j.attempts, j.lease_token;
end;
$$;

revoke all on function public.fb15_claim_retention_jobs(integer) from public, anon, authenticated;
grant execute on function public.fb15_claim_retention_jobs(integer) to service_role;

create or replace function public.fb15_purge_inline(p_job_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_job public.verification_selfie_retention_jobs%rowtype;
begin
  select * into v_job from public.verification_selfie_retention_jobs
  where id = p_job_id and status = 'processing' and lease_token = p_lease_token
  for update;
  if not found then return false; end if;
  if not v_job.has_inline then return false; end if;
  if public.fb15_job_hold_reason(p_job_id) is not null then return false; end if;

  update public.verification_requests set selfie_media = null
  where id = v_job.source_id and account_id = v_job.account_id;

  return not exists (
    select 1 from public.verification_requests where id = v_job.source_id and selfie_media is not null
  );
end;
$$;

revoke all on function public.fb15_purge_inline(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fb15_purge_inline(uuid, uuid) to service_role;

create or replace function public.fb15_authorize_storage_purge(p_job_id uuid, p_lease_token uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_job public.verification_selfie_retention_jobs%rowtype;
begin
  select * into v_job from public.verification_selfie_retention_jobs
  where id = p_job_id and status = 'processing' and lease_token = p_lease_token;
  if not found then return null; end if;
  if public.fb15_job_hold_reason(p_job_id) is not null then return null; end if;
  if v_job.storage_path is null or not public.fb15_owned_selfie_path(v_job.account_id, v_job.storage_path) then
    return null;
  end if;
  return jsonb_build_object('storagePath', v_job.storage_path, 'storageObjectId', v_job.storage_object_id);
end;
$$;

revoke all on function public.fb15_authorize_storage_purge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fb15_authorize_storage_purge(uuid, uuid) to service_role;

-- Completion re-checks holds and proves absence. Return values:
-- completed | hold_protected | verification_failed | stale_lease
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

-- Failure with backoff. A job whose hold is active becomes 'held' (not retried
-- blindly); exhausted jobs become 'failed' and are visible to operators.
create or replace function public.fb15_fail_retention_job(p_job_id uuid, p_lease_token uuid, p_error_code text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_code text := p_error_code;
begin
  if v_code not in (
    'storage_list_failed','storage_remove_failed','storage_verify_failed',
    'inline_purge_failed','hold_changed','path_invalid','stale_lease','internal_error'
  ) then
    v_code := 'internal_error';
  end if;

  update public.verification_selfie_retention_jobs j
  set status = case
        when public.fb15_job_hold_reason(j.id) is not null then 'held'
        when j.attempts >= j.max_attempts then 'failed'
        else 'pending' end,
      next_attempt_at = now() + least(interval '1 hour', interval '30 seconds' * power(2, least(j.attempts - 1, 6))),
      lease_token = null, lease_expires_at = null, error_code = v_code, updated_at = now()
  where j.id = p_job_id and j.status = 'processing' and j.lease_token = p_lease_token;
  get diagnostics v_count = row_count;
  if v_count > 0 then perform public.fb15_audit(p_job_id, 'failed'); end if;
  return v_count > 0;
end;
$$;

revoke all on function public.fb15_fail_retention_job(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fb15_fail_retention_job(uuid, uuid, text) to service_role;

-- Operator/user-triggered retry of exhausted work. Only failed rows are reset;
-- every reset is audited by job id.
create or replace function public.fb15_requeue_failed_jobs(p_account_id uuid)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with requeued as (
    update public.verification_selfie_retention_jobs
    set status = 'pending', attempts = 0, next_attempt_at = now(), lease_token = null,
        lease_expires_at = null, error_code = null, updated_at = now()
    where account_id = p_account_id and status = 'failed'
    returning id, source_table, reason, attempts
  )
  insert into public.verification_selfie_retention_audit (job_id, source_table, event, reason, attempts)
  select id, source_table, 'requeued', reason, attempts from requeued;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.fb15_requeue_failed_jobs(uuid) from public, anon, authenticated;
grant execute on function public.fb15_requeue_failed_jobs(uuid) to service_role;

commit;
