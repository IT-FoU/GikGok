#!/usr/bin/env bash
# Logical backup / export for GIKGOK Postgres (demo environments).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_URL="${GIKGOK_DB_URL:-postgresql://gikgok:gikgok@127.0.0.1:5432/gikgok}"
OUT_DIR="${GIKGOK_BACKUP_DIR:-$ROOT_DIR/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/gikgok-$STAMP.sql"

mkdir -p "$OUT_DIR"

echo "==> Exporting schema+data to $OUT_FILE"
pg_dump "$DB_URL" --no-owner --no-acl --format=plain > "$OUT_FILE"
gzip -f "$OUT_FILE"
echo "OK: ${OUT_FILE}.gz"

# Retention: keep last 14 dumps
ls -1t "$OUT_DIR"/gikgok-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
echo "==> Retention applied (keep 14)"
