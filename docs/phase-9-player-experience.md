# Phase 9 — Player experience and engagement

## Delivered

- Home dashboard: balance, demo notice, game cards, announcements, activity, mission/leaderboard/achievement previews, shortcuts
- Filterable bet history (`/history`) with receipt fields including random/controlled-demo
- Announcements read/dismiss + notifications list/mark-read
- Optional daily missions + claim rewards; data-driven achievements
- Leaderboard tabs (highest credit / cumulative winnings / most wins)
- Friends/invites behind feature flag (request, accept, block, remove, invite code)
- Support tickets create/list/thread/reply + satisfaction feedback
- Responsible play: session break reminder, pause 1/3/7 days, demo notice
- Bet flow hooks: `assert_play_allowed`, mission progress, first-bet achievement
- Migration `20260904180000_player_experience.sql` with seeds + RPCs

## Validation

```bash
npm run lint && npm run typecheck && npm test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key npm run build
npm run db:validate
```
