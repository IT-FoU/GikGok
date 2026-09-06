-- Forward-only: classify remaining authenticated-callable SECURITY DEFINER RPCs
-- and revoke EXECUTE on internal helpers that must not be client-facing.
-- Staging project only: jlpcfatcpymjnjbxmclo

begin;

-- Internal helpers: revoke authenticated EXECUTE (DEFINER→DEFINER calls still work for owner).
revoke execute on function public.assert_admin_sensitive() from authenticated;
revoke execute on function public.verify_admin_2fa(text) from authenticated;

comment on function public.assert_admin_sensitive() is
  'INTERNAL ADMIN GATE. PIN window + AAL2/TOTP checks. Called only from other SECURITY DEFINER admin RPCs; not a public client surface.';

comment on function public.verify_admin_2fa(text) is
  'REMOVED stub. Raises on call. Auth MFA AAL2 + verify_admin_pin replace OTP minting. EXECUTE revoked from authenticated.';

comment on function public.admin_prepare_sensitive(text, text) is
  'PUBLIC ADMIN RPC. Rejects p_otp; optional PIN verify then assert_admin_sensitive.';

comment on function public.verify_admin_pin(text) is
  'PUBLIC ADMIN RPC. Session-scoped PIN challenge for high-impact actions. Separate from Auth TOTP/AAL2.';

comment on function public.set_admin_2fa(boolean, text) is
  'PUBLIC ADMIN RPC. Marks local totp_enabled mirror after Auth MFA enroll/verify. Does not store demo OTP secrets as proof.';

comment on function public.get_admin_session_state() is
  'PUBLIC ADMIN RPC. Session snapshot including aal / totp_enrolled / mfa_ok for fail-closed UI.';

comment on function public.is_admin(uuid) is
  'SAFE READ HELPER. Used by RLS and admin gates. EXECUTE kept for authenticated.';

comment on function public.is_owner(uuid) is
  'SAFE READ HELPER. Used by RLS and owner gates. EXECUTE kept for authenticated.';

comment on function public.has_permission(app_permission, uuid) is
  'SAFE READ HELPER. Granular permission check for RLS and admin UI. Owner bypass; overrides beat roles.';

comment on function public.assert_play_allowed() is
  'PUBLIC PLAYER RPC. Eligibility gate before play mutations.';

comment on function public.get_setting(text, jsonb) is
  'AUTHENTICATED. Client-safe setting whitelist for players; full read for system.settings / service_role.';

comment on function public.refresh_leaderboard_entries() is
  'ADMIN/SERVICE. Rebuilds leaderboard snapshots. Not callable by ordinary players.';

comment on function public.place_and_settle_bet(text, text, bigint, jsonb, game_mode, jsonb) is
  'PUBLIC PLAYER RPC. Identity from auth.uid(); eligibility + ledger atomic settlement.';

comment on function public.claim_daily_reward() is
  'PUBLIC PLAYER RPC. Eligibility-gated; once per UTC day.';

comment on function public.mark_contact_verified(text, uuid) is
  'PUBLIC PLAYER RPC. Requires Auth email/phone confirmation evidence matching primary contact.';

comment on function public.grant_welcome_credit(uuid) is
  'PUBLIC PLAYER RPC. Self or admin-only; once per verified active profile.';

comment on function public.complete_player_onboarding(text, contact_type, text, text) is
  'PUBLIC PLAYER RPC. Completes profile/contact bootstrap after Auth sign-up.';

comment on function public.record_storage_orphan(text, text, text, uuid, text) is
  'AUTHENTICATED helper. Records Storage orphans for later admin/service retry after failed deletes.';

commit;
