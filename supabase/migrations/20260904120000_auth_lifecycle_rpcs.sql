-- Auth lifecycle RPCs: profile bootstrap, welcome credit (once), verification sync, deletion request.

CREATE OR REPLACE FUNCTION public.get_welcome_credit_amount()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value #>> '{}')::bigint FROM public.system_settings WHERE key = 'credits.welcome_amount'),
    50000
  );
$$;

CREATE OR REPLACE FUNCTION public.ensure_player_profile(
  p_user_id uuid,
  p_nickname text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_avatar_preset_id text DEFAULT 'lotus'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.profiles;
  normalized_email text := NULLIF(lower(trim(p_email)), '');
  normalized_phone text := NULLIF(trim(p_phone), '');
  normalized_nickname text := trim(p_nickname);
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'not allowed to create profile for another user';
  END IF;

  IF normalized_nickname IS NULL OR char_length(normalized_nickname) < 2 OR char_length(normalized_nickname) > 32 THEN
    RAISE EXCEPTION 'invalid nickname';
  END IF;

  IF normalized_email IS NULL AND normalized_phone IS NULL THEN
    RAISE EXCEPTION 'email or phone required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(nickname) = lower(normalized_nickname)
      AND deleted_at IS NULL
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'nickname already taken';
  END IF;

  INSERT INTO public.profiles (
    id,
    nickname,
    email,
    phone,
    avatar_preset_id
  )
  VALUES (
    p_user_id,
    normalized_nickname,
    normalized_email,
    normalized_phone,
    COALESCE(NULLIF(p_avatar_preset_id, ''), 'lotus')
  )
  ON CONFLICT (id) DO UPDATE
  SET
    nickname = EXCLUDED.nickname,
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    avatar_preset_id = COALESCE(EXCLUDED.avatar_preset_id, public.profiles.avatar_preset_id),
    updated_at = now()
  RETURNING * INTO result;

  INSERT INTO public.user_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.daily_reward_state (player_id)
  VALUES (p_user_id)
  ON CONFLICT (player_id) DO NOTHING;

  INSERT INTO public.player_balances (player_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (player_id) DO NOTHING;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_contact_verified(
  p_channel text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.profiles;
  conflict_exists boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_channel NOT IN ('email', 'phone') THEN
    RAISE EXCEPTION 'channel must be email or phone';
  END IF;

  SELECT * INTO result
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF result.status IN ('suspended', 'banned') THEN
    RAISE EXCEPTION 'account is %', result.status;
  END IF;

  IF p_channel = 'email' THEN
    IF result.email IS NULL THEN
      RAISE EXCEPTION 'no email on profile';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id <> p_user_id
        AND p.email_verified_at IS NOT NULL
        AND p.deleted_at IS NULL
        AND lower(p.email) = lower(result.email)
    ) INTO conflict_exists;

    IF conflict_exists THEN
      RAISE EXCEPTION 'verified email already registered to another account';
    END IF;

    UPDATE public.profiles
    SET email_verified_at = COALESCE(email_verified_at, now()),
        updated_at = now()
    WHERE id = p_user_id
    RETURNING * INTO result;
  ELSE
    IF result.phone IS NULL THEN
      RAISE EXCEPTION 'no phone on profile';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id <> p_user_id
        AND p.phone_verified_at IS NOT NULL
        AND p.deleted_at IS NULL
        AND p.phone = result.phone
    ) INTO conflict_exists;

    IF conflict_exists THEN
      RAISE EXCEPTION 'verified phone already registered to another account';
    END IF;

    UPDATE public.profiles
    SET phone_verified_at = COALESCE(phone_verified_at, now()),
        updated_at = now()
    WHERE id = p_user_id
    RETURNING * INTO result;
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_welcome_credit(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles;
  amount bigint;
  entry_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_active_admin() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT * INTO profile_row
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF profile_row.status <> 'active' THEN
    RAISE EXCEPTION 'account is not active';
  END IF;

  IF profile_row.email_verified_at IS NULL AND profile_row.phone_verified_at IS NULL THEN
    RAISE EXCEPTION 'verify email or phone before receiving welcome credit';
  END IF;

  IF profile_row.welcome_credit_granted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'granted', false,
      'already_granted', true,
      'amount', 0
    );
  END IF;

  amount := public.get_welcome_credit_amount();

  INSERT INTO public.ledger_entries (
    player_id,
    entry_type,
    amount,
    balance_after,
    source_type,
    actor_id,
    reason
  )
  VALUES (
    p_user_id,
    'welcome_credit',
    amount,
    0,
    'welcome_credit',
    p_user_id,
    'Verified player welcome credit'
  )
  RETURNING id INTO entry_id;

  UPDATE public.profiles
  SET welcome_credit_granted_at = now(),
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.audit_log (
    actor_id,
    actor_role,
    action_type,
    target_type,
    target_id,
    after_values,
    result
  )
  VALUES (
    p_user_id,
    'player',
    'credits.welcome_grant',
    'profile',
    p_user_id::text,
    jsonb_build_object('amount', amount, 'ledger_entry_id', entry_id),
    'success'
  );

  RETURN jsonb_build_object(
    'granted', true,
    'already_granted', false,
    'amount', amount,
    'ledger_entry_id', entry_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_account_deletion(
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.profiles;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT * INTO result
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF result.deletion_requested_at IS NOT NULL THEN
    RETURN result;
  END IF;

  UPDATE public.profiles
  SET
    deletion_requested_at = now(),
    nickname = left(nickname, 20) || '_del_' || substr(id::text, 1, 8),
    avatar_path = NULL,
    avatar_mime_type = NULL,
    avatar_byte_size = NULL,
    deleted_at = now(),
    status = CASE WHEN status = 'banned' THEN status ELSE 'suspended' END,
    updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO result;

  INSERT INTO public.audit_log (
    actor_id,
    actor_role,
    action_type,
    target_type,
    target_id,
    reason,
    after_values,
    result
  )
  VALUES (
    p_user_id,
    'player',
    'account.deletion_requested',
    'profile',
    p_user_id::text,
    p_reason,
    jsonb_build_object(
      'deletion_requested_at', result.deletion_requested_at,
      'ledger_preserved', true,
      'audit_preserved', true
    ),
    'success'
  );

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_player_access_state(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('authenticated', false, 'can_play', false);
  END IF;

  SELECT * INTO profile_row FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'authenticated', true,
      'has_profile', false,
      'can_play', false,
      'reason', 'profile_required'
    );
  END IF;

  RETURN jsonb_build_object(
    'authenticated', true,
    'has_profile', true,
    'status', profile_row.status,
    'verified', (profile_row.email_verified_at IS NOT NULL OR profile_row.phone_verified_at IS NOT NULL),
    'welcome_credit_granted', profile_row.welcome_credit_granted_at IS NOT NULL,
    'deletion_requested', profile_row.deletion_requested_at IS NOT NULL,
    'can_play',
      profile_row.status = 'active'
      AND profile_row.deleted_at IS NULL
      AND (profile_row.email_verified_at IS NOT NULL OR profile_row.phone_verified_at IS NOT NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_welcome_credit_amount() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_player_profile(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_contact_verified(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_welcome_credit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_account_deletion(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_player_access_state(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_welcome_credit_amount() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_player_profile(uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_contact_verified(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_welcome_credit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_player_access_state(uuid) TO authenticated, service_role;
