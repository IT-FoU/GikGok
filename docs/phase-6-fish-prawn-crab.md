# Phase 6 — Fish–Prawn–Crab

## Delivered

- Versioned FPC config (`src/modules/games/fish-prawn-crab`) aligned with `game_versions` v1
- Lao/English Game Guide section + in-game copy
- Server settlement via existing `place_and_settle_bet` (Single Symbol x2, Special Pair x10)
- Full play UI at `/play/fish-prawn-crab`: symbol picker, stake/quick stakes, lock, reveal, receipt, history
- Lazy-loaded R3F + Rapier 3D dice reveal of **server** results only; 2D fallback + reduced-motion
- Sound cues (`bet_lock`, `dice_roll`, `payout`) with Classic Casino / Arcade / Silent packs
- Session idempotency key for double-submit protection and refresh recovery
- Unit tests for settlement matrix, invalid pairs, insufficient balance, receipt/replay parsing

## Validation

```bash
npm run lint && npm run typecheck && npm test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key npm run build
npm run db:validate
```
