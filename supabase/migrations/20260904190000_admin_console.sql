-- Phase 10: Admin console RPCs — session, PIN/2FA, admin mgmt, ops modules.

CREATE TABLE IF NOT EXISTS public.admin_sensitive_challenges (
  admin_user_id uuid PRIMARY KEY REFERENCES public.admin_profiles (user_id) ON DELETE CASCADE,
  pin_verified_at timestamptz,
  otp_verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.get_admin_session_state(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_row public.admin_profiles;
  perms text[];
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('is_admin', false);
  END IF;

  SELECT * INTO admin_row
  FROM public.admin_profiles a
  WHERE a.user_id = p_user_id AND a.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('is_admin', false);
  END IF;

  SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[])
  INTO perms
  FROM public.admin_permissions p
  WHERE public.admin_has_permission(p.code, p_user_id);

  RETURN jsonb_build_object(
    'is_admin', admin_row.status = 'active',
    'status', admin_row.status,
    'is_owner', admin_row.is_owner,
    'display_name', admin_row.display_name,
    'pin_set', admin_row.pin_hash IS NOT NULL,
    'require_2fa', admin_row.require_2fa,
    'totp_enabled', admin_row.totp_enabled_at IS NOT NULL,
    'large_adjustment_limit', admin_row.large_adjustment_limit,
    'requires_second_approver_above', admin_row.requires_second_approver_above,
    'permissions', to_jsonb(perms),
    'last_admin_login_at', admin_row.last_admin_login_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_admin_login(p_user_id uuid DEFAULT auth.uid())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR NOT public.is_active_admin(p_user_id) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  UPDATE public.admin_profiles
  SET last_admin_login_at = now()
  WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_pin(
  p_pin text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR NOT public.is_active_admin(p_user_id) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  IF p_pin IS NULL OR char_length(p_pin) < 4 OR char_length(p_pin) > 12 OR p_pin !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'PIN must be 4-12 digits';
  END IF;

  UPDATE public.admin_profiles
  SET pin_hash = crypt(p_pin, gen_salt('bf')),
      pin_updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.audit_log (actor_id, actor_role, action_type, target_type, target_id, reason)
  VALUES (p_user_id, 'admin', 'admin.pin.set', 'admin', p_user_id::text, 'Admin PIN updated');

  RETURN jsonb_build_object('ok', true, 'pin_set', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_pin(
  p_pin text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_row public.admin_profiles;
BEGIN
  IF p_user_id IS NULL OR NOT public.is_active_admin(p_user_id) THEN
    RETURN false;
  END IF;

  SELECT * INTO admin_row FROM public.admin_profiles WHERE user_id = p_user_id;
  IF admin_row.pin_hash IS NULL THEN
    RAISE EXCEPTION 'admin PIN not set';
  END IF;

  IF admin_row.pin_hash = crypt(p_pin, admin_row.pin_hash) THEN
    INSERT INTO public.admin_sensitive_challenges (admin_user_id, pin_verified_at, updated_at)
    VALUES (p_user_id, now(), now())
    ON CONFLICT (admin_user_id) DO UPDATE
      SET pin_verified_at = now(), updated_at = now();
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_2fa(
  p_enabled boolean,
  p_secret text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR NOT public.is_active_admin(p_user_id) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  IF p_enabled THEN
    IF p_secret IS NULL OR char_length(p_secret) < 6 THEN
      RAISE EXCEPTION '2FA secret required (min 6 chars)';
    END IF;
    UPDATE public.admin_profiles
    SET totp_secret_encrypted = crypt(p_secret, gen_salt('bf')),
        totp_enabled_at = now(),
        require_2fa = true
    WHERE user_id = p_user_id;
  ELSE
    UPDATE public.admin_profiles
    SET totp_secret_encrypted = NULL,
        totp_enabled_at = NULL,
        require_2fa = false
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_role, action_type, target_type, target_id, after_values, reason)
  VALUES (
    p_user_id, 'admin', 'admin.2fa.set', 'admin', p_user_id::text,
    jsonb_build_object('enabled', p_enabled), 'Admin 2FA setting changed'
  );

  RETURN jsonb_build_object('ok', true, 'enabled', p_enabled);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_2fa(
  p_code text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_row public.admin_profiles;
BEGIN
  IF p_user_id IS NULL OR NOT public.is_active_admin(p_user_id) THEN
    RETURN false;
  END IF;

  SELECT * INTO admin_row FROM public.admin_profiles WHERE user_id = p_user_id;
  IF admin_row.totp_secret_encrypted IS NULL OR admin_row.totp_enabled_at IS NULL THEN
    RAISE EXCEPTION '2FA not enabled';
  END IF;

  -- Demo TOTP stand-in: shared secret compared via crypt (enrollment secret reused as code).
  IF admin_row.totp_secret_encrypted = crypt(p_code, admin_row.totp_secret_encrypted) THEN
    INSERT INTO public.admin_sensitive_challenges (admin_user_id, otp_verified_at, updated_at)
    VALUES (p_user_id, now(), now())
    ON CONFLICT (admin_user_id) DO UPDATE
      SET otp_verified_at = now(), updated_at = now();
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_admin_sensitive(
  p_permission text,
  p_pin text DEFAULT NULL,
  p_otp text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_row public.admin_profiles;
  challenge public.admin_sensitive_challenges;
  pin_ok boolean := false;
  otp_ok boolean := false;
BEGIN
  IF p_user_id IS NULL OR NOT public.is_active_admin(p_user_id) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  IF p_permission IS NOT NULL AND NOT public.admin_has_permission(p_permission, p_user_id) THEN
    RAISE EXCEPTION 'permission denied: %', p_permission;
  END IF;

  SELECT * INTO admin_row FROM public.admin_profiles WHERE user_id = p_user_id;

  IF admin_row.pin_hash IS NOT NULL THEN
    SELECT * INTO challenge FROM public.admin_sensitive_challenges WHERE admin_user_id = p_user_id;
    IF challenge.pin_verified_at IS NOT NULL AND challenge.pin_verified_at > now() - interval '5 minutes' THEN
      pin_ok := true;
    ELSIF p_pin IS NOT NULL AND admin_row.pin_hash = crypt(p_pin, admin_row.pin_hash) THEN
      pin_ok := true;
      INSERT INTO public.admin_sensitive_challenges (admin_user_id, pin_verified_at, updated_at)
      VALUES (p_user_id, now(), now())
      ON CONFLICT (admin_user_id) DO UPDATE SET pin_verified_at = now(), updated_at = now();
    END IF;
    IF NOT pin_ok THEN
      RAISE EXCEPTION 'admin PIN required';
    END IF;
  END IF;

  IF admin_row.require_2fa AND admin_row.totp_enabled_at IS NOT NULL THEN
    SELECT * INTO challenge FROM public.admin_sensitive_challenges WHERE admin_user_id = p_user_id;
    IF challenge.otp_verified_at IS NOT NULL AND challenge.otp_verified_at > now() - interval '5 minutes' THEN
      otp_ok := true;
    ELSIF p_otp IS NOT NULL AND admin_row.totp_secret_encrypted = crypt(p_otp, admin_row.totp_secret_encrypted) THEN
      otp_ok := true;
      INSERT INTO public.admin_sensitive_challenges (admin_user_id, otp_verified_at, updated_at)
      VALUES (p_user_id, now(), now())
      ON CONFLICT (admin_user_id) DO UPDATE SET otp_verified_at = now(), updated_at = now();
    END IF;
    IF NOT otp_ok THEN
      RAISE EXCEPTION 'admin 2FA required';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_account(
  p_user_id uuid,
  p_display_name text,
  p_role_code text DEFAULT 'support_viewer',
  p_is_owner boolean DEFAULT false,
  p_actor_id uuid DEFAULT auth.uid(),
  p_pin text DEFAULT NULL,
  p_otp text DEFAULT NULL
)
RETURNS public.admin_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  created public.admin_profiles;
BEGIN
  PERFORM public.assert_admin_sensitive('admins.manage', p_pin, p_otp, p_actor_id);

  IF p_is_owner THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_profiles a
      WHERE a.user_id = p_actor_id AND a.is_owner AND a.status = 'active'
    ) THEN
      RAISE EXCEPTION 'only owner can create owner admins';
    END IF;
  END IF;

  INSERT INTO public.admin_profiles (user_id, display_name, is_owner, status)
  VALUES (p_user_id, p_display_name, p_is_owner, 'active')
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        deleted_at = NULL,
        status = 'active',
        is_owner = CASE WHEN EXCLUDED.is_owner THEN true ELSE public.admin_profiles.is_owner END
  RETURNING * INTO created;

  SELECT id INTO v_role_id FROM public.admin_roles WHERE code = p_role_code AND deleted_at IS NULL;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'unknown role: %', p_role_code;
  END IF;

  INSERT INTO public.admin_role_assignments (admin_user_id, role_id, assigned_by)
  VALUES (p_user_id, v_role_id, p_actor_id)
  ON CONFLICT (admin_user_id, role_id) DO NOTHING;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'admin.create', 'admin', p_user_id::text,
    jsonb_build_object('display_name', p_display_name, 'role', p_role_code, 'is_owner', p_is_owner),
    'Created or restored admin account'
  );

  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_status(
  p_target_admin_id uuid,
  p_status public.admin_account_status,
  p_actor_id uuid DEFAULT auth.uid(),
  p_pin text DEFAULT NULL,
  p_otp text DEFAULT NULL
)
RETURNS public.admin_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.admin_profiles;
  before_status text;
BEGIN
  PERFORM public.assert_admin_sensitive('admins.manage', p_pin, p_otp, p_actor_id);

  SELECT * INTO target FROM public.admin_profiles WHERE user_id = p_target_admin_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin not found';
  END IF;
  IF target.is_owner AND p_status = 'disabled' THEN
    RAISE EXCEPTION 'cannot disable owner account';
  END IF;

  before_status := target.status::text;
  UPDATE public.admin_profiles
  SET status = p_status,
      deleted_at = CASE WHEN p_status = 'disabled' THEN now() ELSE NULL END
  WHERE user_id = p_target_admin_id
  RETURNING * INTO target;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id,
    before_values, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'admin.status', 'admin', p_target_admin_id::text,
    jsonb_build_object('status', before_status),
    jsonb_build_object('status', p_status),
    'Admin status changed'
  );

  RETURN target;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_admin_role(
  p_target_admin_id uuid,
  p_role_code text,
  p_actor_id uuid DEFAULT auth.uid(),
  p_pin text DEFAULT NULL,
  p_otp text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  PERFORM public.assert_admin_sensitive('admins.manage', p_pin, p_otp, p_actor_id);
  SELECT id INTO v_role_id FROM public.admin_roles WHERE code = p_role_code AND deleted_at IS NULL;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'unknown role';
  END IF;

  INSERT INTO public.admin_role_assignments (admin_user_id, role_id, assigned_by)
  VALUES (p_target_admin_id, v_role_id, p_actor_id)
  ON CONFLICT (admin_user_id, role_id) DO NOTHING;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'admin.role.assign', 'admin', p_target_admin_id::text,
    jsonb_build_object('role', p_role_code), 'Role assigned'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_permission_override(
  p_target_admin_id uuid,
  p_permission text,
  p_granted boolean,
  p_reason text DEFAULT NULL,
  p_actor_id uuid DEFAULT auth.uid(),
  p_pin text DEFAULT NULL,
  p_otp text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin_sensitive('admins.manage', p_pin, p_otp, p_actor_id);

  INSERT INTO public.admin_permission_overrides (
    admin_user_id, permission_code, granted, assigned_by, reason
  ) VALUES (p_target_admin_id, p_permission, p_granted, p_actor_id, p_reason)
  ON CONFLICT (admin_user_id, permission_code) DO UPDATE
    SET granted = EXCLUDED.granted,
        assigned_by = EXCLUDED.assigned_by,
        reason = EXCLUDED.reason;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'admin.permission.override', 'admin', p_target_admin_id::text,
    jsonb_build_object('permission', p_permission, 'granted', p_granted),
    coalesce(p_reason, 'Permission override')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_player_status_admin(
  p_player_id uuid,
  p_status public.player_status,
  p_reason text,
  p_actor_id uuid DEFAULT auth.uid(),
  p_pin text DEFAULT NULL,
  p_otp text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_row public.profiles;
  after_row public.profiles;
BEGIN
  PERFORM public.assert_admin_sensitive('players.suspend', p_pin, p_otp, p_actor_id);
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  -- Serialize concurrent status changes for the same player.
  PERFORM pg_advisory_xact_lock(hashtext('player_status:' || p_player_id::text));

  SELECT * INTO before_row FROM public.profiles WHERE id = p_player_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not found';
  END IF;

  UPDATE public.profiles
  SET status = p_status
  WHERE id = p_player_id
  RETURNING * INTO after_row;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id,
    before_values, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'player.status', 'player', p_player_id::text,
    jsonb_build_object('status', before_row.status),
    jsonb_build_object('status', after_row.status),
    p_reason
  );

  RETURN after_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_credits bigint;
  open_tickets bigint;
  open_rounds bigint;
  active_players bigint;
  health jsonb;
  games jsonb;
  maintenance jsonb;
BEGIN
  IF p_user_id IS NULL OR NOT public.is_active_admin(p_user_id) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  SELECT count(*) INTO pending_credits
  FROM public.credit_requests WHERE status = 'pending';

  SELECT count(*) INTO open_tickets
  FROM public.support_tickets WHERE status IN ('open', 'in_progress', 'waiting_for_player');

  SELECT count(*) INTO open_rounds
  FROM public.game_rounds WHERE status = 'open';

  SELECT count(*) INTO active_players
  FROM public.profiles
  WHERE deleted_at IS NULL
    AND status = 'active'
    AND last_activity_at > now() - interval '15 minutes';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'lifecycle_status', g.lifecycle_status,
    'is_enabled', g.is_enabled,
    'maintenance_close_started_at', g.maintenance_close_started_at
  ) ORDER BY g.id), '[]'::jsonb)
  INTO games
  FROM public.games g
  WHERE g.deleted_at IS NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id,
    'severity', h.severity,
    'code', h.code,
    'message', h.message,
    'created_at', h.created_at
  ) ORDER BY h.created_at DESC), '[]'::jsonb)
  INTO health
  FROM (
    SELECT * FROM public.operational_health_events
    WHERE resolved_at IS NULL
    ORDER BY created_at DESC
    LIMIT 10
  ) h;

  SELECT to_jsonb(m) INTO maintenance
  FROM public.maintenance_state m WHERE m.id = true;

  RETURN jsonb_build_object(
    'pending_credit_requests', pending_credits,
    'open_tickets', open_tickets,
    'open_rounds', open_rounds,
    'active_players_15m', active_players,
    'games', games,
    'health_events', health,
    'maintenance', maintenance,
    'generated_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_announcement_admin(
  p_title_i18n jsonb,
  p_body_i18n jsonb,
  p_status public.announcement_status DEFAULT 'draft',
  p_id uuid DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS public.announcements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.announcements;
BEGIN
  IF p_actor_id IS NULL OR NOT public.admin_has_permission('announcements.manage', p_actor_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.announcements (
      title_i18n, body_i18n, status, scheduled_at, published_at, created_by
    ) VALUES (
      p_title_i18n, p_body_i18n, p_status, p_scheduled_at,
      CASE WHEN p_status = 'published' THEN now() ELSE NULL END,
      p_actor_id
    )
    RETURNING * INTO row;
  ELSE
    UPDATE public.announcements
    SET title_i18n = p_title_i18n,
        body_i18n = p_body_i18n,
        status = p_status,
        scheduled_at = p_scheduled_at,
        published_at = CASE
          WHEN p_status = 'published' AND published_at IS NULL THEN now()
          ELSE published_at
        END
    WHERE id = p_id
    RETURNING * INTO row;
  END IF;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'announcement.upsert', 'announcement', row.id::text,
    jsonb_build_object('status', row.status), 'Announcement saved'
  );

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ticket_status_admin(
  p_ticket_id uuid,
  p_status public.ticket_status,
  p_reply text DEFAULT NULL,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets;
BEGIN
  IF p_actor_id IS NULL OR NOT public.admin_has_permission('tickets.manage', p_actor_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.support_tickets
  SET status = p_status,
      assigned_admin_id = coalesce(assigned_admin_id, p_actor_id),
      closed_at = CASE
        WHEN p_status IN ('resolved', 'closed') THEN coalesce(closed_at, now())
        ELSE NULL
      END
  WHERE id = p_ticket_id
  RETURNING * INTO ticket;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ticket not found';
  END IF;

  IF p_reply IS NOT NULL AND char_length(trim(p_reply)) > 0 THEN
    INSERT INTO public.support_ticket_messages (ticket_id, author_id, body, is_staff)
    VALUES (p_ticket_id, p_actor_id, p_reply, true);
  END IF;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'ticket.status', 'ticket', p_ticket_id::text,
    jsonb_build_object('status', p_status), 'Ticket updated'
  );

  RETURN ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_mission_admin(
  p_code text,
  p_title_i18n jsonb,
  p_description_i18n jsonb,
  p_target_count integer,
  p_reward_amount bigint,
  p_is_enabled boolean DEFAULT true,
  p_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS public.missions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.missions;
BEGIN
  IF p_actor_id IS NULL OR NOT public.admin_has_permission('system.settings', p_actor_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.missions (
      code, title_i18n, description_i18n, target_count, reward_amount, is_enabled
    ) VALUES (
      p_code, p_title_i18n, p_description_i18n, p_target_count, p_reward_amount, p_is_enabled
    )
    ON CONFLICT (code) DO UPDATE
      SET title_i18n = EXCLUDED.title_i18n,
          description_i18n = EXCLUDED.description_i18n,
          target_count = EXCLUDED.target_count,
          reward_amount = EXCLUDED.reward_amount,
          is_enabled = EXCLUDED.is_enabled
    RETURNING * INTO row;
  ELSE
    UPDATE public.missions
    SET code = p_code,
        title_i18n = p_title_i18n,
        description_i18n = p_description_i18n,
        target_count = p_target_count,
        reward_amount = p_reward_amount,
        is_enabled = p_is_enabled
    WHERE id = p_id
    RETURNING * INTO row;
  END IF;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, reason
  ) VALUES (p_actor_id, 'admin', 'mission.upsert', 'mission', row.id::text, 'Mission saved');

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_achievement_admin(
  p_code text,
  p_title_i18n jsonb,
  p_description_i18n jsonb,
  p_is_enabled boolean DEFAULT true,
  p_badge_asset_key text DEFAULT NULL,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS public.achievements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.achievements;
BEGIN
  IF p_actor_id IS NULL OR NOT public.admin_has_permission('system.settings', p_actor_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  INSERT INTO public.achievements (
    code, title_i18n, description_i18n, is_enabled, badge_asset_key
  ) VALUES (
    p_code, p_title_i18n, p_description_i18n, p_is_enabled, p_badge_asset_key
  )
  ON CONFLICT (code) DO UPDATE
    SET title_i18n = EXCLUDED.title_i18n,
        description_i18n = EXCLUDED.description_i18n,
        is_enabled = EXCLUDED.is_enabled,
        badge_asset_key = EXCLUDED.badge_asset_key
  RETURNING * INTO row;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, reason
  ) VALUES (p_actor_id, 'admin', 'achievement.upsert', 'achievement', row.id::text, 'Achievement saved');

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_feature_flag_admin(
  p_key text,
  p_enabled boolean,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_description text DEFAULT NULL,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS public.feature_flags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.feature_flags;
BEGIN
  IF p_actor_id IS NULL OR NOT public.admin_has_permission('system.settings', p_actor_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  INSERT INTO public.feature_flags (key, description, enabled, payload, updated_by)
  VALUES (p_key, coalesce(p_description, p_key), p_enabled, coalesce(p_payload, '{}'::jsonb), p_actor_id)
  ON CONFLICT (key) DO UPDATE
    SET enabled = EXCLUDED.enabled,
        payload = EXCLUDED.payload,
        description = coalesce(EXCLUDED.description, public.feature_flags.description),
        updated_by = p_actor_id
  RETURNING * INTO row;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'feature_flag.set', 'feature_flag', p_key,
    jsonb_build_object('enabled', p_enabled, 'payload', p_payload), 'Feature flag updated'
  );

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_system_setting_admin(
  p_key text,
  p_value jsonb,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS public.system_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_val jsonb;
  row public.system_settings;
BEGIN
  IF p_actor_id IS NULL OR NOT public.admin_has_permission('system.settings', p_actor_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT value INTO before_val FROM public.system_settings WHERE key = p_key;

  INSERT INTO public.system_settings (key, value, updated_by)
  VALUES (p_key, p_value, p_actor_id)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = p_actor_id
  RETURNING * INTO row;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id,
    before_values, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'system_setting.set', 'system_setting', p_key,
    jsonb_build_object('value', before_val),
    jsonb_build_object('value', p_value),
    'System setting updated'
  );

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_maintenance_admin(
  p_is_active boolean,
  p_message_i18n jsonb DEFAULT '{}'::jsonb,
  p_estimated_end_at timestamptz DEFAULT NULL,
  p_actor_id uuid DEFAULT auth.uid(),
  p_pin text DEFAULT NULL,
  p_otp text DEFAULT NULL
)
RETURNS public.maintenance_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.maintenance_state;
BEGIN
  PERFORM public.assert_admin_sensitive('system.settings', p_pin, p_otp, p_actor_id);

  UPDATE public.maintenance_state
  SET is_active = p_is_active,
      message_i18n = coalesce(p_message_i18n, message_i18n),
      started_at = CASE WHEN p_is_active THEN coalesce(started_at, now()) ELSE NULL END,
      estimated_end_at = p_estimated_end_at,
      updated_by = p_actor_id
  WHERE id = true
  RETURNING * INTO row;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'maintenance.set', 'system', 'maintenance',
    jsonb_build_object('is_active', p_is_active), 'Maintenance state changed'
  );

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_game_version_admin(
  p_game_id text,
  p_config jsonb,
  p_guide_i18n jsonb DEFAULT '{}'::jsonb,
  p_activate boolean DEFAULT false,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS public.game_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version integer;
  row public.game_versions;
BEGIN
  IF p_actor_id IS NULL OR NOT public.admin_has_permission('games.configure', p_actor_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT coalesce(max(version), 0) + 1 INTO next_version
  FROM public.game_versions WHERE game_id = p_game_id;

  IF p_activate THEN
    UPDATE public.game_versions SET is_active = false WHERE game_id = p_game_id AND is_active;
  END IF;

  INSERT INTO public.game_versions (
    game_id, version, config, guide_i18n, created_by, is_active
  ) VALUES (
    p_game_id, next_version, p_config, p_guide_i18n, p_actor_id, p_activate
  )
  RETURNING * INTO row;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'game_version.create', 'game', p_game_id,
    jsonb_build_object('version', next_version, 'is_active', p_activate),
    'Game version created (future rounds only when activated)'
  );

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_game_release(
  p_game_id text,
  p_to_status public.game_lifecycle_status,
  p_actor_id uuid DEFAULT auth.uid(),
  p_pin text DEFAULT NULL,
  p_otp text DEFAULT NULL,
  p_scheduled_launch_at timestamptz DEFAULT NULL
)
RETURNS public.games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  game_row public.games;
  actor public.admin_profiles;
  allowed boolean := false;
BEGIN
  PERFORM public.assert_admin_sensitive('games.control', p_pin, p_otp, p_actor_id);
  SELECT * INTO actor FROM public.admin_profiles WHERE user_id = p_actor_id;
  SELECT * INTO game_row FROM public.games WHERE id = p_game_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'game not found';
  END IF;

  -- Valid transitions
  allowed := (
    (game_row.lifecycle_status = 'draft' AND p_to_status = 'qa')
    OR (game_row.lifecycle_status = 'qa' AND p_to_status IN ('owner_approved', 'draft'))
    OR (game_row.lifecycle_status = 'owner_approved' AND p_to_status IN ('scheduled', 'live', 'qa'))
    OR (game_row.lifecycle_status = 'scheduled' AND p_to_status IN ('live', 'disabled', 'owner_approved'))
    OR (game_row.lifecycle_status = 'live' AND p_to_status = 'disabled')
    OR (game_row.lifecycle_status = 'disabled' AND p_to_status IN ('draft', 'qa'))
  );

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid lifecycle transition % -> %', game_row.lifecycle_status, p_to_status;
  END IF;

  -- Owner-only final approval steps
  IF p_to_status IN ('owner_approved', 'live') AND NOT actor.is_owner THEN
    RAISE EXCEPTION 'owner approval required for %', p_to_status;
  END IF;

  UPDATE public.games
  SET lifecycle_status = p_to_status,
      scheduled_launch_at = CASE
        WHEN p_to_status = 'scheduled' THEN coalesce(p_scheduled_launch_at, scheduled_launch_at, now())
        ELSE scheduled_launch_at
      END,
      is_enabled = CASE WHEN p_to_status = 'live' THEN true
                        WHEN p_to_status = 'disabled' THEN false
                        ELSE is_enabled END
  WHERE id = p_game_id
  RETURNING * INTO game_row;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id,
    after_values, approval_chain, reason
  ) VALUES (
    p_actor_id, 'admin', 'game.release.advance', 'game', p_game_id,
    jsonb_build_object('lifecycle_status', p_to_status, 'is_enabled', game_row.is_enabled),
    CASE WHEN actor.is_owner THEN jsonb_build_array(jsonb_build_object('owner', p_actor_id, 'at', now()))
         ELSE '[]'::jsonb END,
    'Game release workflow advanced'
  );

  RETURN game_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_asset_metadata_admin(
  p_key text,
  p_kind public.asset_kind,
  p_storage_path text DEFAULT NULL,
  p_mime_type text DEFAULT NULL,
  p_byte_size integer DEFAULT NULL,
  p_rights_cleared boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS public.asset_metadata
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.asset_metadata;
BEGIN
  IF p_actor_id IS NULL OR NOT public.admin_has_permission('system.settings', p_actor_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  INSERT INTO public.asset_metadata (
    key, kind, storage_path, mime_type, byte_size, rights_cleared, metadata
  ) VALUES (
    p_key, p_kind, p_storage_path, p_mime_type, p_byte_size, p_rights_cleared, p_metadata
  )
  ON CONFLICT (key) DO UPDATE
    SET kind = EXCLUDED.kind,
        storage_path = EXCLUDED.storage_path,
        mime_type = EXCLUDED.mime_type,
        byte_size = EXCLUDED.byte_size,
        rights_cleared = EXCLUDED.rights_cleared,
        metadata = EXCLUDED.metadata,
        deleted_at = NULL
  RETURNING * INTO row;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, reason
  ) VALUES (p_actor_id, 'admin', 'asset.upsert', 'asset', p_key, 'Asset metadata saved');

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_qa_account(
  p_player_id uuid,
  p_label text,
  p_notes text DEFAULT NULL,
  p_actor_id uuid DEFAULT auth.uid(),
  p_pin text DEFAULT NULL,
  p_otp text DEFAULT NULL
)
RETURNS public.qa_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.qa_accounts;
BEGIN
  PERFORM public.assert_admin_sensitive('admins.manage', p_pin, p_otp, p_actor_id);

  INSERT INTO public.qa_accounts (player_id, label, notes, created_by, isolated_from_analytics)
  VALUES (p_player_id, p_label, p_notes, p_actor_id, true)
  ON CONFLICT (player_id) DO UPDATE
    SET label = EXCLUDED.label,
        notes = EXCLUDED.notes
  RETURNING * INTO row;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, after_values, reason
  ) VALUES (
    p_actor_id, 'admin', 'qa_account.register', 'player', p_player_id::text,
    jsonb_build_object('label', p_label, 'isolated', true),
    'QA/demo account registered (isolated from analytics)'
  );

  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_audit_log(
  p_actor_id_filter uuid DEFAULT NULL,
  p_action_type text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS SETOF public.audit_log
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR NOT public.admin_has_permission('audit.view', p_user_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.audit_log a
  WHERE (p_actor_id_filter IS NULL OR a.actor_id = p_actor_id_filter)
    AND (p_action_type IS NULL OR a.action_type ILIKE '%' || p_action_type || '%')
    AND (p_target_type IS NULL OR a.target_type = p_target_type)
    AND (p_from IS NULL OR a.created_at >= p_from)
    AND (p_to IS NULL OR a.created_at <= p_to)
  ORDER BY a.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 500));
END;
$$;

CREATE OR REPLACE FUNCTION public.export_admin_report(
  p_report_type text,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT public.admin_has_permission('reports.export', p_actor_id) THEN
    RAISE EXCEPTION 'permission denied: reports.export';
  END IF;
  IF NOT public.admin_has_permission('reports.view', p_actor_id) THEN
    RAISE EXCEPTION 'permission denied: reports.view';
  END IF;

  IF p_report_type = 'players' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'nickname', p.nickname,
      'status', p.status,
      'created_at', p.created_at,
      'is_qa', EXISTS (SELECT 1 FROM public.qa_accounts q WHERE q.player_id = p.id)
    ) ORDER BY p.created_at DESC), '[]'::jsonb)
    INTO payload
    FROM public.profiles p
    WHERE p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.qa_accounts q
        WHERE q.player_id = p.id AND q.isolated_from_analytics
      )
    LIMIT 500;
  ELSIF p_report_type = 'credits' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'player_id', c.player_id,
      'status', c.status,
      'requested_amount', c.requested_amount,
      'created_at', c.created_at
    ) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO payload
    FROM public.credit_requests c
    LIMIT 500;
  ELSIF p_report_type = 'games' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id,
      'lifecycle_status', g.lifecycle_status,
      'is_enabled', g.is_enabled
    )), '[]'::jsonb)
    INTO payload
    FROM public.games g WHERE g.deleted_at IS NULL;
  ELSIF p_report_type = 'support' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'status', t.status,
      'category', t.category,
      'created_at', t.created_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO payload
    FROM public.support_tickets t
    LIMIT 500;
  ELSIF p_report_type = 'activity' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'action_type', a.action_type,
      'actor_id', a.actor_id,
      'target_type', a.target_type,
      'created_at', a.created_at
    ) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO payload
    FROM (
      SELECT * FROM public.audit_log ORDER BY created_at DESC LIMIT 200
    ) a;
  ELSIF p_report_type = 'system' THEN
    payload := jsonb_build_object(
      'maintenance', (SELECT to_jsonb(m) FROM public.maintenance_state m WHERE id = true),
      'flags', (SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) FROM public.feature_flags f),
      'health_open', (
        SELECT count(*) FROM public.operational_health_events WHERE resolved_at IS NULL
      )
    );
  ELSE
    RAISE EXCEPTION 'unknown report type: %', p_report_type;
  END IF;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action_type, target_type, target_id, reason
  ) VALUES (
    p_actor_id, 'admin', 'report.export', 'report', p_report_type,
    'Permission-checked report export'
  );

  RETURN jsonb_build_object(
    'report_type', p_report_type,
    'exported_at', now(),
    'rows', payload
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.search_players_admin(
  p_query text DEFAULT NULL,
  p_status public.player_status DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  id uuid,
  nickname text,
  email text,
  phone text,
  status public.player_status,
  last_activity_at timestamptz,
  balance bigint,
  is_qa boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR NOT public.admin_has_permission('players.view', p_user_id) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.nickname,
    p.email,
    p.phone,
    p.status,
    p.last_activity_at,
    coalesce(b.balance, 0),
    EXISTS (SELECT 1 FROM public.qa_accounts q WHERE q.player_id = p.id)
  FROM public.profiles p
  LEFT JOIN public.player_balances b ON b.player_id = p.id
  WHERE p.deleted_at IS NULL
    AND (p_status IS NULL OR p.status = p_status)
    AND (
      p_query IS NULL OR p_query = ''
      OR p.nickname ILIKE '%' || p_query || '%'
      OR coalesce(p.email, '') ILIKE '%' || p_query || '%'
      OR coalesce(p.phone, '') ILIKE '%' || p_query || '%'
      OR p.id::text ILIKE '%' || p_query || '%'
    )
  ORDER BY p.last_activity_at DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.get_admin_session_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_admin_login(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_admin_pin(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_admin_pin(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_admin_2fa(boolean, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_admin_2fa(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_admin_sensitive(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_admin_account(uuid, text, text, boolean, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_admin_status(uuid, public.admin_account_status, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_admin_role(uuid, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_admin_permission_override(uuid, text, boolean, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_player_status_admin(uuid, public.player_status, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_dashboard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_announcement_admin(jsonb, jsonb, public.announcement_status, uuid, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_ticket_status_admin(uuid, public.ticket_status, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_mission_admin(text, jsonb, jsonb, integer, bigint, boolean, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_achievement_admin(text, jsonb, jsonb, boolean, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_feature_flag_admin(text, boolean, jsonb, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_system_setting_admin(text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_maintenance_admin(boolean, jsonb, timestamptz, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_game_version_admin(text, jsonb, jsonb, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_game_release(text, public.game_lifecycle_status, uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_asset_metadata_admin(text, public.asset_kind, text, text, integer, boolean, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_qa_account(uuid, text, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_audit_log(uuid, text, text, timestamptz, timestamptz, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.export_admin_report(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_players_admin(text, public.player_status, integer, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_admin_session_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_admin_login(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_admin_pin(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_admin_pin(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_admin_2fa(boolean, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_admin_2fa(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_admin_sensitive(text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_admin_account(uuid, text, text, boolean, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_admin_status(uuid, public.admin_account_status, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_admin_role(uuid, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_admin_permission_override(uuid, text, boolean, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_player_status_admin(uuid, public.player_status, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_announcement_admin(jsonb, jsonb, public.announcement_status, uuid, timestamptz, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_ticket_status_admin(uuid, public.ticket_status, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_mission_admin(text, jsonb, jsonb, integer, bigint, boolean, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_achievement_admin(text, jsonb, jsonb, boolean, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_feature_flag_admin(text, boolean, jsonb, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_system_setting_admin(text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_maintenance_admin(boolean, jsonb, timestamptz, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_game_version_admin(text, jsonb, jsonb, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_game_release(text, public.game_lifecycle_status, uuid, text, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_asset_metadata_admin(text, public.asset_kind, text, text, integer, boolean, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_qa_account(uuid, text, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_audit_log(uuid, text, text, timestamptz, timestamptz, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_admin_report(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_players_admin(text, public.player_status, integer, uuid) TO authenticated, service_role;
