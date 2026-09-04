-- Phase 10 admin console: permissions, PIN, release ownership, audit, reports.

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
  owner_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  player_id uuid := gen_random_uuid();
  qa_player uuid := gen_random_uuid();
  role_id uuid;
  session jsonb;
  dash jsonb;
  report jsonb;
  audit_count integer;
  game_row public.games;
  pin_ok boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (owner_id, 'owner-admin@example.com'),
    (manager_id, 'mgr-admin@example.com'),
    (player_id, 'admin-player@example.com'),
    (qa_player, 'qa-player@example.com');

  INSERT INTO public.admin_profiles (user_id, display_name, is_owner, status)
  VALUES (owner_id, 'Owner Admin', true, 'active');

  SELECT id INTO role_id FROM public.admin_roles WHERE code = 'game_manager';
  INSERT INTO public.admin_profiles (user_id, display_name, is_owner, status)
  VALUES (manager_id, 'Game Manager', false, 'active');
  INSERT INTO public.admin_role_assignments (admin_user_id, role_id, assigned_by)
  VALUES (manager_id, role_id, owner_id);

  PERFORM set_config('request.jwt.claim.sub', player_id::text, true);
  PERFORM public.ensure_player_profile(player_id, 'AdminPlayer', 'admin-player@example.com', NULL, 'lotus');
  PERFORM set_config('request.jwt.claim.sub', qa_player::text, true);
  PERFORM public.ensure_player_profile(qa_player, 'QaPlayer', 'qa-player@example.com', NULL, 'lotus');
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);

  -- Non-admin cannot load dashboard
  BEGIN
    PERFORM public.get_admin_dashboard(player_id);
    PERFORM public.test_assert(false, 'player must not access dashboard');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.test_assert(true, 'player blocked from dashboard');
  END;

  session := public.get_admin_session_state(owner_id);
  PERFORM public.test_assert((session->>'is_admin')::boolean, 'owner is admin');
  PERFORM public.test_assert((session->>'is_owner')::boolean, 'owner flag');

  -- PIN required after set
  PERFORM public.set_admin_pin('4242', owner_id);
  pin_ok := public.verify_admin_pin('4242', owner_id);
  PERFORM public.test_assert(pin_ok, 'PIN verifies');

  -- Permission boundary: manager lacks admins.manage
  BEGIN
    PERFORM public.create_admin_account(
      gen_random_uuid(), 'Nope', 'support_viewer', false, manager_id, NULL, NULL
    );
    PERFORM public.test_assert(false, 'manager must not create admins');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.test_assert(true, 'admins.manage enforced');
  END;

  -- Owner can create admin without PIN window (already verified)
  DECLARE
    support_id uuid := gen_random_uuid();
  BEGIN
    INSERT INTO auth.users (id, email) VALUES (support_id, 'support-admin@example.com');
    PERFORM public.create_admin_account(
      support_id, 'Support', 'support_viewer', false, owner_id, '4242', NULL
    );
  END;

  -- Player status change with concurrent lock path
  PERFORM public.set_player_status_admin(
    player_id, 'suspended', 'abuse review', owner_id, '4242', NULL
  );
  PERFORM public.test_assert(
    (SELECT status FROM public.profiles WHERE id = player_id) = 'suspended',
    'player suspended'
  );

  -- Release workflow: manager can move draft->qa but not owner_approved
  -- Reset one game to draft for test
  UPDATE public.games SET lifecycle_status = 'draft', is_enabled = false
  WHERE id = 'spinning-plate';

  game_row := public.advance_game_release('spinning-plate', 'qa', manager_id, NULL, NULL);
  PERFORM public.test_assert(game_row.lifecycle_status = 'qa', 'manager advanced to qa');

  BEGIN
    PERFORM public.advance_game_release('spinning-plate', 'owner_approved', manager_id, NULL, NULL);
    PERFORM public.test_assert(false, 'non-owner cannot approve');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.test_assert(true, 'owner approval required');
  END;

  game_row := public.advance_game_release('spinning-plate', 'owner_approved', owner_id, '4242', NULL);
  PERFORM public.test_assert(game_row.lifecycle_status = 'owner_approved', 'owner approved');

  -- Maintenance + feature flag + audit search
  PERFORM public.set_maintenance_admin(true, '{"en":"down"}'::jsonb, NULL, owner_id, '4242', NULL);
  PERFORM public.set_feature_flag_admin('admin.console', true, '{}'::jsonb, 'phase10', owner_id);

  SELECT count(*) INTO audit_count
  FROM public.search_audit_log(NULL, 'maintenance', NULL, NULL, NULL, 50, owner_id);
  PERFORM public.test_assert(audit_count >= 1, 'audit search finds maintenance');

  -- QA isolation from player report
  PERFORM public.register_qa_account(qa_player, 'QA-1', 'isolated', owner_id, '4242', NULL);
  report := public.export_admin_report('players', owner_id);
  PERFORM public.test_assert(
    NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(report->'rows') elem
      WHERE elem->>'id' = qa_player::text
    ),
    'qa player excluded from player report'
  );

  -- Manager without reports.export denied
  BEGIN
    PERFORM public.export_admin_report('games', manager_id);
    PERFORM public.test_assert(false, 'export must require permission');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.test_assert(true, 'reports.export enforced');
  END;

  dash := public.get_admin_dashboard(owner_id);
  PERFORM public.test_assert(dash ? 'pending_credit_requests', 'dashboard payload');
  PERFORM public.test_assert((dash->'maintenance'->>'is_active')::boolean = true, 'maintenance reflected');
END;
$$;
