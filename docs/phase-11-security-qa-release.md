# Phase 11 — Security, QA, and release prep (staging)

## Delivered on continuous branch

- Secure headers via `next.config.ts` (CSP, frame deny, nosniff, referrer, permissions)
- Middleware auth gating for player + admin routes; public `/api/health`, PWA assets
- Origin helpers + upload validation in `src/lib/security`
- Structured logger + user-safe error boundary
- PWA manifest, icons, offline-shell `sw.js`, production SW registration
- Playwright smoke journeys (`tests/e2e/smoke.spec.ts`)
- Runbook, deployment, security audit, final report docs

## Validation gate

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run security:check
```

## WAITING (honest)

| Item | Status |
|------|--------|
| Physical device QA | WAITING |
| Live Phone OTP | WAITING SMS provider |
| Authenticated E2E against staging | WAITING credentials |
| Local Docker Supabase | BLOCKED |

## Staging

- Project ref: `jlpcfatcpymjnjbxmclo`
- GameIds: `fish_prawn_crab`, `high_low`, `spinning_plate`
- Demo GIK only
