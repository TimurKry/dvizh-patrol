#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Поднять всё, что нужно для записи, одной командой:
#   Postgres → PostgREST → shim → демо-данные → приложение.
#
# Скрипт идемпотентен: можно звать повторно после перезапуска
# машины, ничего не ломая.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env.local ]; then
  echo "!! Нет .env.local — создайте по video-preview/.env.example" >&2
  exit 1
fi

bash video-preview/stack/start.sh

# Миграции накатываются один раз: файлы не идемпотентны (CREATE
# TYPE упадёт на втором прогоне), а база между запусками живёт.
if ! psql "postgresql://dvizh:dvizh_local_password@127.0.0.1:54329/dvizh_patrol" \
     -tAc "SELECT to_regclass('public.events')" 2>/dev/null | grep -q events; then
  echo "→ Миграции"
  PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}" bash scripts/local-db.sh reset >/dev/null
fi

echo "→ Демо-данные"
node video-preview/stack/seed-demo.mjs

if [ ! -d .next ] || [ "${REBUILD:-0}" = "1" ]; then
  echo "→ Сборка приложения"
  npm run build >video-preview/scratch/logs/build.log 2>&1
fi

bash video-preview/stack/restart-app.sh
