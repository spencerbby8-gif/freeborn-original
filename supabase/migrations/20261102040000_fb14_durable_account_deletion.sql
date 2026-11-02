-- FB-14: durable account-deletion and storage-cleanup queue.
-- Additive only. No existing table is dropped/truncated, no existing row is
-- rewritten, and no client role receives queue-table access. The queue survives
-- the member row because cleanup must still be provable after auth deletion.

begin;

create table if not exists public.account_deletion_requests (
  account_id uuid primary key,
  status_token uuid not null default gen_random_uuid(),
  status text not null default 'cleanup_pending'
    check (status in ('cleanup_pending','completed','cleanup_failed')),
  requested_at timestamptz not null default now(),
  relational_deleted_at timestamptz,
  storage_completed_at timestamptz,
  last_error text,
  constraint account_deletion_requests_token_unique unique (status_token),
  constraint account_deletion_requests_completed_has_time
    check (status <> 'completed' or storage_completed_at is not null)
);

create table if not exists public.storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  deletion_account_id uuid not null
    references public.account_deletion_requests(account_id) on delete cascade,
  bucket text not null check (bucket in ('profile-photos','verification-selfies')),
  owner_prefix text not null,
  object_paths text[] not null default '{}'::text[],
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint storage_cleanup_jobs_owner_prefix
    check (owner_prefix = deletion_account_id::text || '/'),
  constraint storage_cleanup_jobs_one_bucket_per_account
    unique (deletion_account_id, bucket),
  constraint storage_cleanup_jobs_processing_has_lease
    check (status <> 'processing' or (lease_token is not null and lease_expires_at is not null)),
  constraint storage_cleanup_jobs_completed_has_time
    check (status <> 'completed' or completed_at is not null)
);

create index if not exists storage_cleanup_jobs_due_idx
  on public.storage_cleanup_jobs (status, next_attempt_at, lease_expires_at, created_at);
create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests (status, requested_at);

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;
alter table public.storage_cleanup_jobs enable row level security;
alter table public.storage_cleanup_jobs force row level security;

revoke all on public.account_deletion_requests from public, anon, authenticated;
revoke all on public.storage_cleanup_jobs from public, anon, authenticated;
grant all on public.account_deletion_requests to service_role;
grant all on public.storage_cleanup_jobs to service_role;

drop policy if exists "service_role manages account deletion requests" on public.account_deletion_requests;
create policy "service_role manages account deletion requests"
  on public.account_deletion_requests for all to service_role
  using (true) with check (true);

drop policy if exists "service_role manages storage cleanup jobs" on public.storage_cleanup_jobs;
create policy "service_role manages storage cleanup jobs"
  on public.storage_cleanup_jobs for all to service_role
  using (true) with check (true);

-- Path validation is deliberately narrow. A cleanup job may sweep the member's
-- own folder, plus the one legacy selfie shape that was named after the member.
-- It may never name another member's folder, a URL, a traversal, or a bucket root.
create or replace function public.fb14_owned_storage_path(
  p_account_id uuid,
  p_bucket text,
  p_path text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    p_account_id is not null
    and p_bucket in ('profile-photos','verification-selfies')
    and p_path is not null
    and length(p_path) between 1 and 512
    and p_path !~ '(^/|^[A-Za-z][A-Za-z0-9+.-]*:|\\|(^|/)\.\.(/|$))'
    and (
      p_path like p_account_id::text || '/%'
      or (
        p_bucket = 'verification-selfies'
        and p_path like 'selfie-' || p_account_id::text || '-%'
        and p_path not like '%/%'
      )
    );
$$;

revoke all on function public.fb14_owned_storage_path(uuid, text, text) from public, anon, authenticated;
grant execute on function public.fb14_owned_storage_path(uuid, text, text) to service_role;

-- Public status lookup: random token in, minimal status out. It returns no
-- account id, email, object path, lease, or error detail.
create or replace function public.fb14_deletion_status(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'status', r.status,
    'requestedAt', r.requested_at,
    'completedAt', r.storage_completed_at
  )
  from public.account_deletion_requests r
  where r.status_token = p_token;
$$;

revoke all on function public.fb14_deletion_status(uuid) from public, anon, authenticated;
grant execute on function public.fb14_deletion_status(uuid) to anon, authenticated, service_role;

-- Claim due work with a lease. Interrupted processing rows become claimable
-- again after lease expiry; exhausted rows are failed instead of looping forever.
create or replace function public.fb14_claim_cleanup_jobs(p_limit integer default 5)
returns table (
  id uuid,
  deletion_account_id uuid,
  bucket text,
  owner_prefix text,
  object_paths text[],
  attempts integer,
  lease_token uuid
)
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.storage_cleanup_jobs j
  set status = 'failed',
      last_error = coalesce(j.last_error, 'lease expired after maximum attempts'),
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where j.status = 'processing'
    and j.lease_expires_at <= now()
    and j.attempts >= j.max_attempts;

  update public.account_deletion_requests r
  set status = 'cleanup_failed',
      last_error = 'storage cleanup exhausted retries',
      storage_completed_at = null
  where exists (
    select 1 from public.storage_cleanup_jobs j
    where j.deletion_account_id = r.account_id and j.status = 'failed'
  )
  and r.status <> 'cleanup_failed';

  return query
  with candidate as (
    select j.id
    from public.storage_cleanup_jobs j
    where (
      j.status = 'pending' and j.next_attempt_at <= now() and j.attempts < j.max_attempts
    ) or (
      j.status = 'processing' and j.lease_expires_at <= now() and j.attempts < j.max_attempts
    )
    order by j.created_at, j.id
    limit greatest(1, least(coalesce(p_limit, 5), 20))
    for update skip locked
  )
  update public.storage_cleanup_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '5 minutes',
      updated_at = now()
  from candidate c
  where j.id = c.id
  returning j.id, j.deletion_account_id, j.bucket, j.owner_prefix, j.object_paths, j.attempts, j.lease_token;
end;
$$;

revoke all on function public.fb14_claim_cleanup_jobs(integer) from public, anon, authenticated;
grant execute on function public.fb14_claim_cleanup_jobs(integer) to service_role;

create or replace function public.fb14_complete_cleanup_job(p_job_id uuid, p_lease_token uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_account uuid;
begin
  update public.storage_cleanup_jobs j
  set status = 'completed',
      completed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = now()
  where j.id = p_job_id
    and j.status = 'processing'
    and j.lease_token = p_lease_token
  returning j.deletion_account_id into v_account;

  if v_account is null then
    return false;
  end if;

  update public.account_deletion_requests r
  set status = 'completed',
      storage_completed_at = now(),
      last_error = null
  where r.account_id = v_account
    and not exists (
      select 1 from public.storage_cleanup_jobs j
      where j.deletion_account_id = v_account and j.status <> 'completed'
    );

  return true;
end;
$$;

revoke all on function public.fb14_complete_cleanup_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fb14_complete_cleanup_job(uuid, uuid) to service_role;

create or replace function public.fb14_fail_cleanup_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error text
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_account uuid;
  v_attempts integer;
  v_max integer;
begin
  update public.storage_cleanup_jobs j
  set status = case when j.attempts >= j.max_attempts then 'failed' else 'pending' end,
      next_attempt_at = now() + least(
        interval '1 hour',
        interval '30 seconds' * power(2, least(j.attempts - 1, 6))
      ),
      lease_token = null,
      lease_expires_at = null,
      last_error = left(coalesce(p_error, 'storage cleanup failed'), 500),
      updated_at = now()
  where j.id = p_job_id
    and j.status = 'processing'
    and j.lease_token = p_lease_token
  returning j.deletion_account_id, j.attempts, j.max_attempts
  into v_account, v_attempts, v_max;

  if v_account is null then
    return false;
  end if;

  update public.account_deletion_requests r
  set status = case when v_attempts >= v_max then 'cleanup_failed' else 'cleanup_pending' end,
      last_error = left(coalesce(p_error, 'storage cleanup failed'), 500),
      storage_completed_at = null
  where r.account_id = v_account;

  return true;
end;
$$;

revoke all on function public.fb14_fail_cleanup_job(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fb14_fail_cleanup_job(uuid, uuid, text) to service_role;

-- Operator recovery for an exhausted job. This does not delete anything itself;
-- it only returns the job to the same leased, path-validated worker path.
create or replace function public.fb14_requeue_failed_jobs(p_account_id uuid)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.storage_cleanup_jobs j
  set status = 'pending',
      attempts = 0,
      next_attempt_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = now()
  where j.deletion_account_id = p_account_id
    and j.status = 'failed';
  get diagnostics v_count = row_count;

  if v_count > 0 then
    update public.account_deletion_requests r
    set status = 'cleanup_pending', last_error = null, storage_completed_at = null
    where r.account_id = p_account_id;
  end if;

  return v_count;
end;
$$;

revoke all on function public.fb14_requeue_failed_jobs(uuid) from public, anon, authenticated;
grant execute on function public.fb14_requeue_failed_jobs(uuid) to service_role;

commit;
