-- GIKGOK — staging seed (deterministic, idempotent, demo-safe ONLY)
-- =============================================================================
-- Safety / behavior:
--   * Contains NO real-money constructs and NO secrets.
--   * Inserts ONLY safe reference/configuration data (settings, roles, games,
--     game configs, missions, achievements, feature flags).
--   * Does NOT insert into auth.users. Owner/Admin/Player test accounts are
--     created via the Supabase Auth API and then promoted (see README:
--     "Creating staging test users"). Player rows are auto-created by the
--     handle_new_user() trigger on signup.
--   * Fully idempotent: every statement uses ON CONFLICT and may be re-run.
--     Re-running refreshes configuration values in place and never duplicates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- System settings (Owner-editable defaults; requirement §3)
-- -----------------------------------------------------------------------------
insert into public.system_settings (key, value, description) values
  ('rewards.welcome_credit', '50000'::jsonb, 'GIK granted once per verified player'),
  ('rewards.daily_base', '5000'::jsonb, 'Base daily check-in GIK'),
  ('rewards.streak_day3_bonus', '2000'::jsonb, 'Bonus GIK at streak day 3'),
  ('rewards.streak_day7_bonus', '10000'::jsonb, 'Bonus GIK at streak day 7'),
  ('rewards.max_balance_for_daily', '200000'::jsonb, 'Daily reward blocked above this balance'),
  ('credits.second_approval_threshold', '500000'::jsonb, 'Net grant above this needs 2 approvers'),
  ('theme.system_accent', '"green"'::jsonb, 'Owner-selected accent: green|red|blue|yellow'),
  ('locale.default', '"lo"'::jsonb, 'Default UI language')
on conflict (key) do update
  set value = excluded.value, description = excluded.description, updated_at = now();

-- -----------------------------------------------------------------------------
-- Admin role presets (requirement §2). Permissions individually editable by Owner.
-- -----------------------------------------------------------------------------
insert into public.admin_roles (key, name, description, is_system) values
  ('super_admin', 'Super Admin', 'All permissions', true),
  ('game_manager', 'Game Manager', 'Game control and configuration', true),
  ('player_manager', 'Player Manager', 'Player moderation', true),
  ('credit_manager', 'Credit Manager', 'Demo credit review and ledger', true),
  ('support_viewer', 'Support Viewer', 'Support tickets and player lookup', true),
  ('report_viewer', 'Report Viewer', 'Reporting and exports', true)
on conflict (key) do update
  set name = excluded.name, description = excluded.description;

-- Map role -> permissions.
insert into public.role_permissions (role_id, permission)
select r.id, p.permission::public.app_permission
from (values
  ('super_admin', 'players.view'), ('super_admin', 'players.suspend'),
  ('super_admin', 'credits.view'), ('super_admin', 'credits.adjust'),
  ('super_admin', 'games.view'), ('super_admin', 'games.control'),
  ('super_admin', 'games.configure'), ('super_admin', 'announcements.manage'),
  ('super_admin', 'tickets.manage'), ('super_admin', 'reports.view'),
  ('super_admin', 'reports.export'), ('super_admin', 'admins.manage'),
  ('super_admin', 'audit.view'), ('super_admin', 'system.settings'),
  ('game_manager', 'games.view'), ('game_manager', 'games.control'),
  ('game_manager', 'games.configure'),
  ('player_manager', 'players.view'), ('player_manager', 'players.suspend'),
  ('credit_manager', 'credits.view'), ('credit_manager', 'credits.adjust'),
  ('support_viewer', 'tickets.manage'), ('support_viewer', 'players.view'),
  ('report_viewer', 'reports.view'), ('report_viewer', 'reports.export')
) as p(role_key, permission)
join public.admin_roles r on r.key = p.role_key
on conflict (role_id, permission) do nothing;

-- -----------------------------------------------------------------------------
-- Games + version 1 configuration (requirement §4). status=live, enabled.
-- -----------------------------------------------------------------------------
insert into public.games (key, name, description, status, is_enabled, renderer, min_stake, max_stake)
values
  ('fish_prawn_crab', 'Fish–Prawn–Crab',
   'Three-dice symbol game. Single Symbol x2, Special Pair x10.',
   'live', true, 'auto', 500, 1000000),
  ('high_low', 'High–Low Dice',
   'Three dice; Low 3–10, High 11–18. Any triple loses. x2.',
   'live', true, 'auto', 500, 1000000),
  ('spinning_plate', 'Spinning Plate',
   'Twelve-slot wheel with a fixed pointer; exact-match wins.',
   'live', true, 'auto', 500, 1000000)
on conflict (key) do update
  set name = excluded.name, description = excluded.description,
      status = excluded.status, is_enabled = excluded.is_enabled,
      renderer = excluded.renderer, min_stake = excluded.min_stake,
      max_stake = excluded.max_stake, updated_at = now();

-- Fish–Prawn–Crab v1
insert into public.game_versions (game_id, version, config, notes, is_published)
select g.id, 1, jsonb_build_object(
    'symbols', jsonb_build_array('fish','prawn','crab','gourd','rooster','deer'),
    'bets', jsonb_build_object(
      'single_symbol', jsonb_build_object('pick', 1, 'multiplier', 2),
      'special_pair', jsonb_build_object('pick', 2, 'multiplier', 10)
    ),
    'dice_count', 3,
    'quick_stakes', jsonb_build_array(500,1000,5000,10000)
  ), 'Initial ruleset', true
from public.games g where g.key = 'fish_prawn_crab'
on conflict (game_id, version) do update set config = excluded.config, is_published = true;

-- High–Low v1
insert into public.game_versions (game_id, version, config, notes, is_published)
select g.id, 1, jsonb_build_object(
    'dice_count', 3,
    'low_range', jsonb_build_array(3,10),
    'high_range', jsonb_build_array(11,18),
    'triple_loses', true,
    'multiplier', 2,
    'quick_stakes', jsonb_build_array(500,1000,5000,10000)
  ), 'Initial ruleset', true
from public.games g where g.key = 'high_low'
on conflict (game_id, version) do update set config = excluded.config, is_published = true;

-- Spinning Plate v1 (12 slots, requirement §4)
insert into public.game_versions (game_id, version, config, notes, is_published)
select g.id, 1, jsonb_build_object(
    'slots', 12,
    'icons', jsonb_build_array('clover','diamond','heart','spade','bell','cherry',
      'lucky_clover','star','lucky_7','crown','diamond_king','jackpot'),
    'multipliers', jsonb_build_object(
      '1',2,'2',2,'3',2,'4',2,'5',3,'6',3,'7',3,'8',4,'9',4,'10',5,'11',7,'12',10),
    'quick_stakes', jsonb_build_array(500,1000,5000,10000)
  ), 'Initial ruleset', true
from public.games g where g.key = 'spinning_plate'
on conflict (game_id, version) do update set config = excluded.config, is_published = true;

-- Point each game at its v1 as the active version.
update public.games g
set active_version_id = v.id
from public.game_versions v
where v.game_id = g.id and v.version = 1
  and g.key in ('fish_prawn_crab','high_low','spinning_plate');

-- -----------------------------------------------------------------------------
-- Missions (optional; never require playing every game) + achievements
-- -----------------------------------------------------------------------------
insert into public.missions (key, name, description, scope, goal_type, goal_target, reward_amount, is_active)
values
  ('daily_play_5', 'Warm Up', 'Play 5 rounds in any game', 'any_game', 'play_rounds', 5, 1000, true),
  ('daily_win_3', 'Lucky Three', 'Win 3 rounds in any game', 'any_game', 'win_rounds', 3, 2000, true)
on conflict (key) do update
  set name = excluded.name, description = excluded.description,
      goal_type = excluded.goal_type, goal_target = excluded.goal_target,
      reward_amount = excluded.reward_amount, is_active = excluded.is_active,
      updated_at = now();

insert into public.achievements (key, name, description, icon, reward_amount, is_active)
values
  ('first_win', 'First Win', 'Win your first round', 'trophy', 500, true),
  ('high_roller', 'High Roller', 'Place a bet of 10,000 GIK', 'coins', 1000, true),
  ('streak_7', 'Seven-Day Streak', 'Check in 7 days in a row', 'flame', 5000, true)
on conflict (key) do update
  set name = excluded.name, description = excluded.description,
      icon = excluded.icon, reward_amount = excluded.reward_amount,
      is_active = excluded.is_active;

-- -----------------------------------------------------------------------------
-- Feature flags
-- -----------------------------------------------------------------------------
insert into public.feature_flags (key, description, is_enabled) values
  ('friends_invites', 'Friends and invite system', false),
  ('leaderboard', 'Leaderboards', true),
  ('three_d_dice', '3D dice/plate rendering', true),
  ('controlled_demo_mode', 'Admin controlled-demo game mode', true)
on conflict (key) do update
  set description = excluded.description, is_enabled = excluded.is_enabled, updated_at = now();
