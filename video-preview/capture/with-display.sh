#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Запуск записи на виртуальном X-дисплее.
#
# Chromium работает в headful-режиме: только так на экране
# оказывается то, что снимает x11grab. Дисплей поднимается один
# раз и переиспользуется — Xvfb с тем же номером просто откажется
# стартовать второй раз, и это нормально.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

DISPLAY_ID="${VIDEO_DISPLAY:-:99}"
SCREEN="${VIDEO_SCREEN:-1600x3000x24}"

if ! xdpyinfo -display "$DISPLAY_ID" >/dev/null 2>&1; then
  echo "→ Xvfb $DISPLAY_ID ($SCREEN)"
  Xvfb "$DISPLAY_ID" -screen 0 "$SCREEN" -nolisten tcp \
    >video-preview/scratch/logs/xvfb.log 2>&1 &
  sleep 2
fi

DISPLAY="$DISPLAY_ID" "$@"
