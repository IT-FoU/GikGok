# Security audit (Phase 11)

## Scope

RLS, API authorization, input schemas, rate limits, secret exposure, headers, uploads.

## Findings / controls

| Area | Control | Status |
|------|---------|--------|
| RLS | Migrations + `supabase/tests/rls_policies.test.sql` | Covered |
| Admin authz | `is_active_admin` / `admin_has_permission` + layout guards | Covered |
| Bet API | Auth required, Zod/engine validation, rate limit, origin check, `assert_play_allowed` | Covered |
| Settlement | Server RPC only; browser never decides balances | Covered |
| Secrets | `src/lib/env/server.ts` + forbidden public keys list | Covered |
| Headers | CSP + XFO + nosniff + referrer + permissions-policy | Covered |
| Uploads | MIME + size validation (avatar / tickets) | Covered |
| Audit | Append-only `audit_log` | Covered |
| Demo money | No payments/wallets/cash-out features | Enforced by product rules |

## Residual risks / follow-ups

- Production CSP may need nonce-based `script-src` once inline scripts are fully removed.
- Authenticated Playwright journeys require a staging Supabase project with seeded Owner admin.
- `npm audit` should be re-run on every release; treat high+ findings as blockers.
