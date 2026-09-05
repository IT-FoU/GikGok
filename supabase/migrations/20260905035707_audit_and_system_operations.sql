-- GIKGOK — audit log, system settings, maintenance, assets, QA accounts,
-- and server-authoritative operations (daily reward, credit review, status).

-- ---------------------------------------------------------------------------
-- Append-only audit log
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id),
  action text not null,
  target_type text,
  target_id text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  approval_chain jsonb,
  result text not null default 'success' check (result in ('success', 'failure')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index audit_logs_action_idx on public.audit_logs (action);

create trigger audit_logs_block_update
  before update on public.audit_logs
  for each row execute function public.prevent_mutation();
create trigger audit_logs_block_delete
  before delete on public.audit_logs
  for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- System settings, maintenance, assets, health events, QA accounts
-- ---------------------------------------------------------------------------
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

create trigger system_settings_set_updated_at
  before update on public.system_settings
  for each row execute function public.set_updated_at();

create table public.maintenance_state (
  id boolean primary key default true,
  is_maintenance boolean not null default false,
  message text,
  started_at timestamptz,
  ended_at timestamptz,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  constraint maintenance_state_singleton check (id)
);
insert into public.maintenance_state (id, is_maintenance) values (true, false)
  on conflict (id) do nothing;

create table public.asset_metadata (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  kind text not null,
  game_id uuid references public.games (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (bucket, path)
);

create table public.operational_health_events (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info', 'warn', 'error')),
  source text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index operational_health_events_created_idx
  on public.operational_health_events (created_at desc);

create table public.qa_demo_accounts (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  label text not null,
  purpose text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Settings accessor (fallback-aware; used by server RPCs and clients-safe RPCs)
-- ---------------------------------------------------------------------------
create or replace function public.get_setting(p_key text, p_default jsonb default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.system_settings where key = p_key),
    p_default
  );
$$;
revoke all on function public.get_setting(text, jsonb) from public;
grant execute on function public.get_setting(text, jsonb) to authenticated, service_role;

-- Internal audit writer (server-side).
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
set search_path = public
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
revoke all on function public.write_audit(text, text, text, jsonb, jsonb, text, jsonb, text) from public;
grant execute on function public.write_audit(text, text, text, jsonb, jsonb, text, jsonb, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Daily reward claim (server-authoritative; Owner-editable amounts via settings)
-- ---------------------------------------------------------------------------
create or replace function public.claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
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

  -- Reserve the day first; the unique(player_id, claimed_on) prevents double-claim races.
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
      updated_at = now();

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
revoke all on function public.claim_daily_reward() from public;
grant execute on function public.claim_daily_reward() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin: set player status (permission-checked)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_player_status(
  p_player_id uuid,
  p_status public.player_status,
  p_reason text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.profiles;
  v_after public.profiles;
begin
  if not public.has_permission('players.suspend') then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;

  select * into v_before from public.profiles where id = p_player_id;
  if not found then
    raise exception 'Player not found' using errcode = 'no_data_found';
  end if;

  update public.profiles
  set status = p_status,
      suspended_reason = case when p_status in ('suspended', 'banned') then p_reason else null end,
      suspended_at = case when p_status in ('suspended', 'banned') then now() else null end
  where id = p_player_id
  returning * into v_after;

  perform public.write_audit(
    'player.status_change', 'profile', p_player_id::text,
    to_jsonb(v_before.status), to_jsonb(v_after.status), p_reason
  );

  return v_after;
end;
$$;
revoke all on function public.admin_set_player_status(uuid, public.player_status, text) from public;
grant execute on function public.admin_set_player_status(uuid, public.player_status, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin: review a demo-credit request (approve/reject) — server-authoritative.
-- Enforces configurable two-person approval for large NET grants.
-- ---------------------------------------------------------------------------
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
set search_path = public
as $$
declare
  v_req public.credit_requests;
  v_fee bigint;
  v_net bigint;
  v_threshold bigint;
  v_prior_approvals integer;
  v_is_second boolean := false;
  v_review_id uuid;
begin
  if not public.has_permission('credits.adjust') then
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
    values (p_request_id, auth.uid(), 'rejected', p_reason)
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

  -- Two-person rule for large NET grants.
  if v_net > v_threshold then
    select count(*) into v_prior_approvals
    from public.credit_request_reviews
    where request_id = p_request_id and decision = 'approved'
      and reviewer_id <> auth.uid();

    if v_prior_approvals = 0 then
      -- Record first approval and wait for a different second approver.
      insert into public.credit_request_reviews (
        request_id, reviewer_id, decision, gross_amount, fee_percent,
        fee_amount, bonus_amount, net_amount, reason, is_second_approval
      )
      values (p_request_id, auth.uid(), 'approved', p_gross, p_fee_percent,
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

  -- Final approval: write separate ledger entries (grant, fee, bonus).
  perform public.append_ledger_entry(
    v_req.player_id, 'demo_credit_grant', p_gross, 'credit_request',
    p_request_id, auth.uid(), p_reason,
    jsonb_build_object('kind', 'grant'));

  if v_fee > 0 then
    perform public.append_ledger_entry(
      v_req.player_id, 'simulation_fee', -v_fee, 'credit_request',
      p_request_id, auth.uid(), 'Simulation fee',
      jsonb_build_object('fee_percent', p_fee_percent));
  end if;

  insert into public.credit_request_reviews (
    request_id, reviewer_id, decision, gross_amount, fee_percent,
    fee_amount, bonus_amount, net_amount, reason, is_second_approval
  )
  values (p_request_id, auth.uid(), 'approved', p_gross, p_fee_percent,
    v_fee, coalesce(p_bonus, 0), v_net, p_reason, v_is_second)
  returning id into v_review_id;

  if coalesce(p_bonus, 0) > 0 then
    -- Bonus references the review id to keep the ledger idempotency key unique.
    perform public.append_ledger_entry(
      v_req.player_id, 'demo_credit_grant', p_bonus, 'credit_request_bonus',
      v_review_id, auth.uid(), 'Bonus credit',
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
revoke all on function public.review_credit_request(
  uuid, public.credit_request_status, bigint, numeric, bigint, text) from public;
grant execute on function public.review_credit_request(
  uuid, public.credit_request_status, bigint, numeric, bigint, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bootstrap the first Owner (service-role only; no-op if an owner exists).
-- Documented method to promote a staging user created via Supabase Auth.
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_first_owner(p_user_id uuid)
returns public.admin_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_users;
begin
  if exists (select 1 from public.admin_users where is_owner and is_active) then
    raise exception 'An active owner already exists' using errcode = 'unique_violation';
  end if;

  insert into public.admin_users (id, is_owner, is_active, requires_2fa, requires_pin)
  values (p_user_id, true, true, true, true)
  on conflict (id) do update set is_owner = true, is_active = true
  returning * into v_row;

  perform public.write_audit('admin.bootstrap_owner', 'admin_user', p_user_id::text);
  return v_row;
end;
$$;
revoke all on function public.bootstrap_first_owner(uuid) from public;
grant execute on function public.bootstrap_first_owner(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;
alter table public.maintenance_state enable row level security;
alter table public.asset_metadata enable row level security;
alter table public.operational_health_events enable row level security;
alter table public.qa_demo_accounts enable row level security;

revoke all on public.audit_logs, public.system_settings, public.maintenance_state,
  public.asset_metadata, public.operational_health_events, public.qa_demo_accounts
  from anon, authenticated;
grant all on public.audit_logs, public.system_settings, public.maintenance_state,
  public.asset_metadata, public.operational_health_events, public.qa_demo_accounts
  to service_role;

grant select on public.audit_logs to authenticated;
grant select on public.system_settings to authenticated;
grant select on public.maintenance_state to authenticated;
grant select on public.asset_metadata to authenticated;
grant select on public.operational_health_events to authenticated;
grant select on public.qa_demo_accounts to authenticated;

create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated using (public.has_permission('audit.view'));

create policy system_settings_select_admin on public.system_settings
  for select to authenticated using (public.has_permission('system.settings'));

-- Maintenance banner is readable by all signed-in users.
create policy maintenance_select_all on public.maintenance_state
  for select to authenticated using (true);

-- Asset metadata is non-sensitive reference data.
create policy asset_metadata_select_all on public.asset_metadata
  for select to authenticated using (true);

create policy health_events_select_admin on public.operational_health_events
  for select to authenticated
  using (public.has_permission('system.settings') or public.has_permission('audit.view'));

create policy qa_accounts_select_admin on public.qa_demo_accounts
  for select to authenticated
  using (public.has_permission('players.view') or public.has_permission('system.settings'));
