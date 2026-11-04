-- Live-audit remediation: clients must not forge matches or server-owned
-- verification/trust state. Authenticated read access is preserved.
--
-- The Next.js API uses the privileged Postgres connection. Mutual matches are
-- created by handle_mutual_swipe(), a SECURITY DEFINER trigger. Onboarding is
-- the one legitimate member-context insert into verification_selfie_checks;
-- it remains possible only as an unscored, ungraded pending row.

begin;

-- Matches: creation belongs to the mutual-swipe trigger and lifecycle changes
-- belong to the server API. Keep "Users see their matches" SELECT unchanged.
revoke insert, update, delete on table public.user_matches from public, anon, authenticated;
drop policy if exists "System can manage matches" on public.user_matches;
drop policy if exists "Users can update their matches" on public.user_matches;

-- Trust inputs and scores are server-computed, never member assertions.
revoke insert, update, delete on table public.user_trust_history from public, anon, authenticated;
drop policy if exists "Users manage own private trust history" on public.user_trust_history;
create policy "Users view own private trust history"
  on public.user_trust_history for select
  to authenticated
  using (auth.uid() = user_id);

-- Rate-limit counters and cooldowns are enforcement state, not preferences.
revoke insert, update, delete on table public.verification_rate_limits from public, anon, authenticated;
drop policy if exists "Users manage own verification rate limits" on public.verification_rate_limits;
create policy "Users view own verification rate limits"
  on public.verification_rate_limits for select
  to authenticated
  using (auth.uid() = user_id);

-- A challenge has authority only when the server issued it.
revoke insert, update, delete on table public.verification_challenges from public, anon, authenticated;
drop policy if exists "Users manage own verification challenges" on public.verification_challenges;
create policy "Users view own verification challenges"
  on public.verification_challenges for select
  to authenticated
  using (auth.uid() = user_id);

-- Selfie decisions are server-only. Preserve the existing owner SELECT policy
-- and the onboarding pending submission, but prohibit graded/decision writes.
revoke update, delete on table public.verification_selfie_checks from public, anon, authenticated;
drop policy if exists "Users can update own verification checks" on public.verification_selfie_checks;
drop policy if exists "Users can insert own verification checks" on public.verification_selfie_checks;
create policy "Users submit own pending verification checks"
  on public.verification_selfie_checks for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and score is null
    and risk_score is null
  );

commit;
