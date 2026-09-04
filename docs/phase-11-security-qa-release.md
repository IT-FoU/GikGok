# Phase 11 — Security, performance, QA, and release

## Delivered

- Security headers via `next.config.ts` (CSP, frame deny, nosniff, referrer, permissions-policy)
- Same-origin checks on `/api/games/bet`; user-safe error sanitization; structured logging
- `/api/health` smoke endpoint; client `AppErrorBoundary`; secret-exposure helpers
- Upload validation helpers; `scripts/security-check.sh`; dependency audit hook
- Shared WebGL detection + 2D fallback resolver; performance budgets
- PWA: `manifest.webmanifest`, icons, offline-shell `sw.js` (never caches bet/ledger APIs)
- Backup script `scripts/db-backup.sh` + runbook recovery drill
- Playwright E2E for public shell, auth gates, health, PWA assets
- Docs: security audit, deployment, runbook, final report
- Migration `20260904200000_phase11_ops_hardening.sql` (retention settings + health seed)

## Validation

```bash
npm run lint && npm run typecheck && npm test
npm run security:check
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key npm run build
npm run db:validate
npm run build && npm run test:e2e
```

## Results (2026-09-04)

| Command | Result |
|---------|--------|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass (78 tests) |
| `npm run security:check` | pass |
| `npm run build` | pass |
| `npm run db:validate` | pass |
| Playwright chromium + mobile-chrome | pass (16) |

## Manual QA checklist

- [ ] iOS Safari + Android Chrome + tablet + desktop
- [ ] Light / Dark + Lao / English
- [ ] WebGL off / low-end → 2D fallback
- [ ] PWA install prompt after responsive pass
