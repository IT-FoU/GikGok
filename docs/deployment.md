# Deployment

## Environments

| Env | Purpose |
|-----|---------|
| Local | `npm run dev` + local Postgres `db:validate` |
| Staging | Full Supabase project; seed Owner admin; Playwright + manual QA |
| Production | Same migrations; stricter secrets; monitoring on `/api/health` |

## Required variables

Copy `.env.example` → `.env.local` / platform secrets.

**Public:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`
**Server-only:** `SUPABASE_SERVICE_ROLE_KEY` (ops only), `SUPABASE_JWT_SECRET`, `ADMIN_SESSION_SECRET`

Never expose service-role keys to the browser or `NEXT_PUBLIC_*`.

## Migration release

1. `npm run db:validate` on CI/staging clone.
2. Apply `supabase/migrations/*.sql` in order (Supabase CLI or pipeline).
3. Smoke: `/api/health`, `/login`, one game open (admin), one bet path in staging.
4. Rollback: redeploy previous app image; DB roll-forward only (prefer compensating migrations). Keep latest `db:backup` artifact.

## Staging checklist

- [ ] Env validated
- [ ] Migrations applied
- [ ] Owner admin can open `/admin`
- [ ] Player register/verify path works
- [ ] Three games load; 2D fallback when WebGL blocked
- [ ] PWA manifest reachable
- [ ] `npm run security:check`
