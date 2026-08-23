#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Локальный стенд для записи ролика.
#
#   1. PostgreSQL с настоящими миграциями проекта
#   2. PostgREST поверх него            (127.0.0.1:54322)
#   3. Shim: auth + storage + прокси    (127.0.0.1:54321)
#
# Ничего из этого не касается боевого проекта: адрес базы,
# ключи и файлы живут только внутри песочницы.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VIDEO_DIR="$ROOT_DIR/video-preview"
RUN_DIR="$VIDEO_DIR/scratch"
PGRST_BIN="${PGRST_BIN:-$RUN_DIR/bin/postgrest}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
DB_URL="postgresql://dvizh:dvizh_local_password@127.0.0.1:54329/dvizh_patrol"

mkdir -p "$RUN_DIR/logs" "$RUN_DIR/storage" "$RUN_DIR/bin"

echo "→ PostgreSQL"
PG_BIN="$PG_BIN" bash "$ROOT_DIR/scripts/local-db.sh" start >/dev/null

if [ ! -x "$PGRST_BIN" ]; then
  echo "!! Нет бинарника PostgREST: $PGRST_BIN" >&2
  echo "   Скачайте релиз PostgREST 12.x для linux-static-x64 и положите туда." >&2
  exit 1
fi

echo "→ PostgREST"
cat >"$RUN_DIR/postgrest.conf" <<CONF
db-uri = "$DB_URL"
db-schemas = "public"
db-anon-role = "anon"
db-pool = 12
jwt-secret = "${LOCAL_JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
jwt-role-claim-key = ".role"
server-host = "127.0.0.1"
server-port = 54322
db-extra-search-path = "public, extensions"
CONF

pkill -f "postgrest .*postgrest.conf" 2>/dev/null || true
pkill -f "stack/supabase-shim.mjs" 2>/dev/null || true
sleep 1

nohup "$PGRST_BIN" "$RUN_DIR/postgrest.conf" >"$RUN_DIR/logs/postgrest.log" 2>&1 &

echo "→ Shim (auth + storage)"
STORAGE_ROOT="$RUN_DIR/storage" \
nohup node "$VIDEO_DIR/stack/supabase-shim.mjs" >"$RUN_DIR/logs/shim.log" 2>&1 &

for _ in $(seq 1 40); do
  if curl -sf --noproxy '*' http://127.0.0.1:54321/health >/dev/null; then break; fi
  sleep 0.5
done

echo "→ Стенд готов: http://127.0.0.1:54321"
