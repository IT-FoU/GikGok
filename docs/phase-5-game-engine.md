# Phase 5 — Server-authoritative game engine (staging schema)

## Delivered

- Forward migration `supabase/migrations/20260905190000_game_engine_rpcs.sql`
- Feature flags: `games.fish_prawn_crab`, `games.high_low`, `games.spinning_plate`, `games.controlled_demo` (`is_enabled` / `audience`)
- Guide bilingual text merged into `game_versions.config.guide` `{en,lo}` (no `guide_i18n` column)
- Rate limits: `game_rate_limits` + `enforce_game_rate_limit(player_id, bucket, limit, window)`
- RPCs (game **key** text in, UUID resolved internally):
  - `assert_game_playable`
  - `get_active_game_version` (via `games.active_version_id`)
  - `open_game_round` — Controlled Demo requires `games.control`, stores intended result on the round, sets `controlled_by`
  - `ensure_player_round` — open/create **random** round for player play path
  - `set_game_availability`
  - `start_smooth_maintenance_close` — disables game, voids open rounds, stops new bets
  - `settle_game_outcome` — pure SQL FPC / High–Low / Spinning Plate rules
  - `place_and_settle_bet` — idempotent atomic debit → settle → payout → outcome → receipt → round settle
- Domain module `src/modules/game-engine/` with GameId keys `fish_prawn_crab` | `high_low` | `spinning_plate`
- Player play UI `/play/[gameKey]`, admin `/admin/games`, home game cards
- Exhaustive unit tests in `tests/unit/game-engine.test.ts`

## Hardening

- `SECURITY DEFINER` + `search_path = pg_catalog, public`
- `REVOKE` from `PUBLIC` / `anon`; settlement not executable by anon
- Browser never supplies payout; controlled result only when `mode=controlled_demo` + permission + round opened that way
- Ledger writes only via `append_ledger_entry` (`bet_debit` / `game_payout`)

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
REF=$(cat supabase/.temp/project-ref)
test "$REF" = "jlpcfatcpymjnjbxmclo" || exit 1
npx supabase db push --dry-run
npx supabase db push
```
