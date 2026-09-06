-- P0 harden: admin MFA fail-closed, settle-bound engagement,
-- play eligibility, Auth-bound contact verification.
-- Forward-only for staging jlpcfatcpymjnjbxmclo. Demo GIK only.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Session-scoped sensitive challenges + attempt throttle
-- ---------------------------------------------------------------------------
alter table public.admin_sensitive_challenges
  add column if not exists session_id text;

update public.admin_sensitive_challenges
set session_id = coalesce(nullif(session_id, ''), 'legacy')
where session_id is null or session_id = '';

alter table public.admin_sensitive_challenges
  alter column session_id set default 'legacy';

alter table public.admin_sensitive_challenges
  alter column session_id set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.admin_sensitive_challenges'::regclass
      and contype = 'p'
  ) then
    execute (
      select 'alter table public.admin_sensitive_challenges drop constraint ' || quote_ident(conname)
      from pg_constraint
      where conrelid = 'public.admin_sensitive_challenges'::regclass
        and contype = 'p'
      limit 1
    );
  end if;
end $$;

alter table public.admin_sensitive_challenges
  add constraint admin_sensitive_challenges_pkey primary key (admin_id, session_id);

create table if not exists public.admin_auth_attempts (
  id bigint generated always as identity primary key,
  admin_id uuid not null references public.admin_users (id) on delete cascade,
  kind text not null check (kind in ('pin', 'otp')),
  success boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists admin_auth_attempts_admin_kind_time_idx
  on public.admin_auth_attempts (admin_id, kind, attempted_at desc);

alter table public.admin_auth_attempts enable row level security;
revoke all on public.admin_auth_attempts from anon, authenticated;
grant all on public.admin_auth_attempts to service_role;

create table if not exists public.settled_bet_engagement_events (
  bet_id uuid not null references public.bets (id) on delete cascade,
  event_kind text not null check (event_kind in ('mission', 'achievement')),
  event_key text not null,
  player_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bet_id, event_kind, event_key)
);

alter table public.settled_bet_engagement_events enable row level security;
revoke all on public.settled_bet_engagement_events from anon, authenticated;
grant all on public.settled_bet_engagement_events to service_role;

create or replace function public.admin_session_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'session_id', ''),
    md5(coalesce(auth.jwt() ->> 'sub', '') || ':' || coalesce(auth.jwt() ->> 'iat', '0'))
  );
$$;

create or replace function public.admin_has_verified_totp(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = p_uid
      and f.factor_type = 'totp'
      and f.status = 'verified'
  );
$$;

revoke all on function public.admin_has_verified_totp(uuid) from public, anon, authenticated;
grant execute on function public.admin_has_verified_totp(uuid) to service_role;

create or replace function public.assert_admin_auth_rate_limit(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  failures int;
begin
  if uid is null then
    raise exception 'admin access required';
  end if;
  select count(*)::int into failures
  from public.admin_auth_attempts
  where admin_id = uid
    and kind = p_kind
    and success = false
    and attempted_at > now() - interval '15 minutes';
  if failures >= 8 then
    raise exception 'too many verification attempts; try again later';
  end if;
end;
$$;

revoke all on function public.assert_admin_auth_rate_limit(text) from public, anon, authenticated;
grant execute on function public.assert_admin_auth_rate_limit(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Play eligibility (authoritative)
-- ---------------------------------------------------------------------------
create or replace function public.assert_play_allowed()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  verified boolean;
begin
  if uid is null then
    raise exception 'authentication required';
  end if;

  select * into prof from public.profiles where id = uid for share;
  if not found then
    raise exception 'profile required';
  end if;

  if prof.status is distinct from 'active'::public.player_status then
    raise exception 'account is not allowed to play (%)', prof.status;
  end if;

  if prof.play_paused_until is not null and prof.play_paused_until > now() then
    raise exception 'play temporarily paused until %', prof.play_paused_until;
  end if;

  select exists (
    select 1 from public.player_contacts
    where player_id = uid and is_verified
  ) into verified;

  if not verified then
    raise exception 'verify contact before playing';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin PIN / 2FA
-- ---------------------------------------------------------------------------
create or replace function public.set_admin_2fa(p_enabled boolean, p_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  admin_row public.admin_users;
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;

  select * into admin_row from public.admin_users where id = uid;

  if p_enabled then
    if p_secret is not null and length(trim(p_secret)) > 0 then
      raise exception 'TOTP secrets are managed by Supabase Auth MFA; do not submit a secret';
    end if;
    if not public.admin_has_verified_totp(uid) then
      raise exception 'enroll and verify Supabase Auth TOTP MFA before enabling admin 2FA';
    end if;
    insert into public.admin_security (admin_id, totp_secret, totp_enabled)
    values (uid, null, true)
    on conflict (admin_id) do update
    set totp_secret = null,
        totp_enabled = true,
        updated_at = now();
  else
    if coalesce(admin_row.requires_2fa, false) then
      raise exception 'cannot disable required admin 2FA';
    end if;
    insert into public.admin_security (admin_id, totp_secret, totp_enabled)
    values (uid, null, false)
    on conflict (admin_id) do update
    set totp_secret = null,
        totp_enabled = false,
        updated_at = now();
  end if;

  perform public.write_audit(
    case when p_enabled then 'admin.2fa.enable' else 'admin.2fa.disable' end,
    'admin_user',
    uid::text,
    null,
    jsonb_build_object('totp_enabled', p_enabled, 'auth_mfa', true),
    null,
    null,
    'success'
  );

  return jsonb_build_object('ok', true, 'totp_enabled', p_enabled, 'auth_mfa', true);
end;
$$;

create or replace function public.verify_admin_2fa(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sess text := public.admin_session_id();
  aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;

  perform public.assert_admin_auth_rate_limit('otp');

  -- Reject fixed / demo codes always.
  if p_code is null
     or p_code in ('000000', '123456', '111111', '999999')
     or p_code !~ '^[0-9]{6}$' then
    insert into public.admin_auth_attempts (admin_id, kind, success)
    values (uid, 'otp', false);
    return false;
  end if;

  if not public.admin_has_verified_totp(uid) then
    insert into public.admin_auth_attempts (admin_id, kind, success)
    values (uid, 'otp', false);
    raise exception 'admin 2FA is required but not enrolled';
  end if;

  -- Actual TOTP check is Supabase Auth MFA (session must already be aal2).
  if aal is distinct from 'aal2' then
    insert into public.admin_auth_attempts (admin_id, kind, success)
    values (uid, 'otp', false);
    return false;
  end if;

  insert into public.admin_sensitive_challenges (admin_id, session_id, otp_verified_at, updated_at)
  values (uid, sess, now(), now())
  on conflict (admin_id, session_id) do update
  set otp_verified_at = now(),
      updated_at = now();

  insert into public.admin_auth_attempts (admin_id, kind, success)
  values (uid, 'otp', true);

  perform public.write_audit(
    'admin.2fa.verify',
    'admin_user',
    uid::text,
    null,
    jsonb_build_object('session_id', sess, 'aal', aal),
    null,
    null,
    'success'
  );

  return true;
end;
$$;

create or replace function public.verify_admin_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  stored text;
  sess text := public.admin_session_id();
  ok boolean := false;
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;

  perform public.assert_admin_auth_rate_limit('pin');

  select pin_hash into stored from public.admin_security where admin_id = uid;
  if stored is not null and stored = extensions.crypt(p_pin, stored) then
    ok := true;
  end if;

  insert into public.admin_auth_attempts (admin_id, kind, success)
  values (uid, 'pin', ok);

  if not ok then
    return false;
  end if;

  insert into public.admin_sensitive_challenges (admin_id, session_id, pin_verified_at, updated_at)
  values (uid, sess, now(), now())
  on conflict (admin_id, session_id) do update
  set pin_verified_at = now(),
      updated_at = now();

  return true;
end;
$$;

create or replace function public.assert_admin_sensitive()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  admin_row public.admin_users;
  sec public.admin_security;
  challenge public.admin_sensitive_challenges;
  sess text := public.admin_session_id();
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;

  select * into admin_row from public.admin_users where id = uid;
  if not found or not admin_row.is_active then
    raise exception 'admin access required';
  end if;

  select * into sec from public.admin_security where admin_id = uid;
  select * into challenge
  from public.admin_sensitive_challenges
  where admin_id = uid and session_id = sess;

  if coalesce(admin_row.requires_pin, false) then
    if coalesce(sec.pin_hash, '') = '' then
      raise exception 'admin PIN is required but not configured';
    end if;
    if challenge.pin_verified_at is null
       or challenge.pin_verified_at < now() - interval '5 minutes' then
      raise exception 'admin PIN verification required';
    end if;
  end if;

  if coalesce(admin_row.requires_2fa, false) then
    if not public.admin_has_verified_totp(uid) then
      raise exception 'admin 2FA is required but not enrolled';
    end if;
    if not coalesce(sec.totp_enabled, false) then
      raise exception 'admin 2FA is required but disabled';
    end if;
    if challenge.otp_verified_at is null
       or challenge.otp_verified_at < now() - interval '5 minutes' then
      raise exception 'admin 2FA verification required';
    end if;
    if coalesce(auth.jwt() ->> 'aal', 'aal1') is distinct from 'aal2' then
      raise exception 'admin 2FA session (aal2) required';
    end if;
  end if;
end;
$$;

update public.admin_security
set totp_secret = null
where totp_secret is not null;

-- ---------------------------------------------------------------------------
-- Contact verification requires Auth confirmation evidence
-- ---------------------------------------------------------------------------
create or replace function public.mark_contact_verified(
  p_channel text,
  p_user_id uuid default auth.uid()
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_type public.contact_type;
  v_profile public.profiles;
  v_contact public.player_contacts;
  v_email text;
  v_phone text;
  v_email_confirmed_at timestamptz;
  v_phone_confirmed_at timestamptz;
  v_is_self boolean := auth.uid() is not distinct from v_uid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  if not v_is_self then
    if not public.is_admin(auth.uid())
       or not public.has_permission('players.suspend'::public.app_permission, auth.uid()) then
      raise exception 'not allowed' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if p_channel not in ('email', 'phone') then
    raise exception 'channel must be email or phone' using errcode = 'check_violation';
  end if;

  v_type := p_channel::public.contact_type;

  select * into v_profile
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    raise exception 'profile not found' using errcode = 'no_data_found';
  end if;

  if v_profile.status in (
    'suspended'::public.player_status,
    'banned'::public.player_status,
    'deleted'::public.player_status
  ) then
    raise exception 'account is %', v_profile.status using errcode = 'check_violation';
  end if;

  select
    u.email,
    u.phone,
    u.email_confirmed_at,
    u.phone_confirmed_at
  into
    v_email,
    v_phone,
    v_email_confirmed_at,
    v_phone_confirmed_at
  from auth.users u
  where u.id = v_uid;

  if not found then
    raise exception 'auth user not found' using errcode = 'no_data_found';
  end if;

  select * into v_contact
  from public.player_contacts
  where player_id = v_uid
    and contact_type = v_type
    and is_primary
  for update;

  if not found then
    raise exception 'no % on profile', p_channel using errcode = 'no_data_found';
  end if;

  if v_type = 'email' then
    if v_email_confirmed_at is null then
      raise exception 'email is not confirmed in authentication provider'
        using errcode = 'check_violation';
    end if;
    if lower(trim(v_contact.value)) is distinct from lower(trim(coalesce(v_email, ''))) then
      raise exception 'contact email does not match authenticated email'
        using errcode = 'check_violation';
    end if;
  else
    if v_phone_confirmed_at is null then
      raise exception 'phone is not confirmed in authentication provider'
        using errcode = 'check_violation';
    end if;
    if regexp_replace(coalesce(v_contact.value, ''), '\D', '', 'g')
       is distinct from regexp_replace(coalesce(v_phone, ''), '\D', '', 'g') then
      raise exception 'contact phone does not match authenticated phone'
        using errcode = 'check_violation';
    end if;
  end if;

  if exists (
    select 1 from public.player_contacts
    where contact_type = v_type
      and value = v_contact.value
      and is_verified
      and player_id is distinct from v_uid
  ) then
    if v_type = 'email' then
      raise exception 'verified email already registered to another account'
        using errcode = 'unique_violation';
    else
      raise exception 'verified phone already registered to another account'
        using errcode = 'unique_violation';
    end if;
  end if;

  update public.player_contacts
  set is_verified = true,
      verified_at = coalesce(verified_at, now()),
      updated_at = now()
  where id = v_contact.id;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settle-bound engagement (internal)
-- ---------------------------------------------------------------------------
create or replace function public.apply_settled_bet_engagement(
  p_bet_id uuid,
  p_game_key text,
  p_is_win boolean,
  p_stake bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bet public.bets;
  mission_row public.missions;
  game_uuid uuid;
  achievement_row public.achievements;
  inserted int;
begin
  if uid is null then
    raise exception 'authentication required';
  end if;

  select * into bet
  from public.bets
  where id = p_bet_id
  for share;

  if not found then
    raise exception 'bet not found';
  end if;
  if bet.player_id is distinct from uid then
    raise exception 'bet ownership mismatch';
  end if;
  if bet.status is distinct from 'settled'::public.bet_status then
    raise exception 'bet not settled';
  end if;

  select id into game_uuid from public.games where key = p_game_key;

  if public.feature_flag_enabled('missions') then
    for mission_row in
      select * from public.missions
      where is_active
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at > now())
        and (
          scope = 'any_game'::public.mission_scope
          or (scope = 'single_game'::public.mission_scope and game_id = game_uuid)
        )
    loop
      insert into public.settled_bet_engagement_events (bet_id, event_kind, event_key, player_id)
      values (p_bet_id, 'mission', mission_row.id::text, uid)
      on conflict do nothing;
      get diagnostics inserted = row_count;
      if inserted = 0 then
        continue;
      end if;

      insert into public.mission_progress (mission_id, player_id, progress, is_completed)
      values (mission_row.id, uid, 1, mission_row.goal_target <= 1)
      on conflict (mission_id, player_id) do update
      set progress = least(public.mission_progress.progress + 1, mission_row.goal_target),
          is_completed = case
            when public.mission_progress.reward_ledger_id is not null then true
            when public.mission_progress.progress + 1 >= mission_row.goal_target then true
            else public.mission_progress.is_completed
          end,
          completed_at = case
            when public.mission_progress.completed_at is not null then public.mission_progress.completed_at
            when public.mission_progress.progress + 1 >= mission_row.goal_target then now()
            else null
          end,
          updated_at = now()
      where public.mission_progress.reward_ledger_id is null;
    end loop;
  end if;

  if public.feature_flag_enabled('achievements') then
    if p_is_win then
      select * into achievement_row from public.achievements where key = 'first_win' and is_active;
      if found then
        insert into public.settled_bet_engagement_events (bet_id, event_kind, event_key, player_id)
        values (p_bet_id, 'achievement', 'first_win', uid)
        on conflict do nothing;
        get diagnostics inserted = row_count;
        if inserted > 0 then
          insert into public.achievement_unlocks (player_id, achievement_id)
          values (uid, achievement_row.id)
          on conflict do nothing;
        end if;
      end if;
    end if;

    if p_stake >= 10000 then
      select * into achievement_row from public.achievements where key = 'high_roller' and is_active;
      if found then
        insert into public.settled_bet_engagement_events (bet_id, event_kind, event_key, player_id)
        values (p_bet_id, 'achievement', 'high_roller', uid)
        on conflict do nothing;
        get diagnostics inserted = row_count;
        if inserted > 0 then
          insert into public.achievement_unlocks (player_id, achievement_id)
          values (uid, achievement_row.id)
          on conflict do nothing;
        end if;
      end if;
    end if;
  end if;
end;
$$;

revoke all on function public.apply_settled_bet_engagement(uuid, text, boolean, bigint)
  from public, anon, authenticated;
grant execute on function public.apply_settled_bet_engagement(uuid, text, boolean, bigint)
  to service_role;

create or replace function public.record_mission_progress(p_game_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'record_mission_progress is internal-only; progress is recorded on settled bets'
    using errcode = '42501';
end;
$$;

create or replace function public.unlock_achievement(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'unlock_achievement is internal-only; unlocks are derived from settled bets'
    using errcode = '42501';
  return false;
end;
$$;

revoke all on function public.record_mission_progress(text) from public, anon, authenticated;
revoke all on function public.unlock_achievement(text) from public, anon, authenticated;
grant execute on function public.record_mission_progress(text) to service_role;
grant execute on function public.unlock_achievement(text) to service_role;

-- Credit request insert eligibility
drop policy if exists credit_requests_insert_own on public.credit_requests;
create policy credit_requests_insert_own
  on public.credit_requests
  for insert
  to authenticated
  with check (
    player_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.status = 'active'::public.player_status
        and (p.play_paused_until is null or p.play_paused_until <= now())
    )
    and exists (
      select 1 from public.player_contacts c
      where c.player_id = (select auth.uid())
        and c.is_verified
    )
  );


-- claim_daily_reward: eligibility gate
CREATE OR REPLACE FUNCTION public.claim_daily_reward()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

  perform public.assert_play_allowed();

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
$function$;

-- claim_mission_reward: eligibility gate
CREATE OR REPLACE FUNCTION public.claim_mission_reward(p_mission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  mission_row public.missions;
  progress public.mission_progress;
  ledger_row public.gik_ledger;
begin
  if uid is null then raise exception 'authentication required'; end if;

  perform public.assert_play_allowed();

  select * into mission_row
  from public.missions
  where id = p_mission_id and is_active;
  if not found then raise exception 'mission not found'; end if;

  select * into progress
  from public.mission_progress
  where player_id = uid and mission_id = p_mission_id
  for update;

  if not found or not progress.is_completed then
    raise exception 'mission not completed';
  end if;
  if progress.reward_ledger_id is not null then
    raise exception 'mission already claimed';
  end if;

  ledger_row := public.append_ledger_entry(
    uid,
    'mission_reward'::public.ledger_entry_type,
    mission_row.reward_amount,
    'mission',
    mission_row.id,
    uid,
    'Mission reward: ' || mission_row.name,
    jsonb_build_object('mission_key', mission_row.key)
  );

  update public.mission_progress
  set reward_ledger_id = ledger_row.id, updated_at = now()
  where mission_id = p_mission_id and player_id = uid;

  insert into public.notifications (player_id, type, title, body, data)
  values (
    uid,
    'reward',
    'Mission reward claimed',
    format('You received %s GIK for %s.', mission_row.reward_amount, mission_row.name),
    jsonb_build_object('mission_id', p_mission_id, 'amount', mission_row.reward_amount)
  );

  return jsonb_build_object(
    'claimed', true,
    'amount', mission_row.reward_amount,
    'ledger_entry_id', ledger_row.id
  );
end;
$function$;

-- place_and_settle_bet: eligibility + engagement
CREATE OR REPLACE FUNCTION public.place_and_settle_bet(p_game_key text, p_idempotency_key text, p_stake bigint, p_selection jsonb, p_mode game_mode DEFAULT 'random'::game_mode, p_controlled_result jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_player_id uuid := auth.uid();
  game_row public.games;
  round_row public.game_rounds;
  version_row public.game_versions;
  existing public.bets;
  bet_row public.bets;
  outcome jsonb;
  debit_row public.gik_ledger;
  payout_row public.gik_ledger;
  receipt_id uuid;
  balance_after bigint;
  verified boolean;
  demo_flag boolean;
  v_mode public.game_mode := coalesce(p_mode, 'random'::public.game_mode);
begin
  if v_player_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  -- Centralized eligibility: active, verified, not paused, not deletion-gated.
  perform public.assert_play_allowed();

  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then
    raise exception 'idempotency key required' using errcode = 'check_violation';
  end if;
  if char_length(p_idempotency_key) > 128 then
    raise exception 'idempotency key too long' using errcode = 'check_violation';
  end if;

  perform public.enforce_game_rate_limit(
    v_player_id, 'bet:' || p_game_key, 30, 60
  );

  select exists (
    select 1 from public.player_contacts
    where player_id = v_player_id and is_verified
  ) into verified;

  if not verified then
    raise exception 'verify contact before playing' using errcode = 'check_violation';
  end if;

  if (select status from public.profiles where id = v_player_id)
     is distinct from 'active'::public.player_status then
    raise exception 'account is not active' using errcode = 'check_violation';
  end if;

  game_row := public.assert_game_playable(p_game_key);

  if p_stake is null or p_stake <= 0 then
    raise exception 'stake must be a positive whole number'
      using errcode = 'check_violation';
  end if;
  if p_stake < game_row.min_stake then
    raise exception 'stake out of range' using errcode = 'check_violation';
  end if;
  if game_row.max_stake is not null and p_stake > game_row.max_stake then
    raise exception 'stake out of range' using errcode = 'check_violation';
  end if;

  -- Reject invalid selections before any ledger write.
  if p_game_key = 'fish_prawn_crab' then
    if (p_selection->>'kind') = 'single_symbol' then
      if jsonb_array_length(coalesce(p_selection->'symbols', '[]'::jsonb)) <> 1 then
        raise exception 'invalid fpc selection' using errcode = 'check_violation';
      end if;
    elsif (p_selection->>'kind') = 'special_pair' then
      if jsonb_array_length(coalesce(p_selection->'symbols', '[]'::jsonb)) <> 2 then
        raise exception 'invalid fpc selection' using errcode = 'check_violation';
      end if;
      if (p_selection->'symbols'->>0) = (p_selection->'symbols'->>1) then
        raise exception 'invalid fpc selection' using errcode = 'check_violation';
      end if;
    else
      raise exception 'invalid fpc selection' using errcode = 'check_violation';
    end if;
  elsif p_game_key = 'high_low' then
    if (p_selection->>'side') not in ('high', 'low') then
      raise exception 'invalid high-low selection' using errcode = 'check_violation';
    end if;
  elsif p_game_key = 'spinning_plate' then
    if coalesce((p_selection->>'slot')::int, 0) not between 1 and 12 then
      raise exception 'invalid plate selection' using errcode = 'check_violation';
    end if;
  else
    raise exception 'unsupported game' using errcode = 'check_violation';
  end if;

  select * into existing
  from public.bets
  where player_id = v_player_id
    and idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'replay', true,
      'bet_id', existing.id,
      'status', existing.status,
      'receipt', (
        select to_jsonb(r) from public.receipts r where r.bet_id = existing.id
      )
    );
  end if;

  -- Round selection: controlled must be chosen before play; never alter locked random.
  if v_mode = 'controlled_demo'::public.game_mode then
    if not public.has_permission('games.control'::public.app_permission) then
      raise exception 'missing games.control permission'
        using errcode = 'insufficient_privilege';
    end if;

    select is_enabled into demo_flag
    from public.feature_flags
    where key = 'games.controlled_demo';
    if coalesce(demo_flag, false) = false then
      raise exception 'controlled demo disabled' using errcode = 'check_violation';
    end if;

    select * into round_row
    from public.game_rounds
    where game_id = game_row.id
      and status = 'open'::public.round_status
      and mode = 'controlled_demo'::public.game_mode
    order by opened_at desc
    limit 1
    for update;

    if not found then
      if p_controlled_result is null then
        raise exception 'controlled demo result required before round begins'
          using errcode = 'check_violation';
      end if;
      round_row := public.open_game_round(
        p_game_key,
        'controlled_demo'::public.game_mode,
        p_controlled_result
      );
    elsif round_row.result is null then
      raise exception 'controlled demo result missing on round'
        using errcode = 'check_violation';
    elsif p_controlled_result is not null
          and round_row.result is distinct from p_controlled_result then
      -- Never silently rewrite a preselected controlled result / locked path.
      raise exception 'controlled result already locked on open round'
        using errcode = 'check_violation';
    end if;
  else
    if p_controlled_result is not null then
      raise exception 'controlled result only allowed for controlled_demo mode'
        using errcode = 'check_violation';
    end if;
    round_row := public.ensure_player_round(p_game_key);
  end if;

  if round_row.status is distinct from 'open'::public.round_status then
    raise exception 'round is not open for bets' using errcode = 'check_violation';
  end if;

  -- Never allow converting a random round into controlled mid-flight.
  if round_row.mode = 'random'::public.game_mode
     and v_mode = 'controlled_demo'::public.game_mode then
    raise exception 'cannot apply controlled demo to a random round'
      using errcode = 'check_violation';
  end if;
  if round_row.mode = 'controlled_demo'::public.game_mode
     and round_row.result is null then
    raise exception 'controlled demo result missing on round'
      using errcode = 'check_violation';
  end if;
  if round_row.mode = 'random'::public.game_mode
     and round_row.result is not null then
    raise exception 'invalid round configuration' using errcode = 'check_violation';
  end if;

  select * into version_row
  from public.game_versions
  where id = round_row.game_version_id;

  if not found then
    raise exception 'active game version missing' using errcode = 'no_data_found';
  end if;

  -- Lock selection on the bet shell before ledger debit.
  begin
    insert into public.bets (
      round_id, player_id, game_id, game_version_id,
      idempotency_key, selection, stake, mode, status
    )
    values (
      round_row.id, v_player_id, game_row.id, version_row.id,
      p_idempotency_key, p_selection, p_stake, round_row.mode, 'locked'::public.bet_status
    )
    returning * into bet_row;
  exception
    when unique_violation then
      select * into existing
      from public.bets
      where player_id = v_player_id
        and idempotency_key = p_idempotency_key;
      return jsonb_build_object(
        'replay', true,
        'bet_id', existing.id,
        'status', existing.status,
        'receipt', (
          select to_jsonb(r) from public.receipts r where r.bet_id = existing.id
        )
      );
  end;

  update public.game_rounds
  set status = 'locked'::public.round_status
  where id = round_row.id
    and status = 'open'::public.round_status;

  debit_row := public.append_ledger_entry(
    v_player_id,
    'bet_debit'::public.ledger_entry_type,
    -p_stake,
    'bet',
    bet_row.id,
    v_player_id,
    'Game stake debit',
    jsonb_build_object(
      'game_key', p_game_key,
      'game_id', game_row.id,
      'idempotency_key', p_idempotency_key,
      'game_version_id', version_row.id,
      'mode', round_row.mode
    )
  );

  update public.bets
  set debit_ledger_id = debit_row.id
  where id = bet_row.id;

  outcome := public.settle_game_outcome(
    p_game_key,
    p_selection,
    round_row.mode,
    round_row.result,
    p_stake
  );

  if (outcome->>'payout_amount')::bigint > 0 then
    payout_row := public.append_ledger_entry(
      v_player_id,
      'game_payout'::public.ledger_entry_type,
      (outcome->>'payout_amount')::bigint,
      'bet',
      bet_row.id,
      v_player_id,
      'Game payout',
      jsonb_build_object(
        'game_key', p_game_key,
        'mode', round_row.mode,
        'total_return_multiplier', outcome->>'total_return_multiplier'
      )
    );
  end if;

  insert into public.bet_outcomes (
    bet_id, round_id, is_win, multiplier, total_return, detail
  )
  values (
    bet_row.id,
    round_row.id,
    (outcome->>'is_win')::boolean,
    (outcome->>'total_return_multiplier')::numeric,
    (outcome->>'payout_amount')::bigint,
    outcome->'result_payload'
  );

  select balance into balance_after
  from public.player_balances
  where player_id = v_player_id;

  insert into public.receipts (
    bet_id, player_id, game_id, game_version_id, mode,
    stake, total_return, is_win, balance_after, selection, result
  )
  values (
    bet_row.id,
    v_player_id,
    game_row.id,
    version_row.id,
    round_row.mode,
    p_stake,
    (outcome->>'payout_amount')::bigint,
    (outcome->>'is_win')::boolean,
    coalesce(balance_after, 0),
    p_selection,
    outcome->'result_payload'
  )
  returning id into receipt_id;

  update public.bets
  set status = 'settled'::public.bet_status,
      settled_at = now(),
      is_win = (outcome->>'is_win')::boolean,
      total_return = (outcome->>'payout_amount')::bigint,
      payout_ledger_id = payout_row.id
  where id = bet_row.id;

  update public.game_rounds
  set status = 'settled'::public.round_status,
      settled_at = now(),
      result = coalesce(result, outcome->'result_payload')
  where id = round_row.id;

  perform public.write_audit(
    'games.bet_settled',
    'bet',
    bet_row.id::text,
    null,
    jsonb_build_object(
      'game_key', p_game_key,
      'game_id', game_row.id,
      'game_version_id', version_row.id,
      'mode', round_row.mode,
      'stake', p_stake,
      'payout', outcome->>'payout_amount',
      'receipt_id', receipt_id,
      'controlled_demo', round_row.mode = 'controlled_demo'::public.game_mode
    ),
    null,
    null,
    'success'
  );

  -- Engagement must be derived from this settled bet (not client RPCs).
  perform public.apply_settled_bet_engagement(
    bet_row.id,
    p_game_key,
    coalesce((outcome->>'is_win')::boolean, false),
    p_stake
  );

  return jsonb_build_object(
    'replay', false,
    'bet_id', bet_row.id,
    'receipt_id', receipt_id,
    'game_key', p_game_key,
    'game_id', game_row.id,
    'game_version_id', version_row.id,
    'mode', round_row.mode,
    'stake', p_stake,
    'result', outcome->'result_payload',
    'total_return_multiplier', outcome->>'total_return_multiplier',
    'payout_amount', (outcome->>'payout_amount')::bigint,
    'is_win', (outcome->>'is_win')::boolean,
    'balance_after', coalesce(balance_after, 0)
  );
end;
$function$;
