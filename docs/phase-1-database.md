# Phase 1 — Database validation notes

## Local validation (no Docker / Supabase stack)

This environment validates migrations against PostgreSQL 16 using:

```bash
npm run db:validate
```

The script:

1. Resets a local `gikgok` database
2. Applies `supabase/tests/bootstrap.sql` (auth/storage stubs + roles)
3. Applies every file in `supabase/migrations/`
4. Runs `supabase/tests/rls_policies.test.sql`

## Results

Recorded after Phase 1 implementation (2026-09-04):

| Check | Result |
|-------|--------|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass (10 tests) |
| `npm run build` | pass |
| `npm run db:validate` | pass — migrations apply; RLS isolation + least-privilege tests pass |

RLS coverage in `supabase/tests/rls_policies.test.sql`:

- Player A sees only own ledger/balance rows
- Players cannot insert ledger entries directly
- `credit_manager` has `credits.view` / `credits.adjust`, not `tickets.manage`
- `support_viewer` cannot read ledger
- Credit requests are isolated between players

## Type generation

`supabase gen types` currently requires Docker even with `--db-url`.
Checked-in types live in `src/lib/supabase/types.ts` and match the migrations.
When Docker or a linked Supabase project is available:

```bash
npm run db:types
```
