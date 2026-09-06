# Security audit notes (staging)

Project ref: `jlpcfatcpymjnjbxmclo`. Demo GIK only. Forward migrations only; never reset remote.

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
| Uploads | MIME + size + **magic-byte** validation (avatar / ticket images); private `ticket-attachments` bucket; max 3 | Covered (P1 repair) |
| Origin / CSRF | `requireSameOrigin` on bet + ticket attachment mutations | Covered for those paths; expand to remaining mutators as follow-up |
| Audit | Append-only `audit_log` | Covered |
| Demo money | No payments/wallets/cash-out features | Enforced by product rules |

## Residual risks / follow-ups

- Production CSP drops `'unsafe-eval'` (`next.config.ts`); prefer nonce-based `script-src` before release acceptance if inline scripts remain.
- Security Advisor still WARNs (~60) for intentional authenticated SECURITY DEFINER RPCs — see `docs/ADVISOR_TRIAGE.md` (not “Advisor clean”).
- Authenticated Playwright journeys require seeded staging credentials (WAITING).
- `npm audit` should be re-run on every release; treat high+ findings as blockers.
