# Phase 7 — High–Low Dice (staging)

## Delivered

- Versioned High–Low config (`src/modules/games/high-low`) with GameId `high_low`
- Lao/English guide + in-game copy (`highlow.*`, `guide.highlowTitle` / `guide.highlowBody`)
- Server settlement via `place_and_settle_bet` — Low 3–10 / High 11–18 x2; any triple loses
- Play UI at `/play/high_low` (hyphen alias `/play/high-low` redirects)
- Side picker, stakes, lock, dice/total/triple explanation, receipt, history
- Lazy 3D three-dice reveal; 2D fallback; reduced-motion + low graphics quality → 2D
- SessionStorage recovery; staging receipt field mapping

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
| `npm run build` | pass (`/play/high_low`) |
