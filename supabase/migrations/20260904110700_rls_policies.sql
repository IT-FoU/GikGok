-- Row Level Security for all public tables.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_request_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reward_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_health_events ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY profiles_select_own_or_admin
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.admin_has_permission('players.view')
  );

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_admin_suspend
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.admin_has_permission('players.suspend'))
  WITH CHECK (public.admin_has_permission('players.suspend'));

-- User settings
CREATE POLICY user_settings_own_all
  ON public.user_settings FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_settings_admin_read
  ON public.user_settings FOR SELECT TO authenticated
  USING (public.admin_has_permission('players.view'));

-- Admin catalog (read for active admins; manage for admins.manage)
CREATE POLICY admin_permissions_read
  ON public.admin_permissions FOR SELECT TO authenticated
  USING (public.is_active_admin());

CREATE POLICY admin_roles_read
  ON public.admin_roles FOR SELECT TO authenticated
  USING (public.is_active_admin());

CREATE POLICY admin_roles_manage
  ON public.admin_roles FOR ALL TO authenticated
  USING (public.admin_has_permission('admins.manage'))
  WITH CHECK (public.admin_has_permission('admins.manage'));

CREATE POLICY admin_role_permissions_read
  ON public.admin_role_permissions FOR SELECT TO authenticated
  USING (public.is_active_admin());

CREATE POLICY admin_role_permissions_manage
  ON public.admin_role_permissions FOR ALL TO authenticated
  USING (public.admin_has_permission('admins.manage'))
  WITH CHECK (public.admin_has_permission('admins.manage'));

CREATE POLICY admin_profiles_read
  ON public.admin_profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.admin_has_permission('admins.manage')
  );

CREATE POLICY admin_profiles_manage
  ON public.admin_profiles FOR ALL TO authenticated
  USING (public.admin_has_permission('admins.manage'))
  WITH CHECK (public.admin_has_permission('admins.manage'));

CREATE POLICY admin_role_assignments_read
  ON public.admin_role_assignments FOR SELECT TO authenticated
  USING (
    admin_user_id = auth.uid()
    OR public.admin_has_permission('admins.manage')
  );

CREATE POLICY admin_role_assignments_manage
  ON public.admin_role_assignments FOR ALL TO authenticated
  USING (public.admin_has_permission('admins.manage'))
  WITH CHECK (public.admin_has_permission('admins.manage'));

CREATE POLICY admin_permission_overrides_read
  ON public.admin_permission_overrides FOR SELECT TO authenticated
  USING (
    admin_user_id = auth.uid()
    OR public.admin_has_permission('admins.manage')
  );

CREATE POLICY admin_permission_overrides_manage
  ON public.admin_permission_overrides FOR ALL TO authenticated
  USING (public.admin_has_permission('admins.manage'))
  WITH CHECK (public.admin_has_permission('admins.manage'));

-- Ledger / balances / credits
CREATE POLICY ledger_select_own_or_admin
  ON public.ledger_entries FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR public.admin_has_permission('credits.view')
  );

CREATE POLICY ledger_insert_service_only
  ON public.ledger_entries FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY balances_select_own_or_admin
  ON public.player_balances FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR public.admin_has_permission('credits.view')
  );

CREATE POLICY credit_requests_own_select
  ON public.credit_requests FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR public.admin_has_permission('credits.view')
  );

CREATE POLICY credit_requests_own_insert
  ON public.credit_requests FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid());

CREATE POLICY credit_requests_own_cancel
  ON public.credit_requests FOR UPDATE TO authenticated
  USING (player_id = auth.uid() AND status = 'pending')
  WITH CHECK (player_id = auth.uid());

CREATE POLICY credit_requests_admin_update
  ON public.credit_requests FOR UPDATE TO authenticated
  USING (public.admin_has_permission('credits.adjust'))
  WITH CHECK (public.admin_has_permission('credits.adjust'));

CREATE POLICY credit_request_reviews_select
  ON public.credit_request_reviews FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.credit_requests cr
      WHERE cr.id = credit_request_id
        AND (cr.player_id = auth.uid() OR public.admin_has_permission('credits.view'))
    )
  );

CREATE POLICY credit_request_reviews_insert_admin
  ON public.credit_request_reviews FOR INSERT TO authenticated
  WITH CHECK (public.admin_has_permission('credits.adjust'));

CREATE POLICY daily_reward_state_own
  ON public.daily_reward_state FOR ALL TO authenticated
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

CREATE POLICY daily_reward_state_admin_read
  ON public.daily_reward_state FOR SELECT TO authenticated
  USING (public.admin_has_permission('credits.view'));

CREATE POLICY daily_reward_claims_own_select
  ON public.daily_reward_claims FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR public.admin_has_permission('credits.view')
  );

CREATE POLICY daily_reward_claims_own_insert
  ON public.daily_reward_claims FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid());

-- Games
CREATE POLICY games_public_read
  ON public.games FOR SELECT TO authenticated, anon
  USING (deleted_at IS NULL);

CREATE POLICY games_admin_write
  ON public.games FOR ALL TO authenticated
  USING (
    public.admin_has_permission('games.control')
    OR public.admin_has_permission('games.configure')
  )
  WITH CHECK (
    public.admin_has_permission('games.control')
    OR public.admin_has_permission('games.configure')
  );

CREATE POLICY game_versions_read
  ON public.game_versions FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY game_versions_admin_write
  ON public.game_versions FOR ALL TO authenticated
  USING (public.admin_has_permission('games.configure'))
  WITH CHECK (public.admin_has_permission('games.configure'));

CREATE POLICY feature_flags_read
  ON public.feature_flags FOR SELECT TO authenticated
  USING (true);

CREATE POLICY feature_flags_admin_write
  ON public.feature_flags FOR ALL TO authenticated
  USING (public.admin_has_permission('system.settings'))
  WITH CHECK (public.admin_has_permission('system.settings'));

CREATE POLICY game_rounds_read
  ON public.game_rounds FOR SELECT TO authenticated
  USING (
    true
  );

CREATE POLICY game_rounds_admin_write
  ON public.game_rounds FOR ALL TO authenticated
  USING (public.admin_has_permission('games.control'))
  WITH CHECK (public.admin_has_permission('games.control'));

CREATE POLICY bets_own_select
  ON public.bets FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR public.admin_has_permission('games.view')
  );

CREATE POLICY bets_own_insert
  ON public.bets FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid());

CREATE POLICY bet_outcomes_own_select
  ON public.bet_outcomes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bets b
      WHERE b.id = bet_id
        AND (b.player_id = auth.uid() OR public.admin_has_permission('games.view'))
    )
  );

CREATE POLICY bet_receipts_own_select
  ON public.bet_receipts FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR public.admin_has_permission('games.view')
  );

-- Engagement / support
CREATE POLICY announcements_read_published
  ON public.announcements FOR SELECT TO authenticated, anon
  USING (
    (status = 'published' AND deleted_at IS NULL)
    OR public.admin_has_permission('announcements.manage')
  );

CREATE POLICY announcements_admin_write
  ON public.announcements FOR ALL TO authenticated
  USING (public.admin_has_permission('announcements.manage'))
  WITH CHECK (public.admin_has_permission('announcements.manage'));

CREATE POLICY announcement_reads_own
  ON public.announcement_reads FOR ALL TO authenticated
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

CREATE POLICY notifications_own
  ON public.notifications FOR ALL TO authenticated
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

CREATE POLICY support_tickets_own_or_admin
  ON public.support_tickets FOR SELECT TO authenticated
  USING (
    player_id = auth.uid()
    OR public.admin_has_permission('tickets.manage')
  );

CREATE POLICY support_tickets_own_insert
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid());

CREATE POLICY support_tickets_own_update
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (
    player_id = auth.uid()
    OR public.admin_has_permission('tickets.manage')
  )
  WITH CHECK (
    player_id = auth.uid()
    OR public.admin_has_permission('tickets.manage')
  );

CREATE POLICY support_ticket_messages_select
  ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (t.player_id = auth.uid() OR public.admin_has_permission('tickets.manage'))
    )
  );

CREATE POLICY support_ticket_messages_insert
  ON public.support_ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (t.player_id = auth.uid() OR public.admin_has_permission('tickets.manage'))
    )
  );

CREATE POLICY support_ticket_attachments_select
  ON public.support_ticket_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (t.player_id = auth.uid() OR public.admin_has_permission('tickets.manage'))
    )
  );

CREATE POLICY support_ticket_attachments_insert
  ON public.support_ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (t.player_id = auth.uid() OR public.admin_has_permission('tickets.manage'))
    )
  );

CREATE POLICY missions_read
  ON public.missions FOR SELECT TO authenticated, anon
  USING (deleted_at IS NULL AND is_enabled = true)
  ;

CREATE POLICY missions_admin_write
  ON public.missions FOR ALL TO authenticated
  USING (public.admin_has_permission('system.settings'))
  WITH CHECK (public.admin_has_permission('system.settings'));

CREATE POLICY player_mission_progress_own
  ON public.player_mission_progress FOR ALL TO authenticated
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

CREATE POLICY achievements_read
  ON public.achievements FOR SELECT TO authenticated, anon
  USING (deleted_at IS NULL AND is_enabled = true);

CREATE POLICY achievements_admin_write
  ON public.achievements FOR ALL TO authenticated
  USING (public.admin_has_permission('system.settings'))
  WITH CHECK (public.admin_has_permission('system.settings'));

CREATE POLICY player_achievements_own_select
  ON public.player_achievements FOR SELECT TO authenticated
  USING (player_id = auth.uid());

CREATE POLICY player_achievements_own_insert
  ON public.player_achievements FOR INSERT TO authenticated
  WITH CHECK (player_id = auth.uid());

CREATE POLICY leaderboard_snapshots_read
  ON public.leaderboard_snapshots FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY leaderboard_projections_read
  ON public.leaderboard_projections FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY friendships_participants
  ON public.friendships FOR ALL TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid())
  WITH CHECK (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY invites_own
  ON public.invites FOR ALL TO authenticated
  USING (inviter_id = auth.uid() OR accepted_by = auth.uid())
  WITH CHECK (inviter_id = auth.uid());

CREATE POLICY qa_accounts_admin_only
  ON public.qa_accounts FOR ALL TO authenticated
  USING (public.admin_has_permission('admins.manage'))
  WITH CHECK (public.admin_has_permission('admins.manage'));

-- Audit / system / ops
CREATE POLICY audit_log_admin_read
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.admin_has_permission('audit.view'));

CREATE POLICY audit_log_insert_authenticated
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR public.is_active_admin());

CREATE POLICY system_settings_read
  ON public.system_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY system_settings_admin_write
  ON public.system_settings FOR ALL TO authenticated
  USING (public.admin_has_permission('system.settings'))
  WITH CHECK (public.admin_has_permission('system.settings'));

CREATE POLICY asset_metadata_read
  ON public.asset_metadata FOR SELECT TO authenticated, anon
  USING (deleted_at IS NULL);

CREATE POLICY asset_metadata_admin_write
  ON public.asset_metadata FOR ALL TO authenticated
  USING (public.admin_has_permission('system.settings'))
  WITH CHECK (public.admin_has_permission('system.settings'));

CREATE POLICY maintenance_state_read
  ON public.maintenance_state FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY maintenance_state_admin_write
  ON public.maintenance_state FOR UPDATE TO authenticated
  USING (public.admin_has_permission('system.settings'))
  WITH CHECK (public.admin_has_permission('system.settings'));

CREATE POLICY operational_health_admin_read
  ON public.operational_health_events FOR SELECT TO authenticated
  USING (public.admin_has_permission('system.settings'));

CREATE POLICY operational_health_admin_write
  ON public.operational_health_events FOR ALL TO authenticated
  USING (public.admin_has_permission('system.settings'))
  WITH CHECK (public.admin_has_permission('system.settings'));
