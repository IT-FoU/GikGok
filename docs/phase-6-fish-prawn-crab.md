# Phase 6 — Fish–Prawn–Crab (staging)

## Delivered

- Versioned FPC config (`src/modules/games/fish-prawn-crab`) with GameId `fish_prawn_crab`
- Lao/English in-game + guide copy (`fpc.*`, `guide.fpcTitle` / `guide.fpcBody`)
- Server settlement via existing `place_and_settle_bet` (Single Symbol x2, Special Pair x10) — no new SQL
- Play UI at `/play/fish_prawn_crab` (hyphen alias `/play/fish-prawn-crab` redirects)
- Symbol picker, stake/quick stakes, selection lock, server-only reveal, receipt, history
- Lazy R3F + Rapier 3D dice reveal of **server** results; 2D + reduced-motion fallback
- Sound cues (`bet_lock`, `dice_roll`, `payout`) + sessionStorage idempotency recovery
- Receipt parsers accept staging RPC shape (`mode`, `result`, `total_return`) and legacy aliases
- Unit tests for settlement matrix, invalid pairs, insufficient balance, receipt/replay

## Validation

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Results

| Command | Result |
|---------|--------|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass (75 tests total after Phases 6–8) |
| `npm run build` | pass (`/play/fish_prawn_crab`) |
