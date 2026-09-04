# Phase 7 — High–Low Dice

## Delivered

- Versioned High–Low config (`src/modules/games/high-low`) aligned with `game_versions` v1
- Lao/English Game Guide section (`/guide#high-low`)
- Server settlement via `place_and_settle_bet` (Low 3–10 / High 11–18 x2; any triple loses)
- Play UI at `/play/high-low`: side picker, stakes, lock, dice/total/triple explanation, receipt, history
- Lazy R3F + Rapier 3D reveal of server dice; 2D fallback; reduced-motion; graphics quality gate
- Session idempotency for double-submit / refresh recovery
- Unit tests for all totals, all triples, payout sides, receipt/replay parsing

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
| `npm test` | pass (55 tests) |
| `npm run build` | pass |
| `npm run db:validate` | pass |
