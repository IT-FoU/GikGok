-- Phase 9: player experience seeds + RPCs (missions, announcements, friends, tickets, responsible play).

INSERT INTO public.feature_flags (key, description, enabled, payload)
VALUES
  ('engagement.friends', 'Enable friends and invites', true, '{}'::jsonb),
  ('engagement.missions', 'Enable optional daily missions', true, '{}'::jsonb),
  ('engagement.achievements', 'Enable achievements/badges', true, '{}'::jsonb),
  ('engagement.leaderboard', 'Enable leaderboards', true, '{}'::jsonb)
ON CONFLICT (key) DO UPDATE
SET enabled = EXCLUDED.enabled,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO public.system_settings (key, value, description)
VALUES
  ('responsible.session_break_minutes', '45', 'Remind players to take a break after N minutes'),
  ('responsible.daily_bet_limit', '500000', 'Optional soft daily stake reminder (demo GIK)'),
  ('responsible.pause_days_options', '[1,3,7]', 'Voluntary temporary pause options in days'),
  ('responsible.demo_notice', '"GIK credits are demo credits only and have no cash value."', 'Persistent demo-credit notice')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS play_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS session_started_at timestamptz;

INSERT INTO public.missions (code, title_i18n, description_i18n, game_id, target_count, reward_amount, is_enabled)
VALUES
  (
    'any_bet_3',
    '{"en":"Place 3 bets","lo":"ໂທ່າ 3 ຄັ້ງ"}'::jsonb,
    '{"en":"Any game — optional daily mission","lo":"ເກມໃດກໍໄດ້ — ພາລະกิจທາງເລືອກ"}'::jsonb,
    NULL, 3, 1500, true
  ),
  (
    'fpc_bet_1',
    '{"en":"Play Fish–Prawn–Crab once","lo":"ຫຼິ້ນ ປາ–ກຸ້ງ–ປູ 1 ຄັ້ງ"}'::jsonb,
    '{"en":"Optional single-game mission","lo":"ພາລະกิจເກມດຽວ (ທາງເລືອກ)"}'::jsonb,
    'fish-prawn-crab', 1, 1000, true
  ),
  (
    'highlow_bet_1',
    '{"en":"Play High–Low once","lo":"ຫຼິ້ນ ສູງ–ຕ່ຳ 1 ຄັ້ງ"}'::jsonb,
    '{"en":"Optional single-game mission","lo":"ພາລະกิจເກມດຽວ (ທາງເລືອກ)"}'::jsonb,
    'high-low', 1, 1000, true
  )
ON CONFLICT (code) DO UPDATE
SET title_i18n = EXCLUDED.title_i18n,
    description_i18n = EXCLUDED.description_i18n,
    target_count = EXCLUDED.target_count,
    reward_amount = EXCLUDED.reward_amount,
    is_enabled = EXCLUDED.is_enabled;

INSERT INTO public.achievements (code, title_i18n, description_i18n, badge_asset_key, is_enabled)
VALUES
  (
    'first_bet',
    '{"en":"First Spin","lo":"ໂທ່າຄັ້ງທຳອິດ"}'::jsonb,
    '{"en":"Place your first bet","lo":"ໂທ່າຄັ້ງທຳອິດ"}'::jsonb,
    'badge.first_bet', true
  ),
  (
    'daily_streak_3',
    '{"en":"Three-Day Check-in","lo":"ເຊັກອິນ 3 ມື້"}'::jsonb,
    '{"en":"Reach a 3-day daily reward streak","lo":"ຮອດ streak ລາງວັນປະຈຳວັນ 3 ມື້"}'::jsonb,
    'badge.streak3', true
  ),
  (
    'verified_player',
    '{"en":"Verified","lo":"ຢືນຢັນແລ້ວ"}'::jsonb,
    '{"en":"Verify email or phone","lo":"ຢືນຢັນອີເມວ ຫຼື ໂທລະສັບ"}'::jsonb,
    'badge.verified', true
  )
ON CONFLICT (code) DO UPDATE
SET title_i18n = EXCLUDED.title_i18n,
    description_i18n = EXCLUDED.description_i18n,
    is_enabled = EXCLUDED.is_enabled;

-- Sample published announcement for local/demo environments.
INSERT INTO public.announcements (
  title_i18n, body_i18n, status, target_all_players, published_at
)
SELECT
  '{"en":"Welcome to GIKGOK","lo":"ຍິນດີຕ້ອນຮັບສູ່ GIKGOK"}'::jsonb,
  '{"en":"Demo credits only — no real money. Take breaks and play for fun.","lo":"ຄຣດິດທົດສອບເທົ່ານັ້ນ — ບໍ່ມີເງິນຈິງ. ພັກຜ່ອນ ແລະ ຫຼິ້ນເພື່ອຄວາມສนุก."}'::jsonb,
  'published',
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.announcements WHERE status = 'published' LIMIT 1
);

CREATE OR REPLACE FUNCTION public.mark_announcement_read(
  p_announcement_id uuid,
  p_dismiss boolean DEFAULT false,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  INSERT INTO public.announcement_reads (announcement_id, player_id, dismissed_at)
  VALUES (p_announcement_id, p_player_id, CASE WHEN p_dismiss THEN now() ELSE NULL END)
  ON CONFLICT (announcement_id, player_id) DO UPDATE
  SET read_at = now(),
      dismissed_at = CASE
        WHEN p_dismiss THEN now()
        ELSE public.announcement_reads.dismissed_at
      END;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(
  p_notification_id uuid,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.notifications
  SET read_at = now()
  WHERE id = p_notification_id AND player_id = p_player_id AND read_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.notifications
  SET read_at = now()
  WHERE player_id = p_player_id AND read_at IS NULL;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_mission_progress(
  p_game_id text,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mission_row public.missions;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = 'engagement.missions'), false) THEN
    RETURN;
  END IF;

  FOR mission_row IN
    SELECT * FROM public.missions
    WHERE is_enabled = true
      AND deleted_at IS NULL
      AND (game_id IS NULL OR game_id = p_game_id)
  LOOP
    INSERT INTO public.player_mission_progress (player_id, mission_id, progress_count)
    VALUES (p_player_id, mission_row.id, 1)
    ON CONFLICT (player_id, mission_id) DO UPDATE
    SET progress_count = LEAST(
          public.player_mission_progress.progress_count + 1,
          mission_row.target_count
        ),
        completed_at = CASE
          WHEN public.player_mission_progress.completed_at IS NOT NULL THEN public.player_mission_progress.completed_at
          WHEN public.player_mission_progress.progress_count + 1 >= mission_row.target_count THEN now()
          ELSE NULL
        END,
        updated_at = now()
    WHERE public.player_mission_progress.claimed_at IS NULL;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_mission_reward(
  p_mission_id uuid,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mission_row public.missions;
  progress public.player_mission_progress;
  entry_id uuid;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT * INTO mission_row FROM public.missions WHERE id = p_mission_id AND is_enabled = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'mission not found'; END IF;

  SELECT * INTO progress
  FROM public.player_mission_progress
  WHERE player_id = p_player_id AND mission_id = p_mission_id
  FOR UPDATE;

  IF NOT FOUND OR progress.completed_at IS NULL THEN
    RAISE EXCEPTION 'mission not completed';
  END IF;
  IF progress.claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'mission already claimed';
  END IF;

  INSERT INTO public.ledger_entries (
    player_id, entry_type, amount, balance_after, source_type, source_id, reason, metadata
  ) VALUES (
    p_player_id, 'mission_reward', mission_row.reward_amount, 0, 'mission', mission_row.id,
    'Mission reward', jsonb_build_object('mission_code', mission_row.code)
  ) RETURNING id INTO entry_id;

  UPDATE public.player_mission_progress
  SET claimed_at = now(), updated_at = now()
  WHERE player_id = p_player_id AND mission_id = p_mission_id;

  INSERT INTO public.notifications (player_id, kind, title_key, body_key, payload)
  VALUES (
    p_player_id, 'reward', 'notify.missionReward', 'notify.missionRewardBody',
    jsonb_build_object('mission_id', p_mission_id, 'amount', mission_row.reward_amount)
  );

  RETURN jsonb_build_object(
    'claimed', true,
    'amount', mission_row.reward_amount,
    'ledger_entry_id', entry_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_achievement(
  p_code text,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  achievement_row public.achievements;
  inserted integer;
BEGIN
  IF p_player_id IS NULL THEN RETURN false; END IF;
  IF NOT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = 'engagement.achievements'), false) THEN
    RETURN false;
  END IF;

  SELECT * INTO achievement_row
  FROM public.achievements
  WHERE code = p_code AND is_enabled = true AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.player_achievements (player_id, achievement_id)
  VALUES (p_player_id, achievement_row.id)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;

  IF inserted > 0 THEN
    INSERT INTO public.notifications (player_id, kind, title_key, body_key, payload)
    VALUES (
      p_player_id, 'achievement', 'notify.achievement', 'notify.achievementBody',
      jsonb_build_object('code', p_code)
    );
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_leaderboard_projections()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Highest current credit
  INSERT INTO public.leaderboard_projections (player_id, metric, score, rank, updated_at)
  SELECT pb.player_id, 'highest_credit', pb.balance, NULL, now()
  FROM public.player_balances pb
  JOIN public.profiles p ON p.id = pb.player_id
  WHERE p.status = 'active' AND p.deleted_at IS NULL
  ON CONFLICT (player_id, metric) DO UPDATE
  SET score = EXCLUDED.score, updated_at = now();

  -- Cumulative winnings (sum of game_payout)
  INSERT INTO public.leaderboard_projections (player_id, metric, score, rank, updated_at)
  SELECT le.player_id, 'cumulative_winnings', COALESCE(SUM(le.amount), 0), NULL, now()
  FROM public.ledger_entries le
  JOIN public.profiles p ON p.id = le.player_id
  WHERE le.entry_type = 'game_payout'
    AND p.status = 'active' AND p.deleted_at IS NULL
  GROUP BY le.player_id
  ON CONFLICT (player_id, metric) DO UPDATE
  SET score = EXCLUDED.score, updated_at = now();

  -- Most wins
  INSERT INTO public.leaderboard_projections (player_id, metric, score, rank, updated_at)
  SELECT br.player_id, 'most_wins', COUNT(*)::bigint, NULL, now()
  FROM public.bet_receipts br
  JOIN public.profiles p ON p.id = br.player_id
  WHERE br.is_win = true
    AND p.status = 'active' AND p.deleted_at IS NULL
  GROUP BY br.player_id
  ON CONFLICT (player_id, metric) DO UPDATE
  SET score = EXCLUDED.score, updated_at = now();

  UPDATE public.leaderboard_projections lp
  SET rank = ranked.r
  FROM (
    SELECT player_id, metric,
           RANK() OVER (PARTITION BY metric ORDER BY score DESC) AS r
    FROM public.leaderboard_projections
  ) ranked
  WHERE lp.player_id = ranked.player_id AND lp.metric = ranked.metric;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_friend(
  p_nickname text,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS public.friendships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid;
  row_out public.friendships;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = 'engagement.friends'), false) THEN
    RAISE EXCEPTION 'friends disabled';
  END IF;

  SELECT id INTO target FROM public.profiles
  WHERE lower(nickname) = lower(trim(p_nickname)) AND deleted_at IS NULL;
  IF target IS NULL THEN RAISE EXCEPTION 'player not found'; END IF;
  IF target = p_player_id THEN RAISE EXCEPTION 'cannot friend yourself'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'blocked'
      AND (
        (requester_id = p_player_id AND addressee_id = target)
        OR (requester_id = target AND addressee_id = p_player_id)
      )
  ) THEN
    RAISE EXCEPTION 'friendship blocked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE LEAST(requester_id, addressee_id) = LEAST(p_player_id, target)
      AND GREATEST(requester_id, addressee_id) = GREATEST(p_player_id, target)
      AND status <> 'removed'
  ) THEN
    SELECT * INTO row_out FROM public.friendships
    WHERE LEAST(requester_id, addressee_id) = LEAST(p_player_id, target)
      AND GREATEST(requester_id, addressee_id) = GREATEST(p_player_id, target)
    ORDER BY updated_at DESC
    LIMIT 1;
    RETURN row_out;
  END IF;

  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (p_player_id, target, 'pending')
  RETURNING * INTO row_out;

  RETURN row_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friendship(
  p_friendship_id uuid,
  p_action text,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS public.friendships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_out public.friendships;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_action NOT IN ('accept', 'block', 'remove') THEN
    RAISE EXCEPTION 'invalid friendship action';
  END IF;

  SELECT * INTO row_out FROM public.friendships WHERE id = p_friendship_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'friendship not found'; END IF;
  IF row_out.requester_id <> p_player_id AND row_out.addressee_id <> p_player_id THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF p_action = 'accept' THEN
    IF row_out.addressee_id <> p_player_id THEN RAISE EXCEPTION 'only addressee can accept'; END IF;
    UPDATE public.friendships SET status = 'accepted', updated_at = now()
    WHERE id = p_friendship_id RETURNING * INTO row_out;
  ELSIF p_action = 'block' THEN
    UPDATE public.friendships SET status = 'blocked', updated_at = now()
    WHERE id = p_friendship_id RETURNING * INTO row_out;
  ELSE
    UPDATE public.friendships SET status = 'removed', updated_at = now()
    WHERE id = p_friendship_id RETURNING * INTO row_out;
  END IF;

  RETURN row_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invite_code(
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS public.invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_out public.invites;
  code text;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = 'engagement.friends'), false) THEN
    RAISE EXCEPTION 'friends disabled';
  END IF;

  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.invites (inviter_id, code, expires_at)
  VALUES (p_player_id, code, now() + interval '14 days')
  RETURNING * INTO row_out;
  RETURN row_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_category public.ticket_category,
  p_subject text,
  p_message text,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF char_length(trim(p_message)) < 3 THEN RAISE EXCEPTION 'message required'; END IF;

  INSERT INTO public.support_tickets (player_id, category, subject)
  VALUES (p_player_id, p_category, trim(p_subject))
  RETURNING * INTO ticket;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, body, is_staff)
  VALUES (ticket.id, p_player_id, trim(p_message), false);

  INSERT INTO public.notifications (player_id, kind, title_key, body_key, payload)
  VALUES (
    p_player_id, 'ticket', 'notify.ticketCreated', 'notify.ticketCreatedBody',
    jsonb_build_object('ticket_id', ticket.id)
  );

  RETURN ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.reply_support_ticket(
  p_ticket_id uuid,
  p_message text,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS public.support_ticket_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets;
  msg public.support_ticket_messages;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO ticket FROM public.support_tickets WHERE id = p_ticket_id;
  IF NOT FOUND OR ticket.player_id <> p_player_id THEN RAISE EXCEPTION 'ticket not found'; END IF;
  IF ticket.status IN ('closed', 'resolved') THEN RAISE EXCEPTION 'ticket closed'; END IF;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, body, is_staff)
  VALUES (p_ticket_id, p_player_id, trim(p_message), false)
  RETURNING * INTO msg;

  UPDATE public.support_tickets
  SET status = 'waiting_for_player', updated_at = now()
  WHERE id = p_ticket_id AND status = 'in_progress';

  RETURN msg;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_ticket_satisfaction(
  p_ticket_id uuid,
  p_score integer,
  p_comment text DEFAULT NULL,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS public.support_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.support_tickets;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_score < 1 OR p_score > 5 THEN RAISE EXCEPTION 'score must be 1-5'; END IF;

  UPDATE public.support_tickets
  SET satisfaction_score = p_score,
      satisfaction_comment = p_comment,
      status = CASE WHEN status = 'resolved' THEN 'closed' ELSE status END,
      closed_at = COALESCE(closed_at, now()),
      updated_at = now()
  WHERE id = p_ticket_id AND player_id = p_player_id
  RETURNING * INTO ticket;

  IF NOT FOUND THEN RAISE EXCEPTION 'ticket not found'; END IF;
  RETURN ticket;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_play_pause(
  p_days integer,
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_row public.profiles;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_days IS NULL OR p_days <= 0 THEN
    UPDATE public.profiles
    SET play_paused_until = NULL, updated_at = now()
    WHERE id = p_player_id
    RETURNING * INTO profile_row;
  ELSE
    UPDATE public.profiles
    SET play_paused_until = now() + make_interval(days => p_days), updated_at = now()
    WHERE id = p_player_id
    RETURNING * INTO profile_row;
  END IF;
  RETURN profile_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_play_session(
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  started timestamptz;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.profiles
  SET session_started_at = COALESCE(session_started_at, now()),
      updated_at = now()
  WHERE id = p_player_id
  RETURNING session_started_at INTO started;
  RETURN started;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_play_allowed(
  p_player_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paused_until timestamptz;
BEGIN
  IF p_player_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT play_paused_until INTO paused_until FROM public.profiles WHERE id = p_player_id;
  IF paused_until IS NOT NULL AND paused_until > now() THEN
    RAISE EXCEPTION 'play temporarily paused until %', paused_until;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_responsible_play_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'session_break_minutes', public.setting_bigint('responsible.session_break_minutes', 45),
    'daily_bet_limit', public.setting_bigint('responsible.daily_bet_limit', 500000),
    'pause_days_options', COALESCE(
      (SELECT value FROM public.system_settings WHERE key = 'responsible.pause_days_options'),
      '[1,3,7]'::jsonb
    ),
    'demo_notice', COALESCE(
      (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'responsible.demo_notice'),
      'GIK credits are demo credits only and have no cash value.'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.mark_announcement_read(uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_mission_progress(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_mission_reward(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlock_achievement(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_leaderboard_projections() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_friend(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_friendship(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invite_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_support_ticket(public.ticket_category, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reply_support_ticket(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_ticket_satisfaction(uuid, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_play_pause(integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_play_session(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_play_allowed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_responsible_play_config() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mark_announcement_read(uuid, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_mission_progress(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_mission_reward(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unlock_achievement(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_leaderboard_projections() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_friend(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_friendship(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_invite_code(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(public.ticket_category, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reply_support_ticket(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_ticket_satisfaction(uuid, integer, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_play_pause(integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.touch_play_session(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_play_allowed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_responsible_play_config() TO authenticated, anon, service_role;
