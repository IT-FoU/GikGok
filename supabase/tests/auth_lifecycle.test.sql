-- Auth lifecycle RPC tests: welcome credit once, verification conflicts, deletion preserves ledger.

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
  other uuid := gen_random_uuid();
  grant1 jsonb;
  grant2 jsonb;
  ledger_count integer;
  audit_count integer;
  balance bigint;
  access jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (player, 'welcome@example.com'),
    (other, 'other@example.com');

  PERFORM set_config('request.jwt.claim.sub', player::text, true);

  PERFORM public.ensure_player_profile(
    player,
    'WelcomePlayer',
    'welcome@example.com',
    NULL,
    'dragon'
  );

  -- Cannot grant before verification
  BEGIN
    PERFORM public.grant_welcome_credit(player);
    PERFORM public.test_assert(false, 'welcome credit must require verification');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM public.test_assert(
        SQLERRM ILIKE '%verify%',
        'expected verification error'
      );
  END;

  PERFORM public.mark_contact_verified('email', player);

  grant1 := public.grant_welcome_credit(player);
  PERFORM public.test_assert((grant1->>'granted')::boolean, 'first welcome grant should succeed');
  PERFORM public.test_assert((grant1->>'amount')::bigint = 50000, 'welcome amount should be 50000');

  grant2 := public.grant_welcome_credit(player);
  PERFORM public.test_assert(NOT (grant2->>'granted')::boolean, 'second welcome grant must no-op');
  PERFORM public.test_assert((grant2->>'already_granted')::boolean, 'already_granted flag expected');

  SELECT count(*) INTO ledger_count
  FROM public.ledger_entries
  WHERE player_id = player AND entry_type = 'welcome_credit';
  PERFORM public.test_assert(ledger_count = 1, 'welcome credit ledger row exactly once');

  SELECT balance INTO balance FROM public.player_balances WHERE player_id = player;
  PERFORM public.test_assert(balance = 50000, 'balance projection after welcome credit');

  -- Verified email conflict
  PERFORM set_config('request.jwt.claim.sub', other::text, true);
  PERFORM public.ensure_player_profile(
    other,
    'OtherPlayer',
    'welcome@example.com',
    NULL,
    'lotus'
  );
  BEGIN
    PERFORM public.mark_contact_verified('email', other);
    PERFORM public.test_assert(false, 'duplicate verified email must fail');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM public.test_assert(
        SQLERRM ILIKE '%already registered%',
        'expected verified email conflict'
      );
  END;

  -- Deletion preserves ledger + writes audit
  PERFORM set_config('request.jwt.claim.sub', player::text, true);
  PERFORM public.request_account_deletion('phase2 test', player);

  SELECT count(*) INTO ledger_count
  FROM public.ledger_entries
  WHERE player_id = player;
  PERFORM public.test_assert(ledger_count >= 1, 'ledger must survive deletion request');

  SELECT count(*) INTO audit_count
  FROM public.audit_log
  WHERE target_id = player::text
    AND action_type = 'account.deletion_requested';
  PERFORM public.test_assert(audit_count = 1, 'deletion request must write audit');

  access := public.get_player_access_state(player);
  PERFORM public.test_assert(NOT (access->>'can_play')::boolean, 'deleted/suspended account cannot play');

  RAISE NOTICE 'Auth lifecycle RPC tests passed';
END;
$$;
