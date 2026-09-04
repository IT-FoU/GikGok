-- Phase 4: daily rewards, credit-request review, ledger helpers, reconciliation.

CREATE OR REPLACE FUNCTION public.setting_bigint(p_key text, p_default bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT NULLIF(trim(both '"' from (value #>> '{}')), '')::bigint
      FROM public.system_settings
      WHERE key = p_key
    ),
    p_default
  );
$$;

CREATE OR REPLACE FUNCTION public.setting_bool(p_key text, p_default boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE lower(trim(both '"' from (value #>> '{}')))
        WHEN 'true' THEN true
        WHEN 'false' THEN false
        ELSE p_default
      END
      FROM public.system_settings
      WHERE key = p_key
    ),
    p_default
  );
$$;

CREATE OR REPLACE FUNCTION public.get_credit_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'welcome_amount', public.setting_bigint('credits.welcome_amount', 50000),
    'daily_base_amount', public.setting_bigint('credits.daily_base_amount', 5000),
    'daily_streak_day3_bonus', public.setting_bigint('credits.daily_streak_day3_bonus', 2000),
    'daily_streak_day7_bonus', public.setting_bigint('credits.daily_streak_day7_bonus', 10000),
    'daily_reward_max_balance', public.setting_bigint('credits.daily_reward_max_balance', 200000),
    'daily_rewards_enabled', public.setting_bool('credits.daily_rewards_enabled', true),
    'second_approver_threshold', public.setting_bigint('credits.second_approver_threshold', 500000)
  );
$$;

CREATE OR REPLACE FUNCTION public.reconcile_player_balance(p_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  projected bigint;
  stored bigint;
BEGIN
  SELECT COALESCE(sum(amount), 0) INTO projected
  FROM public.ledger_entries
  WHERE player_id = p_player_id;

  SELECT balance INTO stored
  FROM public.player_balances
  WHERE player_id = p_player_id;

  IF stored IS NULL THEN
    INSERT INTO public.player_balances (player_id, balance)
    VALUES (p_player_id, projected)
    ON CONFLICT (player_id) DO UPDATE
    SET balance = EXCLUDED.balance, updated_at = now();
    stored := projected;
  ELSIF stored <> projected THEN
    UPDATE public.player_balances
    SET balance = projected, updated_at = now()
    WHERE player_id = p_player_id;
  END IF;

  RETURN jsonb_build_object(
    'player_id', p_player_id,
    'ledger_sum', projected,
    'balance', projected,
    'was_mismatched', stored IS DISTINCT FROM projected
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_reward(
  p_user_id uuid DEFAULT auth.uid(),
  p_today date DEFAULT (timezone('utc', now()))::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles;
  state_row public.daily_reward_state;
  balance_row public.player_balances;
  cfg jsonb := public.get_credit_config();
  next_streak integer;
  base_amount bigint;
  bonus_amount bigint := 0;
  total_amount bigint;
  entry_id uuid;
  claim_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF NOT (cfg->>'daily_rewards_enabled')::boolean THEN
    RAISE EXCEPTION 'daily rewards disabled';
  END IF;

  SELECT * INTO profile_row FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF profile_row.status <> 'active' OR profile_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'account is not active';
  END IF;
  IF profile_row.email_verified_at IS NULL AND profile_row.phone_verified_at IS NULL THEN
    RAISE EXCEPTION 'verify contact before claiming daily reward';
  END IF;

  INSERT INTO public.daily_reward_state (player_id)
  VALUES (p_user_id)
  ON CONFLICT (player_id) DO NOTHING;

  SELECT * INTO state_row
  FROM public.daily_reward_state
  WHERE player_id = p_user_id
  FOR UPDATE;

  IF state_row.last_claim_date = p_today THEN
    RAISE EXCEPTION 'daily reward already claimed today';
  END IF;

  IF state_row.last_claim_date IS NULL THEN
    next_streak := 1;
  ELSIF state_row.last_claim_date = p_today - 1 THEN
    next_streak := LEAST(state_row.streak_day + 1, 7);
    IF state_row.streak_day >= 7 THEN
      next_streak := 1;
    END IF;
  ELSE
    next_streak := 1; -- missed day resets streak only
  END IF;

  SELECT * INTO balance_row FROM public.player_balances WHERE player_id = p_user_id FOR UPDATE;
  IF balance_row.balance > (cfg->>'daily_reward_max_balance')::bigint THEN
    RAISE EXCEPTION 'daily reward unavailable above max balance';
  END IF;

  base_amount := (cfg->>'daily_base_amount')::bigint;
  IF next_streak = 3 THEN
    bonus_amount := (cfg->>'daily_streak_day3_bonus')::bigint;
  ELSIF next_streak = 7 THEN
    bonus_amount := (cfg->>'daily_streak_day7_bonus')::bigint;
  END IF;
  total_amount := base_amount + bonus_amount;

  INSERT INTO public.ledger_entries (
    player_id, entry_type, amount, balance_after, source_type, actor_id, reason, metadata
  )
  VALUES (
    p_user_id,
    'daily_reward',
    total_amount,
    0,
    'daily_reward',
    p_user_id,
    'Daily check-in reward',
    jsonb_build_object(
      'streak_day', next_streak,
      'base_amount', base_amount,
      'bonus_amount', bonus_amount,
      'claim_date', p_today
    )
  )
  RETURNING id INTO entry_id;

  INSERT INTO public.daily_reward_claims (
    player_id, claim_date, streak_day, base_amount, bonus_amount, ledger_entry_id
  )
  VALUES (p_user_id, p_today, next_streak, base_amount, bonus_amount, entry_id)
  RETURNING id INTO claim_id;

  UPDATE public.daily_reward_state
  SET streak_day = next_streak,
      last_claim_date = p_today,
      updated_at = now()
  WHERE player_id = p_user_id;

  INSERT INTO public.notifications (player_id, kind, title_key, body_key, payload)
  VALUES (
    p_user_id,
    'reward',
    'notifications.daily_reward_title',
    'notifications.daily_reward_body',
    jsonb_build_object('amount', total_amount, 'streak_day', next_streak, 'claim_id', claim_id)
  );

  RETURN jsonb_build_object(
    'claimed', true,
    'claim_id', claim_id,
    'ledger_entry_id', entry_id,
    'streak_day', next_streak,
    'base_amount', base_amount,
    'bonus_amount', bonus_amount,
    'total_amount', total_amount,
    'claim_date', p_today
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'daily reward already claimed today';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_credit_request(
  p_amount bigint,
  p_note text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS public.credit_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.credit_requests;
  pending_count integer;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'requested amount must be positive'; END IF;

  IF NOT public.is_player_verified(p_user_id) THEN
    RAISE EXCEPTION 'verify contact before requesting credits';
  END IF;

  SELECT count(*) INTO pending_count
  FROM public.credit_requests
  WHERE player_id = p_user_id AND status = 'pending';

  IF pending_count >= 3 THEN
    RAISE EXCEPTION 'too many pending credit requests';
  END IF;

  INSERT INTO public.credit_requests (player_id, requested_amount, player_note)
  VALUES (p_user_id, p_amount, NULLIF(trim(p_note), ''))
  RETURNING * INTO result;

  INSERT INTO public.notifications (player_id, kind, title_key, body_key, payload)
  VALUES (
    p_user_id,
    'credit_request',
    'notifications.credit_request_submitted_title',
    'notifications.credit_request_submitted_body',
    jsonb_build_object('request_id', result.id, 'amount', p_amount)
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_credit_request(
  p_request_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS public.credit_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.credit_requests;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO result
  FROM public.credit_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'credit request not found'; END IF;
  IF result.player_id <> p_user_id THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF result.status <> 'pending' THEN RAISE EXCEPTION 'only pending requests can be cancelled'; END IF;

  UPDATE public.credit_requests
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_request_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_credit_request_ledger(
  p_request_id uuid,
  p_review_id uuid,
  p_player_id uuid,
  p_reviewer_id uuid,
  p_gross bigint,
  p_fee bigint,
  p_bonus bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  grant_id uuid;
  fee_id uuid;
  bonus_id uuid;
BEGIN
  INSERT INTO public.ledger_entries (
    player_id, entry_type, amount, balance_after, source_type, source_id, actor_id, reason, metadata
  )
  VALUES (
    p_player_id, 'demo_credit_grant', p_gross, 0, 'credit_request', p_request_id, p_reviewer_id, p_reason,
    jsonb_build_object('review_id', p_review_id, 'component', 'gross')
  )
  RETURNING id INTO grant_id;

  IF p_fee > 0 THEN
    INSERT INTO public.ledger_entries (
      player_id, entry_type, amount, balance_after, source_type, source_id, actor_id, reason, metadata
    )
    VALUES (
      p_player_id, 'simulation_fee', -p_fee, 0, 'credit_request', p_request_id, p_reviewer_id, p_reason,
      jsonb_build_object('review_id', p_review_id, 'component', 'simulation_fee')
    )
    RETURNING id INTO fee_id;
  END IF;

  IF p_bonus > 0 THEN
    INSERT INTO public.ledger_entries (
      player_id, entry_type, amount, balance_after, source_type, source_id, actor_id, reason, metadata
    )
    VALUES (
      p_player_id, 'demo_credit_grant', p_bonus, 0, 'credit_request', p_request_id, p_reviewer_id, p_reason,
      jsonb_build_object('review_id', p_review_id, 'component', 'bonus')
    )
    RETURNING id INTO bonus_id;
  END IF;

  RETURN jsonb_build_object(
    'grant_entry_id', grant_id,
    'fee_entry_id', fee_id,
    'bonus_entry_id', bonus_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_credit_request(
  p_request_id uuid,
  p_decision public.credit_request_status,
  p_reason text,
  p_gross_amount bigint DEFAULT NULL,
  p_fee_mode public.fee_mode DEFAULT NULL,
  p_fee_value numeric DEFAULT NULL,
  p_bonus_amount bigint DEFAULT 0,
  p_reviewer_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_row public.credit_requests;
  review_row public.credit_request_reviews;
  fee_amount bigint := 0;
  net_amount bigint := 0;
  threshold bigint := public.setting_bigint('credits.second_approver_threshold', 500000);
  needs_second boolean := false;
  ledger_result jsonb := '{}'::jsonb;
BEGIN
  IF p_reviewer_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.admin_has_permission('credits.adjust', p_reviewer_id) THEN
    RAISE EXCEPTION 'missing credits.adjust permission';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected';
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  SELECT * INTO request_row
  FROM public.credit_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'credit request not found'; END IF;
  IF request_row.status <> 'pending' THEN
    RAISE EXCEPTION 'credit request is not pending';
  END IF;

  IF p_decision = 'approved' THEN
    IF p_gross_amount IS NULL OR p_gross_amount <= 0 THEN
      RAISE EXCEPTION 'gross amount required for approval';
    END IF;
    p_bonus_amount := COALESCE(p_bonus_amount, 0);
    IF p_bonus_amount < 0 THEN RAISE EXCEPTION 'bonus cannot be negative'; END IF;

    IF p_fee_mode = 'percent' THEN
      fee_amount := floor(p_gross_amount * COALESCE(p_fee_value, 0) / 100.0);
    ELSIF p_fee_mode = 'amount' THEN
      fee_amount := floor(COALESCE(p_fee_value, 0));
    ELSE
      fee_amount := 0;
    END IF;

    IF fee_amount < 0 OR fee_amount > p_gross_amount THEN
      RAISE EXCEPTION 'invalid simulation fee';
    END IF;

    net_amount := p_gross_amount - fee_amount + p_bonus_amount;
    needs_second := net_amount >= threshold;
  END IF;

  INSERT INTO public.credit_request_reviews (
    credit_request_id, reviewer_id, decision, gross_amount, fee_mode, fee_value,
    bonus_amount, net_amount, reason, requires_second_approver
  )
  VALUES (
    p_request_id, p_reviewer_id, p_decision, p_gross_amount, p_fee_mode, p_fee_value,
    COALESCE(p_bonus_amount, 0), NULLIF(net_amount, 0), trim(p_reason), needs_second
  )
  RETURNING * INTO review_row;

  IF p_decision = 'rejected' THEN
    UPDATE public.credit_requests
    SET status = 'rejected', updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.notifications (player_id, kind, title_key, body_key, payload)
    VALUES (
      request_row.player_id, 'credit_request',
      'notifications.credit_request_rejected_title',
      'notifications.credit_request_rejected_body',
      jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason))
    );

    RETURN jsonb_build_object(
      'status', 'rejected',
      'review_id', review_row.id,
      'requires_second_approver', false
    );
  END IF;

  IF needs_second THEN
    INSERT INTO public.notifications (player_id, kind, title_key, body_key, payload)
    VALUES (
      request_row.player_id, 'credit_request',
      'notifications.credit_request_pending_second_title',
      'notifications.credit_request_pending_second_body',
      jsonb_build_object('request_id', p_request_id, 'net_amount', net_amount)
    );

    RETURN jsonb_build_object(
      'status', 'pending_second_approval',
      'review_id', review_row.id,
      'requires_second_approver', true,
      'net_amount', net_amount,
      'fee_amount', fee_amount
    );
  END IF;

  ledger_result := public.apply_credit_request_ledger(
    p_request_id, review_row.id, request_row.player_id, p_reviewer_id,
    p_gross_amount, fee_amount, COALESCE(p_bonus_amount, 0), trim(p_reason)
  );

  UPDATE public.credit_requests
  SET status = 'approved', updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.notifications (player_id, kind, title_key, body_key, payload)
  VALUES (
    request_row.player_id, 'credit_request',
    'notifications.credit_request_approved_title',
    'notifications.credit_request_approved_body',
    jsonb_build_object('request_id', p_request_id, 'net_amount', net_amount)
  );

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, reason, after_values, result
  )
  VALUES (
    p_reviewer_id, 'admin', 'credits.request_approved', 'credit_request', p_request_id::text,
    trim(p_reason),
    jsonb_build_object(
      'gross', p_gross_amount, 'fee', fee_amount, 'bonus', p_bonus_amount, 'net', net_amount,
      'ledger', ledger_result
    ),
    'success'
  );

  RETURN jsonb_build_object(
    'status', 'approved',
    'review_id', review_row.id,
    'requires_second_approver', false,
    'net_amount', net_amount,
    'fee_amount', fee_amount,
    'ledger', ledger_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.second_approve_credit_request(
  p_review_id uuid,
  p_approver_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  review_row public.credit_request_reviews;
  request_row public.credit_requests;
  fee_amount bigint := 0;
  ledger_result jsonb;
BEGIN
  IF p_approver_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.admin_has_permission('credits.adjust', p_approver_id) THEN
    RAISE EXCEPTION 'missing credits.adjust permission';
  END IF;

  SELECT * INTO review_row
  FROM public.credit_request_reviews
  WHERE id = p_review_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'review not found'; END IF;
  IF NOT review_row.requires_second_approver THEN
    RAISE EXCEPTION 'second approval not required';
  END IF;
  IF review_row.second_approver_id IS NOT NULL THEN
    RAISE EXCEPTION 'already second-approved';
  END IF;
  IF review_row.reviewer_id = p_approver_id THEN
    RAISE EXCEPTION 'second approver must be a different admin';
  END IF;
  IF review_row.decision <> 'approved' THEN
    RAISE EXCEPTION 'only approved reviews can be second-approved';
  END IF;

  SELECT * INTO request_row
  FROM public.credit_requests
  WHERE id = review_row.credit_request_id
  FOR UPDATE;

  IF request_row.status <> 'pending' THEN
    RAISE EXCEPTION 'credit request is not awaiting second approval';
  END IF;

  IF review_row.fee_mode = 'percent' THEN
    fee_amount := floor(review_row.gross_amount * COALESCE(review_row.fee_value, 0) / 100.0);
  ELSIF review_row.fee_mode = 'amount' THEN
    fee_amount := floor(COALESCE(review_row.fee_value, 0));
  END IF;

  ledger_result := public.apply_credit_request_ledger(
    request_row.id,
    review_row.id,
    request_row.player_id,
    p_approver_id,
    review_row.gross_amount,
    fee_amount,
    COALESCE(review_row.bonus_amount, 0),
    review_row.reason
  );

  UPDATE public.credit_request_reviews
  SET second_approver_id = p_approver_id,
      second_approved_at = now()
  WHERE id = p_review_id;

  UPDATE public.credit_requests
  SET status = 'approved', updated_at = now()
  WHERE id = request_row.id;

  INSERT INTO public.notifications (player_id, kind, title_key, body_key, payload)
  VALUES (
    request_row.player_id, 'credit_request',
    'notifications.credit_request_approved_title',
    'notifications.credit_request_approved_body',
    jsonb_build_object('request_id', request_row.id, 'net_amount', review_row.net_amount)
  );

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, reason,
    approval_chain, after_values, result
  )
  VALUES (
    p_approver_id, 'admin', 'credits.request_second_approved', 'credit_request', request_row.id::text,
    review_row.reason,
    jsonb_build_array(review_row.reviewer_id, p_approver_id),
    jsonb_build_object('review_id', p_review_id, 'ledger', ledger_result),
    'success'
  );

  RETURN jsonb_build_object(
    'status', 'approved',
    'review_id', p_review_id,
    'ledger', ledger_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.setting_bigint(text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.setting_bool(text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_credit_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_player_balance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_daily_reward(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_credit_request(bigint, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_credit_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_credit_request_ledger(uuid, uuid, uuid, uuid, bigint, bigint, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_credit_request(uuid, public.credit_request_status, text, bigint, public.fee_mode, numeric, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.second_approve_credit_request(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_credit_config() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_player_balance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_daily_reward(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_credit_request(bigint, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_credit_request(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_credit_request(uuid, public.credit_request_status, text, bigint, public.fee_mode, numeric, bigint, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.second_approve_credit_request(uuid, uuid) TO authenticated, service_role;
-- apply_credit_request_ledger stays service/admin via definer callers only
