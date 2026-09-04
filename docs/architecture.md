# GIKGOK Architecture

## Module boundaries

| Module | Path | Responsibility |
|--------|------|----------------|
| Player app | `src/app/(player)`, `src/modules/player` | Player routes and product features |
| Admin app | `src/app/admin`, `src/modules/admin` | Admin Console under `/admin` |
| Shared UI | `src/components/ui`, `src/modules/shared` | shadcn/ui primitives shared by both apps |
| Game engine | `src/modules/game-engine` | Definitions, validation, settlement contracts |
| Ledger | `src/modules/ledger` | Append-only credit domain |
| Database | `supabase/migrations`, `src/modules/database`, `src/lib/supabase` | Schema, RLS, typed clients |
| Localization | `src/modules/localization` | Lao/English catalogs; Thai-ready layout |

## Authority rules

- Demo GIK credits only — no real-money, wallet, cash-out, or payment features.
- Server-side settlement and ledger writes are authoritative.
- Browser code (including 2D/3D renderers) reveals results; it never decides balances or outcomes.
- Public env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` only.
- Service-role and other secrets stay server-only via `src/lib/env/server.ts`.

## Stack baseline

- Next.js App Router + TypeScript `strict`
- Tailwind CSS + shadcn/ui + Lucide
- Supabase Auth/Postgres/Storage/Realtime/Edge Functions
- Zod env validation, TanStack Query, Zustand
- Vitest + Playwright
- React Three Fiber / Three.js / Rapier for optional 3D
- next-intl-ready localization catalogs
