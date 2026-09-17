#!/usr/bin/env bash
# ============================================================
# SCORESBOX · scripts/smoke-standalone.sh — запуск standalone-
# production-сервера для смоук-теста (полностью отвязан от
# инструментальной сессии: setsid + nohup + все FD redirected).
# Использование: bash scripts/smoke-standalone.sh [stop]
# ============================================================
set -u
cd /home/z/my-project

LOG=/tmp/standalone.log
PIDFILE=/tmp/standalone.pid

if [ "${1:-}" = "stop" ]; then
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null && echo "standalone stopped (pid $(cat $PIDFILE))"
    rm -f "$PIDFILE"
  else
    echo "no pidfile"
  fi
  exit 0
fi

# не дублируем запуск
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "standalone already running (pid $(cat $PIDFILE))"
  exit 0
fi

export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"
export AUTH_SECRET="smoke-test-secret-v22"
export NODE_ENV=production
export PORT=3000
export HOSTNAME=127.0.0.1

cd .next/standalone
setsid nohup bun server.js < /dev/null > "$LOG" 2>&1 &
echo $! > "$PIDFILE"
echo "standalone launched: pid $(cat $PIDFILE), log: $LOG"
