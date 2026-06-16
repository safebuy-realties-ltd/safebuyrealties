#!/usr/bin/env bash
# Migrate SafeBuyRealties Postgres data from OLD_DATABASE_URL to NEW_DATABASE_URL.
#
# Usage:
#   export OLD_DATABASE_URL='postgresql://...'   # current / Prisma cloud DB
#   export NEW_DATABASE_URL='postgresql://...'   # new Render Postgres external URL
#   ./scripts/migrate-postgres-db.sh
#
# Requires: pg_dump, pg_restore, psql (postgresql-client), node, npm deps in backend/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP="${TMPDIR:-/tmp}/safebuyrealties-migrate-$(date +%Y%m%d%H%M%S).dump"

if [[ -z "${OLD_DATABASE_URL:-}" ]]; then
  echo "ERROR: Set OLD_DATABASE_URL to the current database connection string." >&2
  exit 1
fi
if [[ -z "${NEW_DATABASE_URL:-}" ]]; then
  echo "ERROR: Set NEW_DATABASE_URL to the new Render database connection string." >&2
  exit 1
fi

append_ssl() {
  local url="$1"
  if [[ "$url" != *"sslmode="* ]]; then
    if [[ "$url" == *"?"* ]]; then
      echo "${url}&sslmode=require"
    else
      echo "${url}?sslmode=require"
    fi
  else
    echo "$url"
  fi
}

OLD_URL="$(append_ssl "$OLD_DATABASE_URL")"
NEW_URL="$(append_ssl "$NEW_DATABASE_URL")"

echo "==> Testing OLD database connection..."
psql "$OLD_URL" -c "SELECT current_database(), COUNT(*) AS users FROM \"User\";" 2>/dev/null || \
  psql "$OLD_URL" -c "SELECT current_database();"

echo "==> Testing NEW database connection..."
psql "$NEW_URL" -c "SELECT current_database(), version();"

echo "==> Dumping OLD database (custom format)..."
pg_dump "$OLD_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --verbose \
  --file "$DUMP"

echo "==> Restoring into NEW database..."
pg_restore \
  --dbname="$NEW_URL" \
  --no-owner \
  --no-acl \
  --verbose \
  --clean \
  --if-exists \
  "$DUMP"

echo "==> Verifying row counts on NEW database..."
psql "$NEW_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'User' AS tbl, COUNT(*) FROM "User"
UNION ALL SELECT 'Listing', COUNT(*) FROM "Listing"
UNION ALL SELECT 'Transaction', COUNT(*) FROM "Transaction"
UNION ALL SELECT 'Payment', COUNT(*) FROM "Payment"
UNION ALL SELECT 'service_requests', COUNT(*) FROM "service_requests"
ORDER BY 1;
SQL

echo "==> Writing backend/.env with NEW database (gitignored)..."
ENV_FILE="$ROOT/backend/.env"
if [[ -f "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
fi
cat > "$ENV_FILE" <<EOF
DATABASE_URL="$NEW_DATABASE_URL"
DATABASE_POSTGRES_URL="$NEW_DATABASE_URL"
SBR_CONFIRM_CLOUD_DATABASE_URL=true
JWT_SECRET="${JWT_SECRET:-change-me-in-production-min-32-chars-long}"
PORT=3001
FRONTEND_URL="http://localhost:8080,http://localhost:5173,https://safebuyrealties-app.vercel.app"
EOF

echo "==> Prisma generate + migrate status..."
cd "$ROOT/backend"
export DATABASE_URL="$NEW_DATABASE_URL"
export DATABASE_POSTGRES_URL="$NEW_DATABASE_URL"
npx prisma generate
npx prisma migrate status

echo ""
echo "Done. Dump saved at: $DUMP"
echo "Update Render/Vercel env vars to NEW_DATABASE_URL, then redeploy API."
echo "Local backend/.env now points at the new database."
