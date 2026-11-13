#!/usr/bin/env bash
# SMOKE-SEC42 · прогон RBAC-приёмки v1.0.42: поднять standalone :3100,
# прогнать scripts/smoke-sec42.ts, погасить сервер. Один вызов: сервер
# не живёт между вызовами shell (грабля из worklog Task 44/45).
set -uo pipefail
cd /home/z/my-project

DB="postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"

bash scripts/smoke-standalone.sh stop >/dev/null 2>&1

export DATABASE_URL="$DB"
export AUTH_SECRET="smoke-test-secret-v22"
export NODE_ENV=production
export PORT=3100
export HOSTNAME=127.0.0.1
export APP_VERSION="v1.0.42-smoke"

cd .next/standalone
setsid nohup bun server.js </dev/null >/tmp/standalone-sec42.log 2>&1 &
echo $! > /tmp/standalone.pid
cd /home/z/my-project

UP=0
for i in $(seq 1 45); do
  sleep 1
  H=$(curl -s --max-time 3 http://localhost:3100/api/health 2>/dev/null | head -c 200)
  if [ -n "$H" ]; then
    echo "health after ${i}s: $H"
    UP=1
    break
  fi
done
if [ "$UP" != "1" ]; then
  echo "SERVER DID NOT START; last log lines:"
  tail -15 /tmp/standalone-sec42.log
  bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
  exit 2
fi

DATABASE_URL="$DB" BASE=http://localhost:3100 timeout 150 bun scripts/smoke-sec42.ts
RC=$?

bash scripts/smoke-standalone.sh stop >/dev/null 2>&1
exit $RC
