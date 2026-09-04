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

Recorded after Phase 1 implementation:

- Migrations apply cleanly
- RLS tests prove player ledger isolation
- RLS tests prove credit_manager vs support_viewer least privilege
- Credit-request row isolation between players

## Type generation

`supabase gen types` currently requires Docker even with `--db-url`.
Checked-in types live in `src/lib/supabase/types.ts` and match the migrations.
When Docker or a linked Supabase project is available:

```bash
npm run db:types
```
