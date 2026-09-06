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
| Origin / CSRF | `requireSameOrigin` / `assertMutatingOrigin` on player, ledger, engagement, game-engine, admin mutators (incl. MFA enroll) | Covered for mutating server actions. `signTicketAttachmentUrls` is SSR read-side-effect (no Origin) by design |
| Audit | Append-only `audit_log` | Covered |
| Demo money | No payments/wallets/cash-out features | Enforced by product rules |

## Residual risks / follow-ups

- Script CSP nonce via `src/proxy.ts` (`strict-dynamic`); root layout reads `x-nonce`. `style-src 'unsafe-inline'` remains (Tailwind/runtime). Static CSP removed from `next.config.ts`.
- Security Advisor still WARNs (~60) for intentional authenticated SECURITY DEFINER RPCs — see `docs/ADVISOR_TRIAGE.md` (not “Advisor clean”).
- Authenticated Playwright journeys require seeded staging credentials (WAITING).
- `npm audit` should be re-run on every release; treat high+ findings as blockers.
