-- Phase 4 ledger/rewards/credit-request SQL tests.

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
  admin1 uuid := gen_random_uuid();
  admin2 uuid := gen_random_uuid();
  role_id uuid;
  claim1 jsonb;
  claim2 jsonb;
  request_id uuid;
  review_result jsonb;
  second_result jsonb;
  ledger_count integer;
  balance bigint;
  recon jsonb;
  day0 date := DATE '2026-09-01';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (player, 'ledger-player@example.com'),
    (admin1, 'ledger-admin1@example.com'),
    (admin2, 'ledger-admin2@example.com');

  PERFORM set_config('request.jwt.claim.sub', player::text, true);
  PERFORM public.ensure_player_profile(player, 'LedgerPlayer', 'ledger-player@example.com', NULL, 'lotus');
  PERFORM public.mark_contact_verified('email', player);
  PERFORM public.grant_welcome_credit(player);

  -- Daily reward streak + idempotency
  claim1 := public.claim_daily_reward(player, day0);
  PERFORM public.test_assert((claim1->>'claimed')::boolean, 'day0 claim should succeed');
  PERFORM public.test_assert((claim1->>'streak_day')::int = 1, 'streak starts at 1');
  PERFORM public.test_assert((claim1->>'total_amount')::bigint = 5000, 'base daily amount');

  BEGIN
    PERFORM public.claim_daily_reward(player, day0);
    PERFORM public.test_assert(false, 'duplicate same-day claim must fail');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.test_assert(SQLERRM ILIKE '%already claimed%', 'duplicate claim error');
  END;

  claim2 := public.claim_daily_reward(player, day0 + 1);
  PERFORM public.test_assert((claim2->>'streak_day')::int = 2, 'streak advances');

  -- Missed day resets streak
  claim2 := public.claim_daily_reward(player, day0 + 3);
  PERFORM public.test_assert((claim2->>'streak_day')::int = 1, 'missed day resets streak');

  -- Day 3 bonus path
  PERFORM public.claim_daily_reward(player, day0 + 4);
  claim2 := public.claim_daily_reward(player, day0 + 5);
  PERFORM public.test_assert((claim2->>'streak_day')::int = 3, 'reach day 3');
  PERFORM public.test_assert((claim2->>'bonus_amount')::bigint = 2000, 'day 3 bonus');
  PERFORM public.test_assert((claim2->>'total_amount')::bigint = 7000, 'day 3 total');

  -- Credit request + review with fee + second approval threshold override for test
  UPDATE public.system_settings
  SET value = '10000'
  WHERE key = 'credits.second_approver_threshold';

  INSERT INTO public.admin_profiles (user_id, display_name, status)
  VALUES (admin1, 'Admin One', 'active'), (admin2, 'Admin Two', 'active');
  SELECT id INTO role_id FROM public.admin_roles WHERE code = 'credit_manager';
  INSERT INTO public.admin_role_assignments (admin_user_id, role_id)
  VALUES (admin1, role_id), (admin2, role_id);

  PERFORM set_config('request.jwt.claim.sub', player::text, true);
  INSERT INTO public.credit_requests (player_id, requested_amount, player_note)
  VALUES (player, 20000, 'need demo credits')
  RETURNING id INTO request_id;

  PERFORM set_config('request.jwt.claim.sub', admin1::text, true);
  review_result := public.review_credit_request(
    request_id,
    'approved',
    'approved for QA',
    20000,
    'percent',
    2,
    0,
    admin1
  );
  PERFORM public.test_assert(
    review_result->>'status' = 'pending_second_approval',
    'large net requires second approval'
  );

  -- First admin cannot second-approve own review
  BEGIN
    PERFORM public.second_approve_credit_request((review_result->>'review_id')::uuid, admin1);
    PERFORM public.test_assert(false, 'same admin second approval must fail');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.test_assert(SQLERRM ILIKE '%different admin%', 'different admin required');
  END;

  PERFORM set_config('request.jwt.claim.sub', admin2::text, true);
  second_result := public.second_approve_credit_request(
    (review_result->>'review_id')::uuid,
    admin2
  );
  PERFORM public.test_assert(second_result->>'status' = 'approved', 'second approval succeeds');

  SELECT count(*) INTO ledger_count
  FROM public.ledger_entries
  WHERE player_id = player
    AND source_type = 'credit_request'
    AND source_id = request_id;
  PERFORM public.test_assert(ledger_count = 2, 'grant + simulation fee entries');

  SELECT pb.balance INTO balance FROM public.player_balances pb WHERE pb.player_id = player;
  recon := public.reconcile_player_balance(player);
  PERFORM public.test_assert((recon->>'ledger_sum')::bigint = balance, 'reconcile matches balance');
  PERFORM public.test_assert(NOT (recon->>'was_mismatched')::boolean, 'no mismatch after ops');

  -- Reject path
  PERFORM set_config('request.jwt.claim.sub', player::text, true);
  INSERT INTO public.credit_requests (player_id, requested_amount)
  VALUES (player, 1000)
  RETURNING id INTO request_id;

  PERFORM set_config('request.jwt.claim.sub', admin1::text, true);
  review_result := public.review_credit_request(
    request_id, 'rejected', 'not eligible now', NULL, NULL, NULL, 0, admin1
  );
  PERFORM public.test_assert(review_result->>'status' = 'rejected', 'reject works');

  RAISE NOTICE 'Phase 4 ledger/reward/credit tests passed';
END;
$$;
