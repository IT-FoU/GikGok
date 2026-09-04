# Phase 3 — Design system, shell, localization

## Delivered

- Brand tokens in `src/styles/tokens.css` (green identity, spacing, radius, motion, status/chart)
- Light/Dark color modes via `data-color-mode` (player preference)
- Owner-controlled accent themes via `data-accent` (`green`, `red_white`, `blue_white`, `yellow_gray`) — player-locked
- Player shell: phone bottom nav, tablet compact nav, desktop sidebar
- Admin shell: desktop-first sidebar + compact mobile header nav
- Lao/English catalogs with Thai reserved in `FUTURE_LOCALES`
- Shared accessible UI: button, input, dialog, card, table, filters, toast, loading/error/empty, pagination
- Reduced-motion CSS, focus-visible rings, 44px touch targets
- Sound manager packs: Classic Casino, Arcade, Silent (+ mute/volume)

## Validation

```bash
npm run lint
npm run typecheck
npm test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key \
npm run build
```
