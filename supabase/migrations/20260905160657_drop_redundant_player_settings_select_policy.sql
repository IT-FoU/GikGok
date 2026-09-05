-- settings_select_own is fully redundant with settings_modify_own (FOR ALL),
-- which already permits SELECT for the row owner. Dropping it removes the
-- remaining multiple_permissive_policies finding on player_settings without
-- changing access behavior.
drop policy if exists settings_select_own on public.player_settings;
