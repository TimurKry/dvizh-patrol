#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Локальный Postgres для проверки миграций и интеграционных тестов.
#
# Это НЕ Supabase. Скрипт поднимает чистый PostgreSQL и накатывает
# на него shim (supabase/local/00-supabase-shim.sql), который
# воспроизводит те объекты Supabase, от которых зависят миграции:
# роли anon/authenticated/service_role, схемы auth и storage,
# функции auth.uid()/auth.jwt()/auth.role().
#
# Shim нужен только локально. На реальном Supabase эти объекты
# уже существуют, и shim туда не применяется.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/var/lib/postgresql/dvizh-local}"
PGPORT="${PGPORT:-54329}"
PGSOCKET="${PGSOCKET:-/tmp/dvizh-pg}"
DBNAME="${DBNAME:-dvizh_patrol}"
DBUSER="${DBUSER:-dvizh}"
DBPASS="${DBPASS:-dvizh_local_password}"
LOGFILE="/tmp/dvizh-pg.log"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export PGPASSWORD="$DBPASS"
PSQL_URL="postgresql://${DBUSER}:${DBPASS}@127.0.0.1:${PGPORT}/${DBNAME}"

as_postgres() {
  su postgres -s /bin/bash -c "$1"
}

is_running() {
  as_postgres "$PG_BIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1
}

init_cluster() {
  if [ -s "$PGDATA/PG_VERSION" ]; then
    return
  fi
  echo "→ initdb в $PGDATA"
  mkdir -p "$PGDATA" "$PGSOCKET"
  chown postgres:postgres "$PGDATA" "$PGSOCKET"
  chmod 700 "$PGDATA"
  as_postgres "$PG_BIN/initdb -D $PGDATA -A trust -E UTF8 --locale=C" >/dev/null
  # Слушаем только loopback: наружу база не выставляется.
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "port = $PGPORT"
    echo "unix_socket_directories = '$PGSOCKET'"
    echo "fsync = off"
    echo "synchronous_commit = off"
    echo "full_page_writes = off"
    echo "max_connections = 100"
  } >>"$PGDATA/postgresql.conf"
}

start_server() {
  init_cluster
  if is_running; then
    echo "→ Postgres уже запущен на порту $PGPORT"
  else
    mkdir -p "$PGSOCKET"
    chown postgres:postgres "$PGSOCKET"
    echo "→ Запуск Postgres на порту $PGPORT"
    as_postgres "$PG_BIN/pg_ctl -D $PGDATA -l $LOGFILE -w start" >/dev/null
  fi

  # Роль и база приложения.
  as_postgres "$PG_BIN/psql -h $PGSOCKET -p $PGPORT -d postgres -tAc \
    \"SELECT 1 FROM pg_roles WHERE rolname='$DBUSER'\"" | grep -q 1 || \
    as_postgres "$PG_BIN/psql -h $PGSOCKET -p $PGPORT -d postgres -c \
      \"CREATE ROLE $DBUSER LOGIN SUPERUSER PASSWORD '$DBPASS'\"" >/dev/null

  as_postgres "$PG_BIN/psql -h $PGSOCKET -p $PGPORT -d postgres -tAc \
    \"SELECT 1 FROM pg_database WHERE datname='$DBNAME'\"" | grep -q 1 || \
    as_postgres "$PG_BIN/psql -h $PGSOCKET -p $PGPORT -d postgres -c \
      \"CREATE DATABASE $DBNAME OWNER $DBUSER\"" >/dev/null

  echo "→ DATABASE_URL=$PSQL_URL"
}

apply_sql() {
  local file="$1"
  echo "   · $(basename "$file")"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -q -f "$file"
}

migrate() {
  echo "→ Supabase shim (только локально)"
  apply_sql "$ROOT_DIR/supabase/local/00-supabase-shim.sql"
  echo "→ Миграции"
  for f in "$ROOT_DIR"/supabase/migrations/*.sql; do
    [ -e "$f" ] || continue
    apply_sql "$f"
  done
  echo "→ Готово"
}

reset_db() {
  start_server
  echo "→ Пересоздание схем"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS storage CASCADE;
DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS app_private CASCADE;
CREATE SCHEMA public;
SQL
  migrate
}

case "${1:-start}" in
start)
  start_server
  ;;
migrate)
  start_server
  migrate
  ;;
reset)
  reset_db
  ;;
stop)
  if is_running; then
    as_postgres "$PG_BIN/pg_ctl -D $PGDATA -w stop" >/dev/null
    echo "→ Postgres остановлен"
  else
    echo "→ Postgres не запущен"
  fi
  ;;
psql)
  shift || true
  psql "$PSQL_URL" "$@"
  ;;
url)
  echo "$PSQL_URL"
  ;;
*)
  echo "Использование: $0 {start|migrate|reset|stop|psql|url}" >&2
  exit 1
  ;;
esac
