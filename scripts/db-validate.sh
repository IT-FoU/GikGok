#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_URL="${GIKGOK_DB_URL:-postgresql://gikgok:gikgok@127.0.0.1:5432/gikgok}"

echo "==> Resetting database"
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS storage CASCADE;
DROP SCHEMA IF EXISTS extensions CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO gikgok;
GRANT ALL ON SCHEMA public TO public;
SQL

echo "==> Applying local bootstrap"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/tests/bootstrap.sql"

echo "==> Applying migrations"
for file in "$ROOT_DIR"/supabase/migrations/*.sql; do
  echo "  -> $(basename "$file")"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$file"
done

echo "==> Running RLS SQL tests"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/tests/rls_policies.test.sql"

echo "==> Running auth lifecycle SQL tests"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/tests/auth_lifecycle.test.sql"

echo "==> Running ledger/rewards SQL tests"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/tests/ledger_rewards.test.sql"

echo "==> Running game engine SQL tests"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/tests/game_engine.test.sql"

echo "==> Running admin console SQL tests"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/supabase/tests/admin_console.test.sql"

echo "OK: migrations + RLS tests passed"
