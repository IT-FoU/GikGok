-- Triage privileged DEFINER surfaces (forward-only).
-- refresh_leaderboard_entries: service_role / system.settings only.
-- get_setting: whitelist client-safe keys for ordinary players.

CREATE OR REPLACE FUNCTION public.refresh_leaderboard_entries()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  -- Ordinary players must not rebuild leaderboards.
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    null;
  elsif auth.uid() is not null
        and public.has_permission('system.settings'::public.app_permission, auth.uid()) then
    null;
  else
    raise exception 'leaderboard refresh requires service role or system.settings'
      using errcode = 'insufficient_privilege';
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
$function$
;

comment on function public.refresh_leaderboard_entries() is
  'ADMIN/SERVICE. Rebuilds leaderboard snapshots. Not callable by ordinary players.';

create or replace function public.get_setting(p_key text, p_default jsonb default null::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to pg_catalog, public
as $function$
declare
  allowed boolean := false;
begin
  if auth.uid() is null
     and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or (
       auth.uid() is not null
       and public.has_permission('system.settings'::public.app_permission, auth.uid())
     ) then
    allowed := true;
  else
    allowed := p_key in (
      'locale.default',
      'theme.system_accent',
      'responsible.demo_notice',
      'responsible.daily_bet_limit',
      'responsible.pause_days_options',
      'responsible.session_break_minutes',
      'rewards.daily_base',
      'rewards.max_balance_for_daily',
      'rewards.streak_day3_bonus',
      'rewards.streak_day7_bonus',
      'rewards.welcome_credit'
    );
  end if;

  if not allowed then
    raise exception 'setting key is not client-readable'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(
    (select s.value from public.system_settings s where s.key = p_key),
    p_default
  );
end;
$function$;

comment on function public.get_setting(text, jsonb) is
  'Authenticated. Client-safe setting whitelist for players; full read for system.settings / service_role.';

comment on function public.is_admin(uuid) is
  'SAFE READ HELPER. Used by RLS and admin gates. EXECUTE kept for authenticated.';
comment on function public.is_owner(uuid) is
  'SAFE READ HELPER. Used by RLS and owner gates. EXECUTE kept for authenticated.';
comment on function public.assert_play_allowed() is
  'PUBLIC PLAYER RPC. Eligibility gate before play mutations.';
comment on function public.assert_admin_sensitive() is
  'PUBLIC ADMIN RPC helper. Fail-closed PIN/aal2 gate for sensitive admin RPCs.';
