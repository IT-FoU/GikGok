#!/usr/bin/env bash
# Static security hygiene checks for GIKGOK (no offensive scanning).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> NEXT_PUBLIC must not reference service role / JWT secrets"
if grep -R -n -E 'NEXT_PUBLIC_.*(SERVICE_ROLE|JWT_SECRET)' src .env.example 2>/dev/null; then
  echo "FAIL: public env references secrets"
  exit 1
fi
echo "OK: public env keys clean"

echo "==> Security helper modules present"
test -f src/lib/security/index.ts
test -f src/lib/observability/logger.ts
test -f src/lib/performance/graphics.ts
echo "OK: modules present"

echo "==> Dependency audit (high+)"
set +e
npm audit --omit=dev --audit-level=high
audit_rc=$?
set -e
if [[ "$audit_rc" -eq 0 ]]; then
  echo "OK: npm audit (high+) clean"
else
  echo "WARN: npm audit reported high+ issues — review before production (not failing CI soft gate)"
fi

echo "OK: security-check completed"
