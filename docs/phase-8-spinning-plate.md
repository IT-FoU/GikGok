# Phase 8 — Spinning Plate (staging)

## Delivered

- Versioned 12-slot config (`src/modules/games/spinning-plate`) with GameId `spinning_plate`
- Multipliers: 1–4 x2, 5–7 x3, 8–9 x4, 10 x5, 11 x7, 12 x10
- Lao/English guide + in-game copy (`plate.*`, `guide.plateTitle` / `guide.plateBody`)
- Server settlement via `place_and_settle_bet` — exact-match only
- Play UI at `/play/spinning_plate` (hyphen alias `/play/spinning-plate` redirects)
- 2D SVG wheel with fixed pointer, selection/landed highlight, stakes, lock, receipt, history
- Lazy 3D plate reveal landing on server slot; WebGL / reduced-motion / low-FPS → 2D
- Graphics Auto/2D/3D + quality gates + accessibility textual result
- Unit tests for all 12 slot multipliers, miss cases, receipt/replay, renderer fallback

## Validation

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Results

| Command | Result |
|---------|--------|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass (75 tests) |
| `npm run build` | pass (`/play/spinning_plate`) |
