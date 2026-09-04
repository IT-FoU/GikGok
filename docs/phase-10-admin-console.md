# Phase 10 — Admin Console and real-time operations

## Delivered

- Secure `/admin` routing: auth required in middleware; `(console)` layout requires active admin via `get_admin_session_state`; permission-gated pages; `/admin/access-denied`
- Admin PIN + demo 2FA with 5-minute sensitive-action window (`assert_admin_sensitive`)
- Owner admin management: create admins, roles, permission overrides, disable (owner protected)
- Dashboard: pending credits, tickets, open rounds, active players, game status, health, maintenance
- Modules: Players, Credits (existing), Games control, Config versions, Release workflow (owner-only `owner_approved` / `live`)
- Announcements, Tickets, Missions/Badges/Leaderboard, Feature flags, Assets, System settings, QA accounts, Audit search, Reports export
- Migration `20260904190000_admin_console.sql` + SQL tests for permission boundaries, release ownership, audit, QA isolation

## Security notes

- Browser never settles balances; admin actions are RPC + audit_log
- Report exports require `reports.view` + `reports.export`
- QA accounts excluded from player analytics exports
- Concurrent player status changes use advisory locks

## Validation

```bash
npm run lint && npm run typecheck && npm test
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key npm run build
npm run db:validate
```
