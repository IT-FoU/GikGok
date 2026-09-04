-- Phase 5: server-authoritative game engine RPCs, seeds, rate limits.

INSERT INTO public.feature_flags (key, description, enabled, payload)
VALUES
  ('games.fish-prawn-crab', 'Enable Fish–Prawn–Crab', true, '{}'::jsonb),
  ('games.high-low', 'Enable High–Low Dice', true, '{}'::jsonb),
  ('games.spinning-plate', 'Enable Spinning Plate', true, '{}'::jsonb),
  ('games.controlled_demo', 'Allow Controlled Demo Mode setup', true, '{}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET enabled = EXCLUDED.enabled,
    description = EXCLUDED.description,
    updated_at = now();

UPDATE public.games
SET lifecycle_status = 'live',
    is_enabled = true,
    updated_at = now()
WHERE id IN ('fish-prawn-crab', 'high-low', 'spinning-plate');

INSERT INTO public.game_versions (game_id, version, config, guide_i18n, is_active)
VALUES
  (
    'fish-prawn-crab',
    1,
    jsonb_build_object(
      'symbols', jsonb_build_array('fish','prawn','crab','gourd','rooster','deer'),
      'single_symbol_multiplier', 2,
      'special_pair_multiplier', 10
    ),
    jsonb_build_object(
      'en', 'Choose one symbol (x2) or a special pair (x10).',
      'lo', 'ເລືອກສັນຍາລັກເລກໜຶ່ງ (x2) ຫຼື ຄູ່ພິເສດ (x10).'
    ),
    true
  ),
  (
    'high-low',
    1,
    jsonb_build_object(
      'low_range', jsonb_build_array(3, 10),
      'high_range', jsonb_build_array(11, 18),
      'multiplier', 2,
      'triples_lose', true
    ),
    jsonb_build_object(
      'en', 'Pick High or Low. Any triple loses.',
      'lo', 'ເລືອກສູງ ຫຼື ຕ່ຳ. ເລກຊ້ຳສາມໜ້າແພ້ທັງຄູ່.'
    ),
    true
  ),
  (
    'spinning-plate',
    1,
    jsonb_build_object(
      'slots', 12,
      'multipliers', jsonb_build_object(
        '1', 2, '2', 2, '3', 2, '4', 2,
        '5', 3, '6', 3, '7', 3,
        '8', 4, '9', 4,
        '10', 5, '11', 7, '12', 10
      ),
      'icons', jsonb_build_array(
        'Clover','Diamond','Heart','Spade','Bell','Cherry',
        'Lucky Clover','Star','Lucky 7','Crown','Diamond King','Jackpot'
      )
    ),
    jsonb_build_object(
      'en', 'Select one of twelve slots. Exact land only.',
      'lo', 'ເລືອກ 1 ໃນ 12 ຊ່ອງ. ຕ້ອງຕົກກົງກັນເທົ່ານັ້ນ.'
    ),
    true
  )
ON CONFLICT (game_id, version) DO UPDATE
SET config = EXCLUDED.config,
    guide_i18n = EXCLUDED.guide_i18n,
    is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS public.game_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  action_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_rate_limits_player_action_created_idx
  ON public.game_rate_limits (player_id, action_key, created_at DESC);

ALTER TABLE public.game_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_rate_limits_own_select
  ON public.game_rate_limits FOR SELECT TO authenticated
  USING (player_id = auth.uid() OR public.admin_has_permission('games.view'));

CREATE OR REPLACE FUNCTION public.enforce_game_rate_limit(
  p_player_id uuid,
  p_action_key text,
  p_limit integer DEFAULT 30,
  p_window_seconds integer DEFAULT 60
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  DELETE FROM public.game_rate_limits
  WHERE player_id = p_player_id
    AND action_key = p_action_key
    AND created_at < now() - make_interval(secs => p_window_seconds);

  SELECT count(*) INTO recent_count
  FROM public.game_rate_limits
  WHERE player_id = p_player_id
    AND action_key = p_action_key;

  IF recent_count >= p_limit THEN
    RAISE EXCEPTION 'rate limit exceeded';
  END IF;

  INSERT INTO public.game_rate_limits (player_id, action_key)
  VALUES (p_player_id, p_action_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_game_playable(p_game_id text)
RETURNS public.games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  game_row public.games;
  flag_enabled boolean;
BEGIN
  SELECT * INTO game_row FROM public.games WHERE id = p_game_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'game not found'; END IF;

  SELECT enabled INTO flag_enabled
  FROM public.feature_flags
  WHERE key = 'games.' || p_game_id;

  IF COALESCE(flag_enabled, false) = false THEN
    RAISE EXCEPTION 'game feature disabled';
  END IF;

  IF game_row.lifecycle_status <> 'live' OR game_row.is_enabled = false THEN
    RAISE EXCEPTION 'game is not available';
  END IF;

  IF game_row.maintenance_close_started_at IS NOT NULL THEN
    RAISE EXCEPTION 'game is in maintenance close';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.maintenance_state WHERE id = true AND is_active = true
  ) THEN
    RAISE EXCEPTION 'platform maintenance active';
  END IF;

  RETURN game_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_game_version(p_game_id text)
RETURNS public.game_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  version_row public.game_versions;
BEGIN
  SELECT * INTO version_row
  FROM public.game_versions
  WHERE game_id = p_game_id AND is_active = true
  ORDER BY version DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active game version missing';
  END IF;

  RETURN version_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_game_round(
  p_game_id text,
  p_settlement_mode public.settlement_mode DEFAULT 'random',
  p_controlled_demo_payload jsonb DEFAULT NULL,
  p_admin_id uuid DEFAULT auth.uid()
)
RETURNS public.game_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  version_row public.game_versions;
  round_row public.game_rounds;
BEGIN
  IF p_admin_id IS NULL OR NOT public.admin_has_permission('games.control', p_admin_id) THEN
    RAISE EXCEPTION 'missing games.control permission';
  END IF;

  PERFORM public.assert_game_playable(p_game_id);
  version_row := public.get_active_game_version(p_game_id);

  IF p_settlement_mode = 'controlled_demo' THEN
    IF p_controlled_demo_payload IS NULL THEN
      RAISE EXCEPTION 'controlled demo payload required before round begins';
    END IF;
    IF NOT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = 'games.controlled_demo'), false) THEN
      RAISE EXCEPTION 'controlled demo disabled';
    END IF;
  END IF;

  -- Close any stale open rounds for this game (subsequent-rounds-only control).
  UPDATE public.game_rounds
  SET status = 'cancelled', locked_at = now()
  WHERE game_id = p_game_id AND status = 'open';

  INSERT INTO public.game_rounds (
    game_id, game_version_id, status, settlement_mode, controlled_demo_payload, created_by
  )
  VALUES (
    p_game_id,
    version_row.id,
    'open',
    p_settlement_mode,
    CASE WHEN p_settlement_mode = 'controlled_demo' THEN p_controlled_demo_payload ELSE NULL END,
    p_admin_id
  )
  RETURNING * INTO round_row;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, result
  )
  VALUES (
    p_admin_id, 'admin', 'games.round_opened', 'game_round', round_row.id::text,
    jsonb_build_object(
      'game_id', p_game_id,
      'settlement_mode', p_settlement_mode,
      'controlled_demo', p_settlement_mode = 'controlled_demo'
    ),
    'success'
  );

  RETURN round_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_player_round(p_game_id text)
RETURNS public.game_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  round_row public.game_rounds;
  version_row public.game_versions;
BEGIN
  PERFORM public.assert_game_playable(p_game_id);

  SELECT * INTO round_row
  FROM public.game_rounds
  WHERE game_id = p_game_id AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN round_row;
  END IF;

  version_row := public.get_active_game_version(p_game_id);

  INSERT INTO public.game_rounds (
    game_id, game_version_id, status, settlement_mode
  )
  VALUES (p_game_id, version_row.id, 'open', 'random')
  RETURNING * INTO round_row;

  RETURN round_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_smooth_maintenance_close(
  p_game_id text,
  p_announcement_key text DEFAULT 'games.maintenance',
  p_admin_id uuid DEFAULT auth.uid()
)
RETURNS public.games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  game_row public.games;
BEGIN
  IF p_admin_id IS NULL OR NOT public.admin_has_permission('games.control', p_admin_id) THEN
    RAISE EXCEPTION 'missing games.control permission';
  END IF;

  UPDATE public.games
  SET maintenance_close_started_at = now(),
      maintenance_announcement_key = p_announcement_key,
      is_enabled = false,
      updated_at = now()
  WHERE id = p_game_id
  RETURNING * INTO game_row;

  -- Stop new bets by cancelling open rounds without locked bets pathway.
  UPDATE public.game_rounds
  SET status = 'cancelled', locked_at = COALESCE(locked_at, now())
  WHERE game_id = p_game_id AND status = 'open';

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, result
  )
  VALUES (
    p_admin_id, 'admin', 'games.smooth_close', 'game', p_game_id,
    jsonb_build_object('announcement_key', p_announcement_key),
    'success'
  );

  RETURN game_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_game_availability(
  p_game_id text,
  p_enabled boolean,
  p_lifecycle public.game_lifecycle_status DEFAULT NULL,
  p_admin_id uuid DEFAULT auth.uid()
)
RETURNS public.games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  game_row public.games;
BEGIN
  IF p_admin_id IS NULL OR NOT (
    public.admin_has_permission('games.control', p_admin_id)
    OR public.admin_has_permission('games.configure', p_admin_id)
  ) THEN
    RAISE EXCEPTION 'missing games control permission';
  END IF;

  UPDATE public.games
  SET is_enabled = p_enabled,
      lifecycle_status = COALESCE(p_lifecycle, lifecycle_status),
      maintenance_close_started_at = CASE WHEN p_enabled THEN NULL ELSE maintenance_close_started_at END,
      updated_at = now()
  WHERE id = p_game_id
  RETURNING * INTO game_row;

  INSERT INTO public.feature_flags (key, description, enabled)
  VALUES ('games.' || p_game_id, 'Enable ' || p_game_id, p_enabled)
  ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

  RETURN game_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_game_outcome(
  p_game_id text,
  p_selection jsonb,
  p_mode public.settlement_mode,
  p_controlled jsonb,
  p_stake bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
BEGIN
  IF p_game_id = 'fish-prawn-crab' THEN
    kind := p_selection->>'kind';
    symbols := ARRAY(SELECT jsonb_array_elements_text(p_selection->'symbols'));

    IF p_mode = 'controlled_demo' THEN
      dice := ARRAY(
        SELECT jsonb_array_elements_text(p_controlled->'dice')
      );
    ELSE
      dice := ARRAY[
        (ARRAY['fish','prawn','crab','gourd','rooster','deer'])[1 + floor(random()*6)::int],
        (ARRAY['fish','prawn','crab','gourd','rooster','deer'])[1 + floor(random()*6)::int],
        (ARRAY['fish','prawn','crab','gourd','rooster','deer'])[1 + floor(random()*6)::int]
      ];
    END IF;

    IF array_length(dice, 1) IS DISTINCT FROM 3 THEN
      RAISE EXCEPTION 'invalid controlled demo dice';
    END IF;

    present := dice;
    IF kind = 'single_symbol' THEN
      IF symbols[1] = ANY (present) THEN multiplier := 2; END IF;
    ELSIF kind = 'special_pair' THEN
      IF symbols[1] = ANY (present) AND symbols[2] = ANY (present) THEN
        multiplier := 10;
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid fpc selection';
    END IF;

    payload := jsonb_build_object(
      'game', 'fish-prawn-crab',
      'kind', kind,
      'symbols', to_jsonb(symbols),
      'dice', to_jsonb(dice)
    );

  ELSIF p_game_id = 'high-low' THEN
    side := p_selection->>'side';
    IF side NOT IN ('high', 'low') THEN RAISE EXCEPTION 'invalid high-low selection'; END IF;

    IF p_mode = 'controlled_demo' THEN
      nums := ARRAY[
        (p_controlled->'dice'->>0)::int,
        (p_controlled->'dice'->>1)::int,
        (p_controlled->'dice'->>2)::int
      ];
    ELSE
      nums := ARRAY[
        1 + floor(random()*6)::int,
        1 + floor(random()*6)::int,
        1 + floor(random()*6)::int
      ];
    END IF;

    total := nums[1] + nums[2] + nums[3];
    is_triple := nums[1] = nums[2] AND nums[2] = nums[3];
    IF NOT is_triple THEN
      IF side = 'low' AND total BETWEEN 3 AND 10 THEN multiplier := 2; END IF;
      IF side = 'high' AND total BETWEEN 11 AND 18 THEN multiplier := 2; END IF;
    END IF;

    payload := jsonb_build_object(
      'game', 'high-low',
      'side', side,
      'dice', to_jsonb(nums),
      'total', total,
      'isTriple', is_triple,
      'actualSide', CASE WHEN total <= 10 THEN 'low' ELSE 'high' END
    );

  ELSIF p_game_id = 'spinning-plate' THEN
    selected := (p_selection->>'slot')::int;
    IF selected < 1 OR selected > 12 THEN RAISE EXCEPTION 'invalid plate selection'; END IF;

    IF p_mode = 'controlled_demo' THEN
      slot := (p_controlled->>'landedSlot')::int;
    ELSE
      slot := 1 + floor(random()*12)::int;
    END IF;

    IF slot < 1 OR slot > 12 THEN RAISE EXCEPTION 'invalid controlled plate slot'; END IF;

    IF selected = slot THEN
      multiplier := CASE slot
        WHEN 1 THEN 2 WHEN 2 THEN 2 WHEN 3 THEN 2 WHEN 4 THEN 2
        WHEN 5 THEN 3 WHEN 6 THEN 3 WHEN 7 THEN 3
        WHEN 8 THEN 4 WHEN 9 THEN 4
        WHEN 10 THEN 5 WHEN 11 THEN 7 WHEN 12 THEN 10
      END;
    END IF;

    payload := jsonb_build_object(
      'game', 'spinning-plate',
      'selectedSlot', selected,
      'landedSlot', slot,
      'multiplier', COALESCE(
        CASE slot
          WHEN 1 THEN 2 WHEN 2 THEN 2 WHEN 3 THEN 2 WHEN 4 THEN 2
          WHEN 5 THEN 3 WHEN 6 THEN 3 WHEN 7 THEN 3
          WHEN 8 THEN 4 WHEN 9 THEN 4
          WHEN 10 THEN 5 WHEN 11 THEN 7 WHEN 12 THEN 10
        END, 0)
    );
  ELSE
    RAISE EXCEPTION 'unsupported game';
  END IF;

  RETURN jsonb_build_object(
    'result_payload', payload,
    'total_return_multiplier', multiplier,
    'payout_amount', (p_stake * multiplier)::bigint,
    'is_win', multiplier > 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.place_and_settle_bet(
  p_game_id text,
  p_stake bigint,
  p_selection jsonb,
  p_idempotency_key text,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  game_row public.games;
  round_row public.game_rounds;
  version_row public.game_versions;
  existing public.bets;
  bet_row public.bets;
  outcome jsonb;
  debit_id uuid;
  payout_id uuid;
  receipt_id uuid;
  balance_after bigint;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF auth.uid() IS DISTINCT FROM p_player_id THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'idempotency key required';
  END IF;

  PERFORM public.enforce_game_rate_limit(p_player_id, 'bet:' || p_game_id, 30, 60);

  IF NOT public.is_player_verified(p_player_id) THEN
    RAISE EXCEPTION 'verify contact before playing';
  END IF;

  IF (SELECT status FROM public.profiles WHERE id = p_player_id) IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'account is not active';
  END IF;

  game_row := public.assert_game_playable(p_game_id);

  IF p_stake IS NULL OR p_stake <= 0 OR p_stake <> floor(p_stake) THEN
    RAISE EXCEPTION 'stake must be a positive whole number';
  END IF;
  IF p_stake < game_row.min_stake OR p_stake > game_row.max_stake THEN
    RAISE EXCEPTION 'stake out of range';
  END IF;

  -- Reject invalid selections before any ledger write.
  IF p_game_id = 'fish-prawn-crab' THEN
    IF (p_selection->>'kind') = 'single_symbol' THEN
      IF jsonb_array_length(COALESCE(p_selection->'symbols', '[]'::jsonb)) <> 1 THEN
        RAISE EXCEPTION 'invalid fpc selection';
      END IF;
    ELSIF (p_selection->>'kind') = 'special_pair' THEN
      IF jsonb_array_length(COALESCE(p_selection->'symbols', '[]'::jsonb)) <> 2 THEN
        RAISE EXCEPTION 'invalid fpc selection';
      END IF;
      IF (p_selection->'symbols'->>0) = (p_selection->'symbols'->>1) THEN
        RAISE EXCEPTION 'invalid fpc selection';
      END IF;
    ELSE
      RAISE EXCEPTION 'invalid fpc selection';
    END IF;
  ELSIF p_game_id = 'high-low' THEN
    IF (p_selection->>'side') NOT IN ('high', 'low') THEN
      RAISE EXCEPTION 'invalid high-low selection';
    END IF;
  ELSIF p_game_id = 'spinning-plate' THEN
    IF COALESCE((p_selection->>'slot')::int, 0) NOT BETWEEN 1 AND 12 THEN
      RAISE EXCEPTION 'invalid plate selection';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported game';
  END IF;

  SELECT * INTO existing
  FROM public.bets
  WHERE player_id = p_player_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    SELECT jsonb_build_object(
      'replay', true,
      'bet_id', existing.id,
      'status', existing.status,
      'receipt', (
        SELECT to_jsonb(r) FROM public.bet_receipts r WHERE r.bet_id = existing.id
      )
    ) INTO outcome;
    RETURN outcome;
  END IF;

  round_row := public.ensure_player_round(p_game_id);
  IF round_row.status <> 'open' THEN
    RAISE EXCEPTION 'round is not open for bets';
  END IF;

  -- Controlled demo must be chosen before the round begins; never alter locked normal rounds.
  IF round_row.settlement_mode = 'random' AND round_row.controlled_demo_payload IS NOT NULL THEN
    RAISE EXCEPTION 'invalid round configuration';
  END IF;
  IF round_row.settlement_mode = 'controlled_demo' AND round_row.controlled_demo_payload IS NULL THEN
    RAISE EXCEPTION 'controlled demo payload missing on round';
  END IF;

  version_row := public.get_active_game_version(p_game_id);
  IF round_row.game_version_id <> version_row.id THEN
    -- Keep the round's frozen version for historical bets.
    SELECT * INTO version_row FROM public.game_versions WHERE id = round_row.game_version_id;
  END IF;

  -- Create bet shell first so ledger debit can reference source_id (append-only; no ledger updates).
  INSERT INTO public.bets (
    round_id, player_id, game_id, game_version_id, status, stake, selection,
    idempotency_key, locked_at
  )
  VALUES (
    round_row.id, p_player_id, p_game_id, version_row.id, 'locked', p_stake, p_selection,
    p_idempotency_key, now()
  )
  RETURNING * INTO bet_row;

  INSERT INTO public.ledger_entries (
    player_id, entry_type, amount, balance_after, source_type, source_id, actor_id, reason, metadata
  )
  VALUES (
    p_player_id, 'bet_debit', -p_stake, 0, 'bet', bet_row.id, p_player_id, 'Game stake debit',
    jsonb_build_object(
      'game_id', p_game_id,
      'idempotency_key', p_idempotency_key,
      'game_version_id', version_row.id,
      'settlement_mode', round_row.settlement_mode
    )
  )
  RETURNING id INTO debit_id;

  UPDATE public.bets
  SET debit_ledger_entry_id = debit_id,
      updated_at = now()
  WHERE id = bet_row.id;

  outcome := public.settle_game_outcome(
    p_game_id,
    p_selection,
    round_row.settlement_mode,
    round_row.controlled_demo_payload,
    p_stake
  );

  IF (outcome->>'payout_amount')::bigint > 0 THEN
    INSERT INTO public.ledger_entries (
      player_id, entry_type, amount, balance_after, source_type, source_id, actor_id, reason, metadata
    )
    VALUES (
      p_player_id, 'game_payout', (outcome->>'payout_amount')::bigint, 0, 'bet', bet_row.id, p_player_id,
      'Game payout',
      jsonb_build_object(
        'game_id', p_game_id,
        'settlement_mode', round_row.settlement_mode,
        'total_return_multiplier', outcome->>'total_return_multiplier'
      )
    )
    RETURNING id INTO payout_id;
  END IF;

  INSERT INTO public.bet_outcomes (
    bet_id, result_payload, total_return_multiplier, payout_amount, is_win
  )
  VALUES (
    bet_row.id,
    outcome->'result_payload',
    (outcome->>'total_return_multiplier')::numeric,
    (outcome->>'payout_amount')::bigint,
    (outcome->>'is_win')::boolean
  );

  SELECT balance INTO balance_after
  FROM public.player_balances
  WHERE player_id = p_player_id;

  INSERT INTO public.bet_receipts (
    bet_id, player_id, game_id, game_version_id, settlement_mode, stake, selection,
    result_payload, total_return_multiplier, payout_amount, balance_after, is_win
  )
  VALUES (
    bet_row.id, p_player_id, p_game_id, version_row.id, round_row.settlement_mode, p_stake, p_selection,
    outcome->'result_payload',
    (outcome->>'total_return_multiplier')::numeric,
    (outcome->>'payout_amount')::bigint,
    COALESCE(balance_after, 0),
    (outcome->>'is_win')::boolean
  )
  RETURNING id INTO receipt_id;

  UPDATE public.bets
  SET status = 'settled',
      settled_at = now(),
      payout_ledger_entry_id = payout_id,
      updated_at = now()
  WHERE id = bet_row.id;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, result
  )
  VALUES (
    p_player_id, 'player', 'games.bet_settled', 'bet', bet_row.id::text,
    jsonb_build_object(
      'game_id', p_game_id,
      'game_version_id', version_row.id,
      'settlement_mode', round_row.settlement_mode,
      'stake', p_stake,
      'payout', outcome->>'payout_amount',
      'receipt_id', receipt_id,
      'controlled_demo', round_row.settlement_mode = 'controlled_demo'
    ),
    'success'
  );

  RETURN jsonb_build_object(
    'replay', false,
    'bet_id', bet_row.id,
    'receipt_id', receipt_id,
    'game_version_id', version_row.id,
    'settlement_mode', round_row.settlement_mode,
    'stake', p_stake,
    'result', outcome->'result_payload',
    'total_return_multiplier', outcome->>'total_return_multiplier',
    'payout_amount', outcome->>'payout_amount',
    'is_win', outcome->>'is_win',
    'balance_after', COALESCE(balance_after, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_game_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_game_playable(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_game_version(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.open_game_round(text, public.settlement_mode, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_player_round(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_smooth_maintenance_close(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_game_availability(text, boolean, public.game_lifecycle_status, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_game_outcome(text, jsonb, public.settlement_mode, jsonb, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_and_settle_bet(text, bigint, jsonb, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.open_game_round(text, public.settlement_mode, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_smooth_maintenance_close(text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_game_availability(text, boolean, public.game_lifecycle_status, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_and_settle_bet(text, bigint, jsonb, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_player_round(text) TO authenticated, service_role;
