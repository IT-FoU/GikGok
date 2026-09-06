# GIKGOK

Private, multi-account, mobile-first web game platform using **GIK demo credits only**.
No real-money deposits, payments, cash-out, wallets, or monetary value.

## Stack

- Next.js (App Router) + TypeScript strict mode
- Tailwind CSS + shadcn/ui + Lucide
- Supabase (Auth, Postgres, Storage, Realtime, Edge Functions)
- Zod, TanStack Query, Zustand
- Vitest + Playwright
- React Three Fiber / Three.js / Rapier (optional 3D)
- Lao + English localization (Thai-ready layout)

## Quick start

```bash
npm install
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy `.env.example` to `.env.local`. Never commit secrets.

| Variable | Scope | Required | Description |
|----------|-------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Yes | Supabase publishable key (`sb_publishable_…`) |
| `NEXT_PUBLIC_APP_URL` | Public | No | Canonical app URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | For admin ops | Service-role key — never in frontend |
| `SUPABASE_JWT_SECRET` | Server only | Optional | JWT secret when needed server-side |
| `ADMIN_SESSION_SECRET` | Server only | Optional (≥32) | Admin session hardening |

Validation lives in `src/lib/env/client.ts` (public) and `src/lib/env/server.ts` (server-only).

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright E2E (later phases) |
| `npm run format` | Prettier write |
| `npm run db:start` / `db:stop` | Local Supabase stack (Docker) |
| `npm run db:reset` | Recreate local DB, apply migrations, seed |
| `npm run db:test` | RLS isolation tests (requires local DB) |
| `npm run db:validate` | Structural DB validation |
| `npm run db:backup` | Logical `pg_dump` export (see runbook) |
| `npm run security:check` | Secret-leak + RLS + SECURITY DEFINER checks |
| `npm run db:types` | Regenerate `src/lib/supabase/types.gen.ts` |

## Architecture

See [docs/architecture.md](docs/architecture.md) for module boundaries:

- **Player app** — `src/app/(player)`, `src/modules/player`
- **Admin app** — `src/app/admin`, `src/modules/admin`
- **Shared UI** — `src/components/ui`, `src/modules/shared`
- **Game engine** — `src/modules/game-engine`
- **Ledger** — `src/modules/ledger`
- **Engagement** — `src/modules/engagement`
- **Database** — `supabase/migrations`, `src/lib/supabase`
- **Localization** — `src/modules/localization`

Database schema, RLS/security model, seed, and staging test-user setup:
[docs/database.md](docs/database.md).

Product requirements: [requirements.md](requirements.md).  
Task plan: [tasks.md](tasks.md).

## Ops docs

- [Runbook](docs/runbook.md) — admin onboarding, backup/recovery, incidents
- [Deployment](docs/deployment.md) — staging/production env and rollback
- [Security audit](docs/security-audit.md)
- [Final report](docs/FINAL_REPORT.md)
- [Continuation](docs/CONTINUATION.md)

## Known limitations

- Demo GIK only — no real-money rails.
- Local Docker Supabase may be unavailable in some Cloud Agent VMs (**BLOCKED**).
- Live Phone OTP requires an SMS provider (**WAITING**).
- Physical device QA and authenticated Playwright against staging remain operator follow-ups.
- Staging project ref must stay `jlpcfatcpymjnjbxmclo`; forward migrations only.

## Non-negotiables

- Demo credits only — no real-money or payment features.
- Server-authoritative settlement and ledger; browser never decides balances/outcomes.
- No service-role key in frontend or repository.
- Do not merge to `main` / deploy production from continuous-implementation agents without explicit approval.
