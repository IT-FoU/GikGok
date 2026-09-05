-- Harden SECURITY DEFINER privileges, pin mutable search_path on trigger
-- helpers, add missing FK indexes, and optimize RLS auth.uid() initplans.
-- Forward-only. Does not modify previously applied migrations.

-- ============================================================================
-- 0) Prevent future default EXECUTE grants to anon/authenticated
-- ============================================================================
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- ============================================================================
-- 1) Trigger helpers (SECURITY INVOKER) — pin search_path
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace function public.prevent_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Rows in % are immutable and cannot be % ed',
    tg_table_name, lower(tg_op)
    using errcode = 'restrict_violation';
  return null;
end;
$$;

create or replace function public.apply_ledger_entry()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  prev_balance bigint;
  next_balance bigint;
begin
  insert into public.player_balances (player_id)
  values (new.player_id)
  on conflict (player_id) do nothing;

  select balance into prev_balance
  from public.player_balances
  where player_id = new.player_id
  for update;

  next_balance := prev_balance + new.amount;

  if next_balance < 0 then
    raise exception 'Insufficient GIK credits for player % (balance %, delta %)',
      new.player_id, prev_balance, new.amount
      using errcode = 'check_violation';
  end if;

  new.balance_after := next_balance;

  update public.player_balances
  set balance = next_balance,
      lifetime_credited = lifetime_credited + greatest(new.amount, 0),
      lifetime_debited = lifetime_debited + greatest(-new.amount, 0),
      total_wagered = total_wagered
        + case when new.entry_type = 'bet_debit'::public.ledger_entry_type then -new.amount else 0 end,
      total_won = total_won
        + case when new.entry_type = 'game_payout'::public.ledger_entry_type then new.amount else 0 end,
      updated_at = pg_catalog.now()
  where player_id = new.player_id;

  return new;
end;
$$;

create or replace function public.enforce_attachment_limit()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.message_id is not null
     and (
       select count(*) from public.ticket_attachments
       where message_id = new.message_id
     ) >= 3 then
    raise exception 'A message may have at most 3 attachments'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_mutation() from public, anon, authenticated;
revoke all on function public.apply_ledger_entry() from public, anon, authenticated;
revoke all on function public.enforce_attachment_limit() from public, anon, authenticated;

-- ============================================================================
-- 2) RLS helpers — DEFINER required to read admin tables under RLS.
--    Non-service callers are forced to auth.uid() (ignore spoofed uid arg).
-- ============================================================================
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    v_uid := uid;
  else
    v_uid := auth.uid();
  end if;
  if v_uid is null then
    return false;
  end if;
  return exists (
    select 1 from public.admin_users a
    where a.id = v_uid and a.is_active
  );
end;
$$;

create or replace function public.is_owner(uid uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    v_uid := uid;
  else
    v_uid := auth.uid();
  end if;
  if v_uid is null then
    return false;
  end if;
  return exists (
    select 1 from public.admin_users a
    where a.id = v_uid and a.is_active and a.is_owner
  );
end;
$$;

create or replace function public.has_permission(
  perm public.app_permission,
  uid uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid;
  v_override boolean;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    v_uid := uid;
  else
    v_uid := auth.uid();
  end if;
  if v_uid is null then
    return false;
  end if;
  if exists (
    select 1 from public.admin_users a
    where a.id = v_uid and a.is_active and a.is_owner
  ) then
    return true;
  end if;
  if not exists (
    select 1 from public.admin_users a
    where a.id = v_uid and a.is_active
  ) then
    return false;
  end if;
  select aup.granted into v_override
  from public.admin_user_permissions aup
  where aup.admin_id = v_uid and aup.permission = perm;
  if found then
    return coalesce(v_override, false);
  end if;
  return exists (
    select 1
    from public.admin_user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.admin_id = v_uid and rp.permission = perm
  );
end;
$$;

-- ============================================================================
-- 3) SECURITY DEFINER RPCs / internal helpers
-- ============================================================================

-- Trigger: new auth user bootstrap (DEFINER required)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_nickname text;
begin
  v_nickname := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''),
    'player_' || substr(replace(new.id::text, '-', ''), 1, 10)
  );

  insert into public.profiles (id, nickname)
  values (new.id, v_nickname)
  on conflict (id) do nothing;

  insert into public.player_settings (player_id)
  values (new.id)
  on conflict (player_id) do nothing;

  return new;
end;
$$;

-- Internal ledger append (DEFINER required; no client EXECUTE)
create or replace function public.append_ledger_entry(
  p_player_id uuid,
  p_entry_type public.ledger_entry_type,
  p_amount bigint,
  p_source text default null,
  p_reference_id uuid default null,
  p_actor_id uuid default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.gik_ledger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.gik_ledger;
begin
  if p_player_id is null then
    raise exception 'player_id is required' using errcode = 'check_violation';
  end if;

  insert into public.gik_ledger (
    player_id, entry_type, amount, balance_after,
    source, reference_id, actor_id, reason, metadata
  )
  values (
    p_player_id, p_entry_type, p_amount, 0,
    p_source, p_reference_id, p_actor_id, p_reason, coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- Internal audit writer (DEFINER required; no client EXECUTE)
create or replace function public.write_audit(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null,
  p_approval_chain jsonb default null,
  p_result text default 'success'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (
    actor_id, action, target_type, target_id,
    before_value, after_value, reason, approval_chain, result
  )
  values (
    auth.uid(), p_action, p_target_type, p_target_id,
    p_before, p_after, p_reason, p_approval_chain, p_result
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Settings reader (DEFINER required — system_settings is admin-gated by RLS)
create or replace function public.get_setting(p_key text, p_default jsonb default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  return coalesce(
    (select s.value from public.system_settings s where s.key = p_key),
    p_default
  );
end;
$$;

-- First-owner bootstrap: service_role only; refuses after an owner exists
create or replace function public.bootstrap_first_owner(p_user_id uuid)
returns public.admin_users
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.admin_users;
begin
  if coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'bootstrap_first_owner is restricted to service_role'
      using errcode = 'insufficient_privilege';
  end if;

  if p_user_id is null then
    raise exception 'user_id is required' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.admin_users where is_owner and is_active) then
    raise exception 'An active owner already exists' using errcode = 'unique_violation';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Auth user not found' using errcode = 'no_data_found';
  end if;

  insert into public.admin_users (id, is_owner, is_active, requires_2fa, requires_pin)
  values (p_user_id, true, true, true, true)
  on conflict (id) do update set is_owner = true, is_active = true
  returning * into v_row;

  perform public.write_audit('admin.bootstrap_owner', 'admin_user', p_user_id::text);
  return v_row;
end;
$$;

-- Player cancel own pending credit request
create or replace function public.cancel_credit_request(p_request_id uuid)
returns public.credit_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.credit_requests;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  update public.credit_requests
  set status = 'cancelled'
  where id = p_request_id
    and player_id = v_uid
    and status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'No cancellable pending request found for current user'
      using errcode = 'no_data_found';
  end if;

  return v_row;
end;
$$;

-- Player daily reward claim (credits only auth.uid())
create or replace function public.claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (pg_catalog.now() at time zone 'utc')::date;
  v_base bigint;
  v_day3 bigint;
  v_day7 bigint;
  v_cap bigint;
  v_balance bigint;
  v_last date;
  v_streak integer;
  v_bonus bigint := 0;
  v_total bigint;
  v_ledger public.gik_ledger;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  v_base := coalesce((public.get_setting('rewards.daily_base') #>> '{}')::bigint, 5000);
  v_day3 := coalesce((public.get_setting('rewards.streak_day3_bonus') #>> '{}')::bigint, 2000);
  v_day7 := coalesce((public.get_setting('rewards.streak_day7_bonus') #>> '{}')::bigint, 10000);
  v_cap  := coalesce((public.get_setting('rewards.max_balance_for_daily') #>> '{}')::bigint, 200000);

  select coalesce(balance, 0) into v_balance
  from public.player_balances where player_id = v_uid;
  v_balance := coalesce(v_balance, 0);

  if v_balance > v_cap then
    raise exception 'Daily reward unavailable while balance exceeds %', v_cap
      using errcode = 'check_violation';
  end if;

  select last_claimed_on, current_streak into v_last, v_streak
  from public.player_streaks where player_id = v_uid;

  if v_last = v_today then
    raise exception 'Daily reward already claimed today'
      using errcode = 'unique_violation';
  elsif v_last = v_today - 1 then
    v_streak := coalesce(v_streak, 0) + 1;
  else
    v_streak := 1;
  end if;

  if v_streak % 7 = 0 then
    v_bonus := v_day7;
  elsif v_streak % 7 = 3 then
    v_bonus := v_day3;
  end if;

  v_total := v_base + v_bonus;

  insert into public.daily_reward_claims
    (player_id, claimed_on, base_amount, streak_bonus, total_amount, streak_day)
  values (v_uid, v_today, v_base, v_bonus, v_total, v_streak);

  v_ledger := public.append_ledger_entry(
    v_uid, 'daily_reward', v_total, 'daily_reward', null, v_uid,
    'Daily check-in', jsonb_build_object('streak_day', v_streak)
  );

  update public.daily_reward_claims
  set ledger_id = v_ledger.id
  where player_id = v_uid and claimed_on = v_today;

  insert into public.player_streaks (player_id, current_streak, longest_streak, last_claimed_on)
  values (v_uid, v_streak, v_streak, v_today)
  on conflict (player_id) do update
  set current_streak = excluded.current_streak,
      longest_streak = greatest(public.player_streaks.longest_streak, excluded.current_streak),
      last_claimed_on = excluded.last_claimed_on,
      updated_at = pg_catalog.now();

  return jsonb_build_object(
    'claimed_on', v_today,
    'base_amount', v_base,
    'streak_bonus', v_bonus,
    'total_amount', v_total,
    'streak_day', v_streak,
    'balance_after', v_ledger.balance_after
  );
end;
$$;

-- Admin: set player status (permission-gated; cannot spoof actor)
create or replace function public.admin_set_player_status(
  p_player_id uuid,
  p_status public.player_status,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_before public.profiles;
  v_after public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_permission('players.suspend'::public.app_permission) then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select * into v_before from public.profiles where id = p_player_id;
  if not found then
    raise exception 'Player not found' using errcode = 'no_data_found';
  end if;

  update public.profiles
  set status = p_status,
      suspended_reason = case when p_status in ('suspended', 'banned') then p_reason else null end,
      suspended_at = case when p_status in ('suspended', 'banned') then pg_catalog.now() else null end
  where id = p_player_id
  returning * into v_after;

  perform public.write_audit(
    'player.status_change', 'profile', p_player_id::text,
    to_jsonb(v_before.status), to_jsonb(v_after.status), p_reason
  );

  return v_after;
end;
$$;

-- Admin: review credit request (permission-gated; credits request.player_id only)
create or replace function public.review_credit_request(
  p_request_id uuid,
  p_decision public.credit_request_status,
  p_gross bigint default null,
  p_fee_percent numeric default 0,
  p_bonus bigint default 0,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.credit_requests;
  v_fee bigint;
  v_net bigint;
  v_threshold bigint;
  v_prior_approvals integer;
  v_is_second boolean := false;
  v_review_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_permission('credits.adjust'::public.app_permission) then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required' using errcode = 'check_violation';
  end if;

  select * into v_req from public.credit_requests where id = p_request_id for update;
  if not found then
    raise exception 'Credit request not found' using errcode = 'no_data_found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Credit request is not pending' using errcode = 'check_violation';
  end if;

  if p_decision = 'rejected' then
    insert into public.credit_request_reviews (request_id, reviewer_id, decision, reason)
    values (p_request_id, v_uid, 'rejected', p_reason)
    returning id into v_review_id;

    update public.credit_requests set status = 'rejected' where id = p_request_id;

    insert into public.notifications (player_id, type, title, body)
    values (v_req.player_id, 'credit_request', 'Credit request rejected', p_reason);

    perform public.write_audit('credit_request.reject', 'credit_request',
      p_request_id::text, to_jsonb(v_req), null, p_reason);

    return jsonb_build_object('status', 'rejected', 'review_id', v_review_id);
  end if;

  if p_decision <> 'approved' then
    raise exception 'Decision must be approved or rejected' using errcode = 'check_violation';
  end if;

  p_gross := coalesce(p_gross, v_req.requested_amount);
  v_fee := floor(p_gross * coalesce(p_fee_percent, 0) / 100.0)::bigint;
  v_net := p_gross - v_fee + coalesce(p_bonus, 0);
  v_threshold := coalesce(
    (public.get_setting('credits.second_approval_threshold') #>> '{}')::bigint, 500000);

  if v_net > v_threshold then
    select count(*) into v_prior_approvals
    from public.credit_request_reviews
    where request_id = p_request_id and decision = 'approved'
      and reviewer_id <> v_uid;

    if v_prior_approvals = 0 then
      insert into public.credit_request_reviews (
        request_id, reviewer_id, decision, gross_amount, fee_percent,
        fee_amount, bonus_amount, net_amount, reason, is_second_approval
      )
      values (p_request_id, v_uid, 'approved', p_gross, p_fee_percent,
        v_fee, coalesce(p_bonus, 0), v_net, p_reason, false)
      returning id into v_review_id;

      perform public.write_audit('credit_request.first_approval', 'credit_request',
        p_request_id::text, null, to_jsonb(v_net), p_reason);

      return jsonb_build_object(
        'status', 'pending_second_approval', 'net_amount', v_net, 'review_id', v_review_id);
    else
      v_is_second := true;
    end if;
  end if;

  perform public.append_ledger_entry(
    v_req.player_id, 'demo_credit_grant', p_gross, 'credit_request',
    p_request_id, v_uid, p_reason,
    jsonb_build_object('kind', 'grant'));

  if v_fee > 0 then
    perform public.append_ledger_entry(
      v_req.player_id, 'simulation_fee', -v_fee, 'credit_request',
      p_request_id, v_uid, 'Simulation fee',
      jsonb_build_object('fee_percent', p_fee_percent));
  end if;

  insert into public.credit_request_reviews (
    request_id, reviewer_id, decision, gross_amount, fee_percent,
    fee_amount, bonus_amount, net_amount, reason, is_second_approval
  )
  values (p_request_id, v_uid, 'approved', p_gross, p_fee_percent,
    v_fee, coalesce(p_bonus, 0), v_net, p_reason, v_is_second)
  returning id into v_review_id;

  if coalesce(p_bonus, 0) > 0 then
    perform public.append_ledger_entry(
      v_req.player_id, 'demo_credit_grant', p_bonus, 'credit_request_bonus',
      v_review_id, v_uid, 'Bonus credit',
      jsonb_build_object('kind', 'bonus'));
  end if;

  update public.credit_requests set status = 'approved' where id = p_request_id;

  insert into public.notifications (player_id, type, title, body)
  values (v_req.player_id, 'credit_request', 'Credit request approved',
    format('Net %s GIK credited.', v_net));

  perform public.write_audit('credit_request.approve', 'credit_request',
    p_request_id::text, to_jsonb(v_req), to_jsonb(v_net), p_reason,
    jsonb_build_object('is_second_approval', v_is_second));

  return jsonb_build_object(
    'status', 'approved', 'gross', p_gross, 'fee', v_fee,
    'bonus', coalesce(p_bonus, 0), 'net', v_net,
    'is_second_approval', v_is_second, 'review_id', v_review_id);
end;
$$;

-- ============================================================================
-- 4) Least-privilege EXECUTE grants
-- ============================================================================
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'is_admin','is_owner','has_permission',
        'handle_new_user','append_ledger_entry','write_audit','get_setting',
        'bootstrap_first_owner','cancel_credit_request','claim_daily_reward',
        'admin_set_player_status','review_credit_request',
        'set_updated_at','prevent_mutation','apply_ledger_entry','enforce_attachment_limit'
      ])
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig);
  end loop;
end $$;

grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.is_owner(uuid) to authenticated, service_role;
grant execute on function public.has_permission(public.app_permission, uuid) to authenticated, service_role;

grant execute on function public.get_setting(text, jsonb) to authenticated, service_role;
grant execute on function public.cancel_credit_request(uuid) to authenticated, service_role;
grant execute on function public.claim_daily_reward() to authenticated, service_role;

grant execute on function public.admin_set_player_status(uuid, public.player_status, text)
  to authenticated, service_role;
grant execute on function public.review_credit_request(
  uuid, public.credit_request_status, bigint, numeric, bigint, text)
  to authenticated, service_role;

grant execute on function public.append_ledger_entry(
  uuid, public.ledger_entry_type, bigint, text, uuid, uuid, text, jsonb)
  to service_role;
grant execute on function public.write_audit(text, text, text, jsonb, jsonb, text, jsonb, text)
  to service_role;
grant execute on function public.bootstrap_first_owner(uuid) to service_role;

-- ============================================================================
-- 5) Covering indexes for unindexed foreign keys
-- ============================================================================
create index if not exists achievement_unlocks_reward_ledger_id_idx on achievement_unlocks (reward_ledger_id);
create index if not exists admin_user_permissions_updated_by_idx on admin_user_permissions (updated_by);
create index if not exists admin_user_roles_assigned_by_idx on admin_user_roles (assigned_by);
create index if not exists admin_users_created_by_idx on admin_users (created_by);
create index if not exists announcement_reads_player_id_idx on announcement_reads (player_id);
create index if not exists announcements_created_by_idx on announcements (created_by);
create index if not exists asset_metadata_created_by_idx on asset_metadata (created_by);
create index if not exists asset_metadata_game_id_idx on asset_metadata (game_id);
create index if not exists bets_debit_ledger_id_idx on bets (debit_ledger_id);
create index if not exists bets_game_version_id_idx on bets (game_version_id);
create index if not exists bets_payout_ledger_id_idx on bets (payout_ledger_id);
create index if not exists daily_reward_claims_ledger_id_idx on daily_reward_claims (ledger_id);
create index if not exists feature_flags_updated_by_idx on feature_flags (updated_by);
create index if not exists game_release_events_actor_id_idx on game_release_events (actor_id);
create index if not exists game_rounds_controlled_by_idx on game_rounds (controlled_by);
create index if not exists game_rounds_game_version_id_idx on game_rounds (game_version_id);
create index if not exists game_versions_created_by_idx on game_versions (created_by);
create index if not exists games_active_version_id_idx on games (active_version_id);
create index if not exists gik_ledger_actor_id_idx on gik_ledger (actor_id);
create index if not exists invites_accepted_by_idx on invites (accepted_by);
create index if not exists leaderboard_entries_player_id_idx on leaderboard_entries (player_id);
create index if not exists maintenance_state_updated_by_idx on maintenance_state (updated_by);
create index if not exists mission_progress_reward_ledger_id_idx on mission_progress (reward_ledger_id);
create index if not exists missions_game_id_idx on missions (game_id);
create index if not exists qa_demo_accounts_created_by_idx on qa_demo_accounts (created_by);
create index if not exists receipts_game_id_idx on receipts (game_id);
create index if not exists receipts_game_version_id_idx on receipts (game_version_id);
create index if not exists system_settings_updated_by_idx on system_settings (updated_by);
create index if not exists ticket_attachments_message_id_idx on ticket_attachments (message_id);
create index if not exists ticket_attachments_uploaded_by_idx on ticket_attachments (uploaded_by);
create index if not exists ticket_messages_author_id_idx on ticket_messages (author_id);

-- ============================================================================
-- 6) RLS policy consolidation + auth.uid() initplan optimization
-- ============================================================================
drop policy if exists achievement_unlocks_select_admin on public.achievement_unlocks;
drop policy if exists achievement_unlocks_select_own on public.achievement_unlocks;
create policy achievement_unlocks_select_combined on public.achievement_unlocks
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('reports.view'::public.app_permission)));

drop policy if exists admin_user_permissions_select_manage on public.admin_user_permissions;
drop policy if exists admin_user_permissions_select_self on public.admin_user_permissions;
create policy admin_user_permissions_select_combined on public.admin_user_permissions
  for select to authenticated
  using (((admin_id = (select auth.uid())) or public.has_permission('admins.manage'::public.app_permission)));

drop policy if exists admin_user_roles_select_manage on public.admin_user_roles;
drop policy if exists admin_user_roles_select_self on public.admin_user_roles;
create policy admin_user_roles_select_combined on public.admin_user_roles
  for select to authenticated
  using (((admin_id = (select auth.uid())) or public.has_permission('admins.manage'::public.app_permission)));

drop policy if exists admin_users_select_manage on public.admin_users;
drop policy if exists admin_users_select_self on public.admin_users;
create policy admin_users_select_combined on public.admin_users
  for select to authenticated
  using (((id = (select auth.uid())) or public.has_permission('admins.manage'::public.app_permission)));

drop policy if exists bet_outcomes_select_admin on public.bet_outcomes;
drop policy if exists bet_outcomes_select_own on public.bet_outcomes;
create policy bet_outcomes_select_combined on public.bet_outcomes
  for select to authenticated
  using ((public.has_permission('games.view'::public.app_permission) or (exists (select 1 from public.bets b where b.id = bet_outcomes.bet_id and b.player_id = (select auth.uid())))));

drop policy if exists bets_select_admin on public.bets;
drop policy if exists bets_select_own on public.bets;
create policy bets_select_combined on public.bets
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('games.view'::public.app_permission) or public.has_permission('credits.view'::public.app_permission)));

drop policy if exists credit_reviews_select_admin on public.credit_request_reviews;
drop policy if exists credit_reviews_select_own on public.credit_request_reviews;
create policy credit_reviews_select_combined on public.credit_request_reviews
  for select to authenticated
  using ((public.has_permission('credits.view'::public.app_permission) or (exists (select 1 from public.credit_requests r where r.id = credit_request_reviews.request_id and r.player_id = (select auth.uid())))));

drop policy if exists credit_requests_select_admin on public.credit_requests;
drop policy if exists credit_requests_select_own on public.credit_requests;
create policy credit_requests_select_combined on public.credit_requests
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('credits.view'::public.app_permission)));

drop policy if exists daily_claims_select_admin on public.daily_reward_claims;
drop policy if exists daily_claims_select_own on public.daily_reward_claims;
create policy daily_claims_select_combined on public.daily_reward_claims
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('credits.view'::public.app_permission)));

drop policy if exists ledger_select_admin on public.gik_ledger;
drop policy if exists ledger_select_own on public.gik_ledger;
create policy ledger_select_combined on public.gik_ledger
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('credits.view'::public.app_permission)));

drop policy if exists mission_progress_select_admin on public.mission_progress;
drop policy if exists mission_progress_select_own on public.mission_progress;
create policy mission_progress_select_combined on public.mission_progress
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('reports.view'::public.app_permission)));

drop policy if exists balances_select_admin on public.player_balances;
drop policy if exists balances_select_own on public.player_balances;
create policy balances_select_combined on public.player_balances
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('credits.view'::public.app_permission)));

drop policy if exists contacts_select_admin on public.player_contacts;
drop policy if exists contacts_select_own on public.player_contacts;
create policy contacts_select_combined on public.player_contacts
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('players.view'::public.app_permission)));

drop policy if exists streaks_select_admin on public.player_streaks;
drop policy if exists streaks_select_own on public.player_streaks;
create policy streaks_select_combined on public.player_streaks
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('players.view'::public.app_permission)));

drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_combined on public.profiles
  for select to authenticated
  using (((id = (select auth.uid())) or public.has_permission('players.view'::public.app_permission)));

drop policy if exists receipts_select_admin on public.receipts;
drop policy if exists receipts_select_own on public.receipts;
create policy receipts_select_combined on public.receipts
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('games.view'::public.app_permission) or public.has_permission('credits.view'::public.app_permission)));

drop policy if exists tickets_select_admin on public.support_tickets;
drop policy if exists tickets_select_own on public.support_tickets;
create policy tickets_select_combined on public.support_tickets
  for select to authenticated
  using (((player_id = (select auth.uid())) or public.has_permission('tickets.manage'::public.app_permission)));

drop policy if exists announcement_reads_own on public.announcement_reads;
create policy announcement_reads_own on public.announcement_reads
  for all to authenticated
  using ((player_id = (select auth.uid())))
  with check ((player_id = (select auth.uid())));

drop policy if exists credit_requests_insert_own on public.credit_requests;
create policy credit_requests_insert_own on public.credit_requests
  for insert to authenticated
  with check ((player_id = (select auth.uid())));

drop policy if exists friendships_delete_party on public.friendships;
create policy friendships_delete_party on public.friendships
  for delete to authenticated
  using (((requester_id = (select auth.uid())) OR (addressee_id = (select auth.uid()))));

drop policy if exists friendships_insert_requester on public.friendships;
create policy friendships_insert_requester on public.friendships
  for insert to authenticated
  with check ((requester_id = (select auth.uid())));

drop policy if exists friendships_select_party on public.friendships;
create policy friendships_select_party on public.friendships
  for select to authenticated
  using (((requester_id = (select auth.uid())) OR (addressee_id = (select auth.uid()))));

drop policy if exists friendships_update_party on public.friendships;
create policy friendships_update_party on public.friendships
  for update to authenticated
  using (((requester_id = (select auth.uid())) OR (addressee_id = (select auth.uid()))))
  with check (((requester_id = (select auth.uid())) OR (addressee_id = (select auth.uid()))));

drop policy if exists rounds_select_participant on public.game_rounds;
create policy rounds_select_participant on public.game_rounds
  for select to authenticated
  using ((has_permission('games.view'::app_permission) OR (EXISTS ( SELECT 1
   FROM bets b
  WHERE ((b.round_id = game_rounds.id) AND (b.player_id = (select auth.uid())))))));

drop policy if exists invites_insert_own on public.invites;
create policy invites_insert_own on public.invites
  for insert to authenticated
  with check ((inviter_id = (select auth.uid())));

drop policy if exists invites_select_involved on public.invites;
create policy invites_select_involved on public.invites
  for select to authenticated
  using (((inviter_id = (select auth.uid())) OR (accepted_by = (select auth.uid()))));

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using ((player_id = (select auth.uid())));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using ((player_id = (select auth.uid())))
  with check ((player_id = (select auth.uid())));

drop policy if exists contacts_modify_own on public.player_contacts;
create policy contacts_modify_own on public.player_contacts
  for all to authenticated
  using ((player_id = (select auth.uid())))
  with check ((player_id = (select auth.uid())));

drop policy if exists settings_modify_own on public.player_settings;
create policy settings_modify_own on public.player_settings
  for all to authenticated
  using ((player_id = (select auth.uid())))
  with check ((player_id = (select auth.uid())));

drop policy if exists settings_select_own on public.player_settings;
create policy settings_select_own on public.player_settings
  for select to authenticated
  using ((player_id = (select auth.uid())));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));

drop policy if exists tickets_insert_own on public.support_tickets;
create policy tickets_insert_own on public.support_tickets
  for insert to authenticated
  with check ((player_id = (select auth.uid())));

drop policy if exists tickets_update_own_feedback on public.support_tickets;
create policy tickets_update_own_feedback on public.support_tickets
  for update to authenticated
  using ((player_id = (select auth.uid())))
  with check ((player_id = (select auth.uid())));

drop policy if exists ticket_attachments_insert on public.ticket_attachments;
create policy ticket_attachments_insert on public.ticket_attachments
  for insert to authenticated
  with check (((uploaded_by = (select auth.uid())) AND (has_permission('tickets.manage'::app_permission) OR (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = ticket_attachments.ticket_id) AND (t.player_id = (select auth.uid()))))))));

drop policy if exists ticket_attachments_select on public.ticket_attachments;
create policy ticket_attachments_select on public.ticket_attachments
  for select to authenticated
  using ((has_permission('tickets.manage'::app_permission) OR (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = ticket_attachments.ticket_id) AND (t.player_id = (select auth.uid())))))));

drop policy if exists ticket_messages_insert on public.ticket_messages;
create policy ticket_messages_insert on public.ticket_messages
  for insert to authenticated
  with check (((author_id = (select auth.uid())) AND (has_permission('tickets.manage'::app_permission) OR (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = ticket_messages.ticket_id) AND (t.player_id = (select auth.uid()))))))));

drop policy if exists ticket_messages_select on public.ticket_messages;
create policy ticket_messages_select on public.ticket_messages
  for select to authenticated
  using ((has_permission('tickets.manage'::app_permission) OR (EXISTS ( SELECT 1
   FROM support_tickets t
  WHERE ((t.id = ticket_messages.ticket_id) AND (t.player_id = (select auth.uid())))))));

