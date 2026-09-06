-- Forward-only: COMMENT remaining public SECURITY DEFINER functions missing obj_description.
-- Classifies INTERNAL vs PUBLIC admin/player surfaces for Advisor triage honesty.
-- Staging project only: jlpcfatcpymjnjbxmclo

begin;

comment on function public.admin_has_verified_totp(p_uid uuid) is
  'INTERNAL HELPER. Called from other SECURITY DEFINER RPCs. EXECUTE revoked from authenticated.';

comment on function public.admin_set_player_status(p_player_id uuid, p_status player_status, p_reason text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.advance_game_release(p_game_id text, p_to_status text, p_pin text, p_otp text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.apply_settled_bet_engagement(p_bet_id uuid, p_game_key text, p_is_win boolean, p_stake bigint) is
  'INTERNAL HELPER. Called from other SECURITY DEFINER RPCs. EXECUTE revoked from authenticated.';

comment on function public.assert_admin_auth_rate_limit(p_kind text) is
  'INTERNAL HELPER. Called from other SECURITY DEFINER RPCs. EXECUTE revoked from authenticated.';

comment on function public.assert_game_playable(p_game_key text) is
  'INTERNAL HELPER. Called from other SECURITY DEFINER RPCs. EXECUTE revoked from authenticated.';

comment on function public.assign_admin_role(p_target_admin_id uuid, p_role_code text, p_pin text, p_otp text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.bootstrap_first_owner(p_user_id uuid) is
  'INTERNAL BOOTSTRAP. Service-role/bootstrap only. EXECUTE revoked from authenticated.';

comment on function public.cancel_credit_request(p_request_id uuid) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.create_admin_account(p_user_id uuid, p_display_name text, p_role_code text, p_is_owner boolean, p_pin text, p_otp text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.create_game_version_admin(p_game_id text, p_config jsonb, p_activate boolean) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.create_invite_code() is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.create_support_ticket(p_category ticket_category, p_subject text, p_message text) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.ensure_player_round(p_game_key text) is
  'INTERNAL HELPER. Called from other SECURITY DEFINER RPCs. EXECUTE revoked from authenticated.';

comment on function public.export_admin_report(p_report_type text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.get_admin_dashboard() is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.get_player_access_state(p_user_id uuid) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.get_responsible_play_config() is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.mark_all_notifications_read() is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.mark_announcement_read(p_announcement_id uuid, p_dismiss boolean) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.mark_notification_read(p_notification_id uuid) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.open_game_round(p_game_key text, p_mode game_mode, p_controlled_result jsonb) is
  'INTERNAL HELPER. Called from other SECURITY DEFINER RPCs. EXECUTE revoked from authenticated.';

comment on function public.record_mission_progress(p_game_key text) is
  'INTERNAL HELPER. Called from other SECURITY DEFINER RPCs. EXECUTE revoked from authenticated.';

comment on function public.register_qa_account(p_player_id uuid, p_label text, p_notes text, p_pin text, p_otp text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.reply_support_ticket(p_ticket_id uuid, p_message text) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.request_account_deletion(p_reason text, p_user_id uuid) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.request_friend(p_nickname text) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.respond_friendship(p_friendship_id uuid, p_action text) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.search_players_admin(p_query text, p_limit integer) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.set_admin_permission_override(p_target_admin_id uuid, p_permission text, p_granted boolean, p_reason text, p_pin text, p_otp text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.set_admin_pin(p_pin text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.set_admin_status(p_target_admin_id uuid, p_status text, p_pin text, p_otp text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.set_feature_flag_admin(p_key text, p_enabled boolean, p_payload jsonb) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.set_game_availability(p_game_key text, p_enabled boolean, p_message text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.set_maintenance_admin(p_is_active boolean, p_message_i18n jsonb, p_pin text, p_otp text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.set_play_pause(p_days integer) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.set_player_status_admin(p_player_id uuid, p_status text, p_reason text, p_pin text, p_otp text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.set_system_setting_admin(p_key text, p_value jsonb) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.settle_game_outcome(p_game_key text, p_selection jsonb, p_mode game_mode, p_controlled jsonb, p_stake bigint) is
  'INTERNAL HELPER. Called from other SECURITY DEFINER RPCs. EXECUTE revoked from authenticated.';

comment on function public.start_smooth_maintenance_close(p_game_key text, p_message text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.submit_ticket_satisfaction(p_ticket_id uuid, p_score integer, p_comment text) is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.touch_admin_login() is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.touch_play_session() is
  'PUBLIC PLAYER RPC. Authenticated player/client surface. Auth.uid() ownership enforced.';

comment on function public.unlock_achievement(p_key text) is
  'INTERNAL HELPER. Called from other SECURITY DEFINER RPCs. EXECUTE revoked from authenticated.';

comment on function public.update_ticket_status_admin(p_ticket_id uuid, p_status text, p_reply text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.upsert_achievement_admin(p_code text, p_title_i18n jsonb, p_description_i18n jsonb, p_is_enabled boolean, p_badge_asset_key text) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.upsert_announcement_admin(p_title_i18n jsonb, p_body_i18n jsonb, p_status text, p_id uuid) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.upsert_asset_metadata_admin(p_key text, p_kind text, p_storage_path text, p_rights_cleared boolean) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.upsert_mission_admin(p_code text, p_title_i18n jsonb, p_description_i18n jsonb, p_target_count integer, p_reward_amount bigint, p_is_enabled boolean) is
  'PUBLIC ADMIN RPC. Authenticated admin surface. Permission/PIN/AAL2 gated inside function as applicable.';

comment on function public.write_audit(p_action text, p_target_type text, p_target_id text, p_before jsonb, p_after jsonb, p_reason text, p_approval_chain jsonb, p_result text) is
  'INTERNAL HELPER. Called from other SECURITY DEFINER RPCs. EXECUTE revoked from authenticated.';

commit;
