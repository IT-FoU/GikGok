# Phase 8 — Spinning Plate

## Delivered

- Versioned 12-slot config with icons and multipliers (`src/modules/games/spinning-plate`)
- Lao/English Game Guide section (`/guide#spinning-plate`)
- Server settlement via `place_and_settle_bet` (exact-match only)
- Play UI at `/play/spinning-plate`: SVG wheel + slot grid, stakes, lock, receipt, history
- Lazy R3F 3D plate reveal landing on server slot; 2D fallback; reduced-motion; low-FPS → 2D
- Graphics Auto/2D/3D + quality gates + accessibility textual result
- Unit tests for all 12 slot multipliers, miss cases, receipt/replay, renderer fallback

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
| `npm test` | pass (62 tests) |
| `npm run build` | pass |
| `npm run db:validate` | pass |
