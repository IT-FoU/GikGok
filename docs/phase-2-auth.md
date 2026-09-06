# Phase 2 — Authentication (staging schema)

## Delivered

- Welcome, register, login, logout, forgot/reset password, verify, account-status, guide, home, profile
- Email registration + OTP verification before play (email confirmation remains enabled)
- Phone registration/login architecture + UI; **live Phone OTP WAITING** on Owner SMS provider
- Nickname (2–24), preset avatars, JPG/PNG/WebP upload ≤2 MB
- Verified contact uniqueness via `player_contacts` + clear conflict messages
- `grant_welcome_credit` exactly once (profile flag + ledger `welcome_credit` + reference idempotency)
- Profile/settings on `player_settings` (language, sound pack/volume, graphics, reduce-motion)
- Soft deletion request preserves ledger/audit (`request_account_deletion`)
- Middleware enforces session + active/verified status for player routes
- Password reset never discloses account existence

## Migration

Forward-only: `supabase/migrations/20260905183000_auth_lifecycle_rpcs.sql`

RPCs: `complete_player_onboarding`, `mark_contact_verified`, `grant_welcome_credit`,
`request_account_deletion`, `get_player_access_state`, `get_welcome_credit_amount`

Applied to staging `jlpcfatcpymjnjbxmclo` (dry-run confirmed single migration; push succeeded).
Uses `extensions.citext` under pinned `search_path = pg_catalog, public`.

## Waiting / blocked

| Item | Status |
|------|--------|
| Live Phone OTP end-to-end | **WAITING** — Owner must select/configure SMS provider |
| Local `supabase start` / `db:reset` | **BLOCKED** — Docker overlayfs whiteout errors in this Cloud VM |
| Physical iOS/Android QA | **WAITING** (Phase 11) |

## Validation commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run security:check
# After staging push of forward migration:
npx supabase db push --dry-run   # confirm ref jlpcfatcpymjnjbxmclo
npx supabase db push
```
