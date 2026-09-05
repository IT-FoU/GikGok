# Phase 0 baseline validation

Recorded after scaffolding Next.js + TypeScript strict, installing required
dependencies, defining module boundaries, and adding env schema validation.

## Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Results (2026-09-04)

| Command | Exit | Notes |
|---------|------|-------|
| `npm run lint` | 0 | Clean |
| `npm run typecheck` | 0 | Clean after fixing `LayoutProps` and excluding Vitest/Playwright configs from `tsc` |
| `npm test` | 0 | 6 unit tests passed (module boundaries + env validation) |
| `npm run build` | 0 | Next.js 16.3.4 production build succeeded; routes `/`, `/home`, `/admin` |

### Initial typecheck failures (fixed before Phase 0 close-out)

1. `src/app/layout.tsx` — scaffold used generated `LayoutProps` without generated `.next` types during bare `tsc`; replaced with `{ children: ReactNode }`.
2. `vitest.config.ts` — Vite plugin type conflict between Vite 8 (from `@vitejs/plugin-react`) and Vitest’s bundled Vite; removed unused React plugin and excluded Vitest/Playwright configs from app `tsconfig`.

No remaining baseline failures. Ready for Phase 1 (database / Supabase foundation).

## Correction (Phase 1 database status)

Any earlier implication that a database `db:validate` had "passed" did **not**
reflect a validated deployed schema — at that time no migration or seed files
existed, so there was nothing to validate. As of Phase 1, `npm run db:validate`
validates the real schema against a local Supabase database (migrations applied,
RLS on every table, seed present). Remote staging integration (link / `db push` /
seed) is **WAITING** and has not been performed. See
[docs/database.md](database.md).
