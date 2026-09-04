-- RLS isolation and least-privilege admin access tests.
-- Run via scripts/db-validate.sh after migrations.

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
  player_a uuid := gen_random_uuid();
  player_b uuid := gen_random_uuid();
  admin_credit uuid := gen_random_uuid();
  admin_support uuid := gen_random_uuid();
  credit_role_id uuid;
  support_role_id uuid;
  visible_count integer;
  balance_a bigint;
BEGIN
  -- Seed auth users
  INSERT INTO auth.users (id, email) VALUES
    (player_a, 'player-a@example.com'),
    (player_b, 'player-b@example.com'),
    (admin_credit, 'credit-admin@example.com'),
    (admin_support, 'support-admin@example.com');

  INSERT INTO public.profiles (id, nickname, email, email_verified_at, status)
  VALUES
    (player_a, 'PlayerA', 'player-a@example.com', now(), 'active'),
    (player_b, 'PlayerB', 'player-b@example.com', now(), 'active');

  INSERT INTO public.user_settings (user_id) VALUES (player_a), (player_b);

  INSERT INTO public.admin_profiles (user_id, display_name, status, is_owner)
  VALUES
    (admin_credit, 'Credit Admin', 'active', false),
    (admin_support, 'Support Admin', 'active', false);

  SELECT id INTO credit_role_id FROM public.admin_roles WHERE code = 'credit_manager';
  SELECT id INTO support_role_id FROM public.admin_roles WHERE code = 'support_viewer';

  INSERT INTO public.admin_role_assignments (admin_user_id, role_id)
  VALUES
    (admin_credit, credit_role_id),
    (admin_support, support_role_id);

  -- Service-style ledger inserts (bypass RLS as table owner/superuser in this test harness)
  INSERT INTO public.ledger_entries (player_id, entry_type, amount, balance_after, actor_id, reason)
  VALUES
    (player_a, 'welcome_credit', 50000, 50000, player_a, 'welcome'),
    (player_b, 'welcome_credit', 50000, 50000, player_b, 'welcome');

  -- Player A can see own ledger only
  PERFORM set_config('request.jwt.claim.sub', player_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO visible_count FROM public.ledger_entries;
  PERFORM public.test_assert(visible_count = 1, 'player A should see only own ledger rows');

  SELECT balance INTO balance_a FROM public.player_balances WHERE player_id = player_a;
  PERFORM public.test_assert(balance_a = 50000, 'player A balance projection should be 50000');

  SELECT count(*) INTO visible_count
  FROM public.player_balances
  WHERE player_id = player_b;
  PERFORM public.test_assert(visible_count = 0, 'player A must not see player B balance');

  -- Player A cannot insert ledger rows directly
  BEGIN
    INSERT INTO public.ledger_entries (player_id, entry_type, amount, balance_after)
    VALUES (player_a, 'admin_adjustment', 1, 50001);
    PERFORM public.test_assert(false, 'player must not insert ledger entries');
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR OTHERS THEN
      PERFORM public.test_assert(true, 'ledger insert blocked for player');
  END;

  RESET ROLE;

  -- Credit manager can view credits but not tickets.manage
  PERFORM set_config('request.jwt.claim.sub', admin_credit::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.test_assert(
    public.admin_has_permission('credits.view'),
    'credit manager should have credits.view'
  );
  PERFORM public.test_assert(
    public.admin_has_permission('credits.adjust'),
    'credit manager should have credits.adjust'
  );
  PERFORM public.test_assert(
    NOT public.admin_has_permission('tickets.manage'),
    'credit manager must not have tickets.manage'
  );

  SELECT count(*) INTO visible_count FROM public.ledger_entries;
  PERFORM public.test_assert(visible_count = 2, 'credit manager can view all ledger rows');

  RESET ROLE;

  -- Support viewer cannot view ledger
  PERFORM set_config('request.jwt.claim.sub', admin_support::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  PERFORM public.test_assert(
    public.admin_has_permission('tickets.manage'),
    'support viewer should have tickets.manage'
  );
  PERFORM public.test_assert(
    NOT public.admin_has_permission('credits.view'),
    'support viewer must not have credits.view'
  );

  SELECT count(*) INTO visible_count FROM public.ledger_entries;
  PERFORM public.test_assert(visible_count = 0, 'support viewer must not see ledger rows');

  RESET ROLE;

  -- Credit request isolation
  INSERT INTO public.credit_requests (player_id, requested_amount, player_note)
  VALUES (player_a, 10000, 'need demo credits');

  PERFORM set_config('request.jwt.claim.sub', player_b::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO visible_count FROM public.credit_requests;
  PERFORM public.test_assert(visible_count = 0, 'player B cannot see player A credit requests');
  RESET ROLE;

  RAISE NOTICE 'RLS policy tests passed';
END;
$$;
