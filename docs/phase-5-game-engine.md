# Phase 5 — Server-authoritative game engine

## Delivered

- Central game definitions (`src/modules/game-engine/definitions.ts`) for FPC, High–Low, Spinning Plate
- Shared validation, settlement helpers, and in-memory rate limit for bet endpoints
- SQL RPCs: `place_and_settle_bet`, `open_game_round`, `ensure_player_round`, `start_smooth_maintenance_close`, `set_game_availability`, `settle_game_outcome`
- Append-only ledger debit/payout inside settlement; idempotent replay by `(player_id, idempotency_key)`
- Random default rounds; Controlled Demo must be opened by admin **before** the round (audited + on receipts)
- Feature flags, availability, smooth maintenance close, frozen `game_version_id` on bets
- Player engine stubs at `/play/[gameId]` + `POST /api/games/bet`
- Admin controls at `/admin/games`
- Unit + SQL tests for rules, duplicates, balance gates, controlled demo, maintenance

## Security notes

- Browser never computes outcomes, balances, or payouts
- `settle_game_outcome` is not granted to clients
- SQL + application rate limits (30 bets / 60s per player+game)

## Validation

```bash
npm run lint && npm run typecheck && npm test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key npm run build
npm run db:validate
```

## Results (2026-09-04)

| Command | Result |
|---------|--------|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass (38 tests) |
| `npm run build` | pass |
| `npm run db:validate` | pass (settlement, idempotency, controlled demo, maintenance) |
