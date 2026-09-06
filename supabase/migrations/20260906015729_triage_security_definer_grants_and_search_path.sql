-- P1: triage SECURITY DEFINER grants + pin search_path on helpers.
-- Intentional player/admin RPCs remain executable by authenticated.
-- Internal helpers are revoked from anon/authenticated (service_role / owner only).
-- Staging only via forward migration. Demo GIK only.

-- ---------------------------------------------------------------------------
-- admin_session_id: was PUBLIC-executable (PostgREST surface). Pin search_path
-- and revoke client roles. Called only from other SECURITY DEFINER admin RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.admin_session_id()
returns text
language sql
stable
set search_path = pg_catalog, public, auth
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'session_id', ''),
    md5(coalesce(auth.jwt() ->> 'sub', '') || ':' || coalesce(auth.jwt() ->> 'iat', '0'))
  );
$$;

revoke all on function public.admin_session_id() from public, anon, authenticated;
grant execute on function public.admin_session_id() to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers previously callable by authenticated
-- ---------------------------------------------------------------------------
revoke all on function public.assert_admin_auth_rate_limit(text)
  from public, anon, authenticated;
grant execute on function public.assert_admin_auth_rate_limit(text) to service_role;

revoke all on function public.open_game_round(text, public.game_mode, jsonb)
  from public, anon, authenticated;
grant execute on function public.open_game_round(text, public.game_mode, jsonb) to service_role;

revoke all on function public.ensure_player_round(text)
  from public, anon, authenticated;
grant execute on function public.ensure_player_round(text) to service_role;

-- Defense in depth for settle-bound engagement helpers
revoke all on function public.apply_settled_bet_engagement(uuid, text, boolean, bigint)
  from public, anon, authenticated;
grant execute on function public.apply_settled_bet_engagement(uuid, text, boolean, bigint)
  to service_role;

revoke all on function public.record_mission_progress(text) from public, anon, authenticated;
revoke all on function public.unlock_achievement(text) from public, anon, authenticated;
grant execute on function public.record_mission_progress(text) to service_role;
grant execute on function public.unlock_achievement(text) to service_role;

revoke all on function public.admin_has_verified_totp(uuid) from public, anon, authenticated;
grant execute on function public.admin_has_verified_totp(uuid) to service_role;

-- Keep feature flag readable for app shells (safe read helper).
revoke all on function public.feature_flag_enabled(text) from public, anon;
grant execute on function public.feature_flag_enabled(text) to authenticated, service_role;

-- Leaderboard refresh: require authenticated identity (body previously had no auth gate).
create or replace function public.refresh_leaderboard_entries()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null
     and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  -- Current credit
  insert into public.leaderboard_entries (
    board, player_id, nickname, avatar_url, metric_value, rank, snapshot_at
  )
  select
    'current_credit'::public.leaderboard_board,
    pb.player_id,
    p.nickname,
    p.avatar_url,
    pb.balance,
    0,
    now()
  from public.player_balances pb
  join public.profiles p on p.id = pb.player_id
  where p.status = 'active' and not p.is_qa_account
  on conflict (board, player_id) do update
  set nickname = excluded.nickname,
      avatar_url = excluded.avatar_url,
      metric_value = excluded.metric_value,
      snapshot_at = now();

  -- Cumulative winnings
  insert into public.leaderboard_entries (
    board, player_id, nickname, avatar_url, metric_value, rank, snapshot_at
  )
  select
    'cumulative_winnings'::public.leaderboard_board,
    le.player_id,
    p.nickname,
    p.avatar_url,
    coalesce(sum(le.amount), 0),
    0,
    now()
  from public.gik_ledger le
  join public.profiles p on p.id = le.player_id
  where le.entry_type = 'game_payout'
    and p.status = 'active'
    and not p.is_qa_account
  group by le.player_id, p.nickname, p.avatar_url
  on conflict (board, player_id) do update
  set nickname = excluded.nickname,
      avatar_url = excluded.avatar_url,
      metric_value = excluded.metric_value,
      snapshot_at = now();

  -- Most wins
  insert into public.leaderboard_entries (
    board, player_id, nickname, avatar_url, metric_value, rank, snapshot_at
  )
  select
    'most_wins'::public.leaderboard_board,
    r.player_id,
    p.nickname,
    p.avatar_url,
    count(*)::bigint,
    0,
    now()
  from public.receipts r
  join public.profiles p on p.id = r.player_id
  where r.is_win
    and p.status = 'active'
    and not p.is_qa_account
  group by r.player_id, p.nickname, p.avatar_url
  on conflict (board, player_id) do update
  set nickname = excluded.nickname,
      avatar_url = excluded.avatar_url,
      metric_value = excluded.metric_value,
      snapshot_at = now();

  update public.leaderboard_entries le
  set rank = ranked.r
  from (
    select id,
           rank() over (partition by board order by metric_value desc) as r
    from public.leaderboard_entries
  ) ranked
  where le.id = ranked.id;
end;
$$;

comment on function public.refresh_leaderboard_entries() is
  'Intentional authenticated cache rebuild. Identity required; no privileged mutation of balances.';

-- ---------------------------------------------------------------------------
-- Document intentional authenticated SECURITY DEFINER RPCs (Advisor WARN OK)
-- ---------------------------------------------------------------------------
comment on function public.place_and_settle_bet(text, text, bigint, jsonb, public.game_mode, jsonb) is
  'Intentional authenticated player RPC. Identity from auth.uid(); eligibility + ledger atomic.';
comment on function public.assert_play_allowed() is
  'Intentional authenticated gate. Used by clients and called inside mutators.';
comment on function public.assert_admin_sensitive() is
  'Intentional authenticated admin gate. Fail-closed PIN/2FA + AAL2.';
comment on function public.verify_admin_2fa(text) is
  'Intentional authenticated admin RPC. Requires Auth MFA AAL2; rejects demo codes.';
comment on function public.verify_admin_pin(text) is
  'Intentional authenticated admin RPC. Session-scoped PIN challenge.';
comment on function public.mark_contact_verified(text, uuid) is
  'Intentional authenticated RPC. Requires Auth email/phone confirmation evidence.';
comment on function public.claim_daily_reward() is
  'Intentional authenticated player RPC. Eligibility-gated; once per UTC day.';
comment on function public.claim_mission_reward(uuid) is
  'Intentional authenticated player RPC. Once-only claim after settle-bound progress.';
comment on function public.feature_flag_enabled(text) is
  'Intentional authenticated read helper for feature flags.';

-- ---------------------------------------------------------------------------
-- Performance: contacts SELECT already consolidated to contacts_select_combined
-- on staging (migration 20260905155508). Guard against regression if old
-- dual policies ever reappear on a restored environment.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_contacts'
      and policyname in ('contacts_select_own', 'contacts_select_admin',
                         'player_contacts_select_own', 'player_contacts_select_admin')
  ) then
    drop policy if exists contacts_select_combined on public.player_contacts;
    create policy contacts_select_combined
      on public.player_contacts
      for select
      to authenticated
      using (
        player_id = (select auth.uid())
        or public.has_permission('players.view'::public.app_permission, (select auth.uid()))
      );
    drop policy if exists contacts_select_own on public.player_contacts;
    drop policy if exists contacts_select_admin on public.player_contacts;
    drop policy if exists player_contacts_select_own on public.player_contacts;
    drop policy if exists player_contacts_select_admin on public.player_contacts;
  end if;
end $$;
