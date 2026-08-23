#!/usr/bin/env bash
# Перезапуск собранного приложения на 127.0.0.1:3000.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

pkill -f 'next-server' 2>/dev/null || true
pkill -f 'next start' 2>/dev/null || true
sleep 1

nohup npx next start -H 127.0.0.1 -p 3000 \
  >"$ROOT_DIR/video-preview/scratch/logs/next.log" 2>&1 &

for _ in $(seq 1 40); do
  if curl -sf --noproxy '*' -o /dev/null http://127.0.0.1:3000/; then
    echo "→ приложение готово"
    exit 0
  fi
  sleep 0.5
done

echo "!! приложение не поднялось" >&2
exit 1
