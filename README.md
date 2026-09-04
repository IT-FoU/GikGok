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
# Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy `.env.example` to `.env.local`. Never commit secrets.

| Variable | Scope | Required | Description |
|----------|-------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Yes | Supabase anon/public key |
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
| `npm run db:validate` | Apply migrations + RLS tests on local Postgres |
| `npm run db:types` | Generate DB types (requires Supabase local/Docker) |

## Architecture

See [docs/architecture.md](docs/architecture.md) for module boundaries:

- **Player app** — `src/app/(player)`, `src/modules/player`
- **Admin app** — `src/app/admin`, `src/modules/admin`
- **Shared UI** — `src/components/ui`, `src/modules/shared`
- **Game engine** — `src/modules/game-engine`
- **Ledger** — `src/modules/ledger`
- **Database** — `supabase/migrations`, `src/lib/supabase`
- **Localization** — `src/modules/localization`

Database foundation details: [docs/phase-1-database.md](docs/phase-1-database.md).
Auth lifecycle details: [docs/phase-2-auth.md](docs/phase-2-auth.md).
Design system details: [docs/phase-3-design.md](docs/phase-3-design.md).
Ledger/credits details: [docs/phase-4-ledger.md](docs/phase-4-ledger.md).

Product requirements: [requirements.md](requirements.md).  
Task plan: [tasks.md](tasks.md).

## Non-negotiables

- Demo credits only — no real-money or payment features.
- Server-authoritative settlement and ledger; browser never decides balances/outcomes.
- No service-role key in frontend or repository.
- Balance is derived from immutable `ledger_entries`; never edit balances directly.
