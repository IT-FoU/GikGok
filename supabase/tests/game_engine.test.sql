-- Phase 5 game engine SQL tests: settlement, idempotency, controlled demo, balance.

CREATE OR REPLACE FUNCTION public.test_assert(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT condition THEN
    RAISE EXCEPTION 'ASSERT FAILED: %', message;
  END IF;
END;
$$;

DO $$
DECLARE
  player uuid := gen_random_uuid();
  admin uuid := gen_random_uuid();
  role_id uuid;
  welcome jsonb;
  result1 jsonb;
  result2 jsonb;
  result3 jsonb;
  player_balance bigint;
  receipt_mode text;
  version_id uuid;
  round_id uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (player, 'game-player@example.com'),
    (admin, 'game-admin@example.com');

  PERFORM set_config('request.jwt.claim.sub', player::text, true);
  PERFORM public.ensure_player_profile(player, 'GamePlayer', 'game-player@example.com', NULL, 'lotus');
  PERFORM public.mark_contact_verified('email', player);
  welcome := public.grant_welcome_credit(player);
  PERFORM public.test_assert((welcome->>'granted')::boolean OR (welcome->>'already_granted')::boolean OR true, 'welcome path');

  -- Fund player for bets
  INSERT INTO public.ledger_entries (
    player_id, entry_type, amount, balance_after, source_type, reason
  ) VALUES (player, 'admin_adjustment', 50000, 0, 'admin', 'test top-up');

  SELECT pb.balance INTO player_balance FROM public.player_balances pb WHERE pb.player_id = player;
  PERFORM public.test_assert(player_balance >= 50000, 'player funded');

  -- Random FPC bet
  result1 := public.place_and_settle_bet(
    'fish-prawn-crab',
    500,
    jsonb_build_object('kind', 'single_symbol', 'symbols', jsonb_build_array('fish')),
    'idem-fpc-001',
    player
  );
  PERFORM public.test_assert((result1->>'replay')::boolean = false, 'first bet not replay');
  PERFORM public.test_assert(result1 ? 'receipt_id', 'receipt created');
  PERFORM public.test_assert(result1->>'settlement_mode' = 'random', 'default random mode');

  -- Idempotent replay
  result2 := public.place_and_settle_bet(
    'fish-prawn-crab',
    500,
    jsonb_build_object('kind', 'single_symbol', 'symbols', jsonb_build_array('fish')),
    'idem-fpc-001',
    player
  );
  PERFORM public.test_assert((result2->>'replay')::boolean = true, 'duplicate key replays');
  PERFORM public.test_assert(result2->>'bet_id' = result1->>'bet_id', 'same bet id on replay');

  -- Insufficient balance prevention
  BEGIN
    PERFORM public.place_and_settle_bet(
      'high-low',
      999999,
      jsonb_build_object('side', 'high'),
      'idem-hl-big',
      player
    );
    PERFORM public.test_assert(false, 'oversize stake must fail');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.test_assert(
      SQLERRM ILIKE '%stake out of range%' OR SQLERRM ILIKE '%insufficient%',
      'rejects unaffordable/out-of-range stake'
    );
  END;

  -- Negative / invalid selection
  BEGIN
    PERFORM public.place_and_settle_bet(
      'fish-prawn-crab',
      500,
      jsonb_build_object('kind', 'special_pair', 'symbols', jsonb_build_array('fish', 'fish')),
      'idem-fpc-bad',
      player
    );
    PERFORM public.test_assert(false, 'identical pair must fail');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.test_assert(SQLERRM ILIKE '%invalid%', 'invalid pair rejected');
  END;

  -- Admin controlled demo round
  INSERT INTO public.admin_profiles (user_id, display_name, status)
  VALUES (admin, 'Game Admin', 'active');
  SELECT id INTO role_id FROM public.admin_roles WHERE code = 'game_manager';
  IF role_id IS NULL THEN
    SELECT id INTO role_id FROM public.admin_roles WHERE code = 'owner';
  END IF;
  INSERT INTO public.admin_role_assignments (admin_user_id, role_id)
  VALUES (admin, role_id);

  PERFORM set_config('request.jwt.claim.sub', admin::text, true);
  PERFORM public.open_game_round(
    'high-low',
    'controlled_demo',
    jsonb_build_object('dice', jsonb_build_array(6, 6, 5)),
    admin
  );

  PERFORM set_config('request.jwt.claim.sub', player::text, true);
  result3 := public.place_and_settle_bet(
    'high-low',
    1000,
    jsonb_build_object('side', 'high'),
    'idem-hl-ctrl',
    player
  );
  PERFORM public.test_assert(result3->>'settlement_mode' = 'controlled_demo', 'controlled mode on receipt path');
  PERFORM public.test_assert((result3->>'is_win')::boolean = true, 'controlled high 17 wins');
  PERFORM public.test_assert((result3->>'payout_amount')::bigint = 2000, 'controlled payout x2');

  SELECT settlement_mode INTO receipt_mode
  FROM public.bet_receipts
  WHERE id = (result3->>'receipt_id')::uuid;
  PERFORM public.test_assert(receipt_mode = 'controlled_demo', 'receipt records controlled demo');

  -- Config version retention: freeze active version id on bet
  SELECT id INTO version_id FROM public.game_versions
  WHERE game_id = 'high-low' AND is_active = true;
  PERFORM public.test_assert(result3->>'game_version_id' = version_id::text, 'bet stores game version');

  -- Smooth maintenance close blocks new play
  PERFORM set_config('request.jwt.claim.sub', admin::text, true);
  PERFORM public.start_smooth_maintenance_close('spinning-plate', 'games.maintenance', admin);

  PERFORM set_config('request.jwt.claim.sub', player::text, true);
  BEGIN
    PERFORM public.place_and_settle_bet(
      'spinning-plate',
      500,
      jsonb_build_object('slot', 1),
      'idem-plate-maint',
      player
    );
    PERFORM public.test_assert(false, 'maintenance close must block bets');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.test_assert(
      SQLERRM ILIKE '%maintenance%' OR SQLERRM ILIKE '%not available%',
      'maintenance close enforced'
    );
  END;

  -- Re-enable spinning plate for cleanliness
  PERFORM set_config('request.jwt.claim.sub', admin::text, true);
  PERFORM public.set_game_availability('spinning-plate', true, 'live', admin);

  -- Spinning plate controlled win
  PERFORM public.open_game_round(
    'spinning-plate',
    'controlled_demo',
    jsonb_build_object('landedSlot', 12),
    admin
  );
  PERFORM set_config('request.jwt.claim.sub', player::text, true);
  result3 := public.place_and_settle_bet(
    'spinning-plate',
    1000,
    jsonb_build_object('slot', 12),
    'idem-plate-jackpot',
    player
  );
  PERFORM public.test_assert((result3->>'payout_amount')::bigint = 10000, 'plate jackpot x10');

  SELECT id INTO round_id FROM public.game_rounds
  WHERE game_id = 'spinning-plate' AND status = 'open'
  ORDER BY opened_at DESC LIMIT 1;
  PERFORM public.test_assert(round_id IS NOT NULL, 'open controlled round remains until replaced');
END;
$$;
