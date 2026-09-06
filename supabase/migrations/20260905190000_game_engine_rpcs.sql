-- Phase 5 — Server-authoritative game engine RPCs (staging schema).
-- Game keys: fish_prawn_crab | high_low | spinning_plate (UUID ids resolved internally).
-- Guide bilingual text lives in game_versions.config.guide {en,lo} (no guide_i18n column).
-- SECURITY DEFINER functions pin search_path; PUBLIC EXECUTE revoked; anon cannot settle.

-- ---------------------------------------------------------------------------
-- 1) Feature flags (is_enabled / audience — not enabled / payload)
-- ---------------------------------------------------------------------------
insert into public.feature_flags (key, description, is_enabled, audience)
values
  ('games.fish_prawn_crab', 'Enable Fish–Prawn–Crab', true, '{}'::jsonb),
  ('games.high_low', 'Enable High–Low Dice', true, '{}'::jsonb),
  ('games.spinning_plate', 'Enable Spinning Plate', true, '{}'::jsonb),
  ('games.controlled_demo', 'Allow Controlled Demo Mode setup', true, '{}'::jsonb)
on conflict (key) do update
set description = excluded.description,
    is_enabled = excluded.is_enabled,
    audience = excluded.audience,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 2) Merge bilingual guides into config.guide without dropping existing keys
-- ---------------------------------------------------------------------------
update public.game_versions gv
set config = jsonb_set(
  gv.config,
  '{guide}',
  jsonb_build_object(
    'en', 'Choose one symbol (x2) or a special pair (x10).',
    'lo', 'ເລືອກສັນຍາລັກເລກໜຶ່ງ (x2) ຫຼື ຄູ່ພິເສດ (x10).'
  ),
  true
)
from public.games g
where g.id = gv.game_id
  and g.key = 'fish_prawn_crab'
  and gv.version = 1;

update public.game_versions gv
set config = jsonb_set(
  gv.config,
  '{guide}',
  jsonb_build_object(
    'en', 'Pick High or Low. Any triple loses.',
    'lo', 'ເລືອກສູງ ຫຼື ຕ່ຳ. ເລກຊ້ຳສາມໜ້າແພ້ທັງຄູ່.'
  ),
  true
)
from public.games g
where g.id = gv.game_id
  and g.key = 'high_low'
  and gv.version = 1;

update public.game_versions gv
set config = jsonb_set(
  gv.config,
  '{guide}',
  jsonb_build_object(
    'en', 'Select one of twelve slots. Exact land only.',
    'lo', 'ເລືອກ 1 ໃນ 12 ຊ່ອງ. ຕ້ອງຕົກກົງກັນເທົ່ານັ້ນ.'
  ),
  true
)
from public.games g
where g.id = gv.game_id
  and g.key = 'spinning_plate'
  and gv.version = 1;

-- ---------------------------------------------------------------------------
-- 3) Rate-limit table + enforcer
-- ---------------------------------------------------------------------------
create table if not exists public.game_rate_limits (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index if not exists game_rate_limits_player_bucket_created_idx
  on public.game_rate_limits (player_id, bucket, created_at desc);

alter table public.game_rate_limits enable row level security;

revoke all on public.game_rate_limits from anon, authenticated;
grant all on public.game_rate_limits to service_role;
grant select on public.game_rate_limits to authenticated;

drop policy if exists game_rate_limits_own_select on public.game_rate_limits;
create policy game_rate_limits_own_select
  on public.game_rate_limits for select to authenticated
  using (
    player_id = (select auth.uid())
    or public.has_permission('games.view'::public.app_permission)
  );

create or replace function public.enforce_game_rate_limit(
  p_player_id uuid,
  p_bucket text,
  p_limit integer default 30,
  p_window integer default 60
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  recent_count integer;
begin
  if p_player_id is null or nullif(trim(p_bucket), '') is null then
    raise exception 'rate limit args required' using errcode = 'check_violation';
  end if;
  if p_limit is null or p_limit < 1 or p_window is null or p_window < 1 then
    raise exception 'invalid rate limit window' using errcode = 'check_violation';
  end if;

  delete from public.game_rate_limits
  where player_id = p_player_id
    and bucket = p_bucket
    and created_at < now() - make_interval(secs => p_window);

  select count(*) into recent_count
  from public.game_rate_limits
  where player_id = p_player_id
    and bucket = p_bucket;

  if recent_count >= p_limit then
    raise exception 'rate limit exceeded' using errcode = 'check_violation';
  end if;

  insert into public.game_rate_limits (player_id, bucket)
  values (p_player_id, p_bucket);
end;
$$;

comment on function public.enforce_game_rate_limit(uuid, text, integer, integer) is
  'Sliding-window rate limit for game endpoints. Internal — called from settlement RPCs.';

-- ---------------------------------------------------------------------------
-- Helpers: resolve game by key
-- ---------------------------------------------------------------------------
create or replace function public.assert_game_playable(p_game_key text)
returns public.games
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  game_row public.games;
  flag_enabled boolean;
  platform_maintenance boolean;
begin
  select * into game_row
  from public.games
  where key = p_game_key;

  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;

  select is_enabled into flag_enabled
  from public.feature_flags
  where key = 'games.' || p_game_key;

  if coalesce(flag_enabled, false) = false then
    raise exception 'game feature disabled' using errcode = 'check_violation';
  end if;

  if game_row.status is distinct from 'live'::public.game_status
     or game_row.is_enabled = false then
    raise exception 'game is not available' using errcode = 'check_violation';
  end if;

  select is_maintenance into platform_maintenance
  from public.maintenance_state
  where id = true;

  if coalesce(platform_maintenance, false) then
    raise exception 'platform maintenance active' using errcode = 'check_violation';
  end if;

  return game_row;
end;
$$;

create or replace function public.get_active_game_version(p_game_key text)
returns public.game_versions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  game_row public.games;
  version_row public.game_versions;
begin
  select * into game_row from public.games where key = p_game_key;
  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;

  if game_row.active_version_id is null then
    raise exception 'active game version missing' using errcode = 'no_data_found';
  end if;

  select * into version_row
  from public.game_versions
  where id = game_row.active_version_id
    and game_id = game_row.id;

  if not found then
    raise exception 'active game version missing' using errcode = 'no_data_found';
  end if;

  return version_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Round lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.open_game_round(
  p_game_key text,
  p_mode public.game_mode default 'random',
  p_controlled_result jsonb default null
)
returns public.game_rounds
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  game_row public.games;
  version_row public.game_versions;
  round_row public.game_rounds;
  demo_flag boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if not public.has_permission('games.control'::public.app_permission) then
    raise exception 'missing games.control permission'
      using errcode = 'insufficient_privilege';
  end if;

  game_row := public.assert_game_playable(p_game_key);
  version_row := public.get_active_game_version(p_game_key);

  if p_mode = 'controlled_demo'::public.game_mode then
    if p_controlled_result is null then
      raise exception 'controlled demo result required before round begins'
        using errcode = 'check_violation';
    end if;

    select is_enabled into demo_flag
    from public.feature_flags
    where key = 'games.controlled_demo';

    if coalesce(demo_flag, false) = false then
      raise exception 'controlled demo disabled' using errcode = 'check_violation';
    end if;
  elsif p_controlled_result is not null then
    raise exception 'controlled result only allowed for controlled_demo mode'
      using errcode = 'check_violation';
  end if;

  -- Close stale open rounds for this game (never mutate locked/settled).
  update public.game_rounds
  set status = 'voided'::public.round_status
  where game_id = game_row.id
    and status = 'open'::public.round_status;

  insert into public.game_rounds (
    game_id,
    game_version_id,
    mode,
    status,
    result,
    controlled_by
  )
  values (
    game_row.id,
    version_row.id,
    p_mode,
    'open'::public.round_status,
    case
      when p_mode = 'controlled_demo'::public.game_mode then p_controlled_result
      else null
    end,
    case
      when p_mode = 'controlled_demo'::public.game_mode then auth.uid()
      else null
    end
  )
  returning * into round_row;

  perform public.write_audit(
    'games.round_opened',
    'game_round',
    round_row.id::text,
    null,
    jsonb_build_object(
      'game_key', p_game_key,
      'game_id', game_row.id,
      'mode', p_mode,
      'controlled_demo', p_mode = 'controlled_demo'::public.game_mode
    ),
    null,
    null,
    'success'
  );

  return round_row;
end;
$$;

create or replace function public.ensure_player_round(p_game_key text)
returns public.game_rounds
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  game_row public.games;
  version_row public.game_versions;
  round_row public.game_rounds;
begin
  game_row := public.assert_game_playable(p_game_key);

  select * into round_row
  from public.game_rounds
  where game_id = game_row.id
    and status = 'open'::public.round_status
    and mode = 'random'::public.game_mode
  order by opened_at desc
  limit 1
  for update skip locked;

  if found then
    return round_row;
  end if;

  version_row := public.get_active_game_version(p_game_key);

  insert into public.game_rounds (
    game_id, game_version_id, mode, status, result, controlled_by
  )
  values (
    game_row.id,
    version_row.id,
    'random'::public.game_mode,
    'open'::public.round_status,
    null,
    null
  )
  returning * into round_row;

  return round_row;
end;
$$;

create or replace function public.set_game_availability(
  p_game_key text,
  p_enabled boolean,
  p_message text default null
)
returns public.games
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  game_row public.games;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if not public.has_permission('games.control'::public.app_permission) then
    raise exception 'missing games.control permission'
      using errcode = 'insufficient_privilege';
  end if;

  update public.games
  set is_enabled = p_enabled,
      maintenance_message = case
        when p_enabled then null
        else coalesce(nullif(trim(p_message), ''), maintenance_message)
      end,
      updated_at = now()
  where key = p_game_key
  returning * into game_row;

  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;

  insert into public.feature_flags (key, description, is_enabled, audience)
  values (
    'games.' || p_game_key,
    'Enable ' || p_game_key,
    p_enabled,
    '{}'::jsonb
  )
  on conflict (key) do update
  set is_enabled = excluded.is_enabled,
      updated_at = now();

  perform public.write_audit(
    'games.availability',
    'game',
    game_row.id::text,
    null,
    jsonb_build_object(
      'game_key', p_game_key,
      'is_enabled', p_enabled,
      'message', game_row.maintenance_message
    ),
    null,
    null,
    'success'
  );

  return game_row;
end;
$$;

create or replace function public.start_smooth_maintenance_close(
  p_game_key text,
  p_message text default 'Game entering maintenance. New bets are closed.'
)
returns public.games
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  game_row public.games;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if not public.has_permission('games.control'::public.app_permission) then
    raise exception 'missing games.control permission'
      using errcode = 'insufficient_privilege';
  end if;

  update public.games
  set is_enabled = false,
      maintenance_message = coalesce(
        nullif(trim(p_message), ''),
        'Game entering maintenance. New bets are closed.'
      ),
      updated_at = now()
  where key = p_game_key
  returning * into game_row;

  if not found then
    raise exception 'game not found' using errcode = 'no_data_found';
  end if;

  -- Stop new bets: void open rounds (never touch locked/settled).
  update public.game_rounds
  set status = 'voided'::public.round_status
  where game_id = game_row.id
    and status = 'open'::public.round_status;

  insert into public.feature_flags (key, description, is_enabled, audience)
  values ('games.' || p_game_key, 'Enable ' || p_game_key, false, '{}'::jsonb)
  on conflict (key) do update
  set is_enabled = false,
      updated_at = now();

  perform public.write_audit(
    'games.smooth_close',
    'game',
    game_row.id::text,
    null,
    jsonb_build_object(
      'game_key', p_game_key,
      'message', game_row.maintenance_message
    ),
    null,
    null,
    'success'
  );

  return game_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pure SQL settlement helpers (mirror TS rules; keys use underscores)
-- ---------------------------------------------------------------------------
create or replace function public.settle_game_outcome(
  p_game_key text,
  p_selection jsonb,
  p_mode public.game_mode,
  p_controlled jsonb,
  p_stake bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  dice text[];
  nums int[];
  slot int;
  selected int;
  kind text;
  symbols text[];
  present text[];
  side text;
  total int;
  is_triple boolean;
  multiplier numeric := 0;
  payload jsonb;
  symbols_valid text[] := array['fish','prawn','crab','gourd','rooster','deer'];
begin
  if p_stake is null or p_stake <= 0 then
    raise exception 'stake must be a positive whole number'
      using errcode = 'check_violation';
  end if;

  if p_game_key = 'fish_prawn_crab' then
    kind := p_selection->>'kind';
    symbols := array(select jsonb_array_elements_text(p_selection->'symbols'));

    if p_mode = 'controlled_demo'::public.game_mode then
      if p_controlled is null then
        raise exception 'controlled demo result missing' using errcode = 'check_violation';
      end if;
      dice := array(select jsonb_array_elements_text(p_controlled->'dice'));
    else
      dice := array[
        symbols_valid[1 + floor(random() * 6)::int],
        symbols_valid[1 + floor(random() * 6)::int],
        symbols_valid[1 + floor(random() * 6)::int]
      ];
    end if;

    if array_length(dice, 1) is distinct from 3 then
      raise exception 'invalid controlled demo dice' using errcode = 'check_violation';
    end if;

    present := dice;
    if kind = 'single_symbol' then
      if symbols[1] = any (present) then
        multiplier := 2;
      end if;
    elsif kind = 'special_pair' then
      if symbols[1] = any (present) and symbols[2] = any (present) then
        multiplier := 10;
      end if;
    else
      raise exception 'invalid fpc selection' using errcode = 'check_violation';
    end if;

    payload := jsonb_build_object(
      'game', 'fish_prawn_crab',
      'kind', kind,
      'symbols', to_jsonb(symbols),
      'dice', to_jsonb(dice)
    );

  elsif p_game_key = 'high_low' then
    side := p_selection->>'side';
    if side not in ('high', 'low') then
      raise exception 'invalid high-low selection' using errcode = 'check_violation';
    end if;

    if p_mode = 'controlled_demo'::public.game_mode then
      if p_controlled is null then
        raise exception 'controlled demo result missing' using errcode = 'check_violation';
      end if;
      nums := array[
        (p_controlled->'dice'->>0)::int,
        (p_controlled->'dice'->>1)::int,
        (p_controlled->'dice'->>2)::int
      ];
    else
      nums := array[
        1 + floor(random() * 6)::int,
        1 + floor(random() * 6)::int,
        1 + floor(random() * 6)::int
      ];
    end if;

    if nums[1] not between 1 and 6
       or nums[2] not between 1 and 6
       or nums[3] not between 1 and 6 then
      raise exception 'invalid controlled demo dice' using errcode = 'check_violation';
    end if;

    total := nums[1] + nums[2] + nums[3];
    is_triple := nums[1] = nums[2] and nums[2] = nums[3];
    if not is_triple then
      if side = 'low' and total between 3 and 10 then
        multiplier := 2;
      end if;
      if side = 'high' and total between 11 and 18 then
        multiplier := 2;
      end if;
    end if;

    payload := jsonb_build_object(
      'game', 'high_low',
      'side', side,
      'dice', to_jsonb(nums),
      'total', total,
      'isTriple', is_triple,
      'actualSide', case when total <= 10 then 'low' else 'high' end
    );

  elsif p_game_key = 'spinning_plate' then
    selected := (p_selection->>'slot')::int;
    if selected < 1 or selected > 12 then
      raise exception 'invalid plate selection' using errcode = 'check_violation';
    end if;

    if p_mode = 'controlled_demo'::public.game_mode then
      if p_controlled is null then
        raise exception 'controlled demo result missing' using errcode = 'check_violation';
      end if;
      slot := (p_controlled->>'landedSlot')::int;
    else
      slot := 1 + floor(random() * 12)::int;
    end if;

    if slot < 1 or slot > 12 then
      raise exception 'invalid controlled plate slot' using errcode = 'check_violation';
    end if;

    if selected = slot then
      multiplier := case slot
        when 1 then 2 when 2 then 2 when 3 then 2 when 4 then 2
        when 5 then 3 when 6 then 3 when 7 then 3
        when 8 then 4 when 9 then 4
        when 10 then 5 when 11 then 7 when 12 then 10
      end;
    end if;

    payload := jsonb_build_object(
      'game', 'spinning_plate',
      'selectedSlot', selected,
      'landedSlot', slot,
      'multiplier', coalesce(
        case slot
          when 1 then 2 when 2 then 2 when 3 then 2 when 4 then 2
          when 5 then 3 when 6 then 3 when 7 then 3
          when 8 then 4 when 9 then 4
          when 10 then 5 when 11 then 7 when 12 then 10
        end, 0)
    );
  else
    raise exception 'unsupported game' using errcode = 'check_violation';
  end if;

  return jsonb_build_object(
    'result_payload', payload,
    'total_return_multiplier', multiplier,
    'payout_amount', (p_stake * multiplier)::bigint,
    'is_win', multiplier > 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic place + settle (browser never supplies payout)
-- ---------------------------------------------------------------------------
create or replace function public.place_and_settle_bet(
  p_game_key text,
  p_idempotency_key text,
  p_stake bigint,
  p_selection jsonb,
  p_mode public.game_mode default 'random',
  p_controlled_result jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- Grants / revokes (hardening style). Anon must NOT execute settlement.
-- ---------------------------------------------------------------------------
revoke all on function public.enforce_game_rate_limit(uuid, text, integer, integer) from public;
revoke all on function public.assert_game_playable(text) from public;
revoke all on function public.get_active_game_version(text) from public;
revoke all on function public.open_game_round(text, public.game_mode, jsonb) from public;
revoke all on function public.ensure_player_round(text) from public;
revoke all on function public.set_game_availability(text, boolean, text) from public;
revoke all on function public.start_smooth_maintenance_close(text, text) from public;
revoke all on function public.settle_game_outcome(text, jsonb, public.game_mode, jsonb, bigint) from public;
revoke all on function public.place_and_settle_bet(text, text, bigint, jsonb, public.game_mode, jsonb) from public;

revoke all on function public.enforce_game_rate_limit(uuid, text, integer, integer) from anon, authenticated;
revoke all on function public.assert_game_playable(text) from anon, authenticated;
revoke all on function public.settle_game_outcome(text, jsonb, public.game_mode, jsonb, bigint) from anon, authenticated;

grant execute on function public.get_active_game_version(text)
  to authenticated, service_role;
grant execute on function public.open_game_round(text, public.game_mode, jsonb)
  to authenticated, service_role;
grant execute on function public.ensure_player_round(text)
  to authenticated, service_role;
grant execute on function public.set_game_availability(text, boolean, text)
  to authenticated, service_role;
grant execute on function public.start_smooth_maintenance_close(text, text)
  to authenticated, service_role;
grant execute on function public.place_and_settle_bet(text, text, bigint, jsonb, public.game_mode, jsonb)
  to authenticated, service_role;

-- Internal helpers usable by service_role / other DEFINER functions only.
grant execute on function public.enforce_game_rate_limit(uuid, text, integer, integer)
  to service_role;
grant execute on function public.assert_game_playable(text)
  to service_role;
grant execute on function public.settle_game_outcome(text, jsonb, public.game_mode, jsonb, bigint)
  to service_role;
