#!/usr/bin/env bash
# ============================================================
# SCORESBOX · репро CI-падения v1.0.29 (Task 35):
#   CI инициализирует БД через `prisma db push` — SQL-сид миграции
#   00000000000002 (F11/F8/F6/FUTSAL) НЕ выполняется → FormatLink
#   пуст → getOverview отдаёт фолбэк DEFAULT_FORMAT_LINKS (тест
#   «сид миграции виден» проходит ложноположительно), а проверка
#   дубля code=F11 в тесте «мусорные коды и дубли» падает (422→200).
# Скрипт: $1 = путь инициализации БД («push» — как CI сейчас,
#   «migrate» — как прод/фикс). Результат интеграции печатается.
# Использование: bash scripts/repro-ci35.sh push|migrate
# ============================================================
set -uo pipefail
cd /home/z/my-project

MODE="${1:-push}"
DB=scoresbox_ci_repro
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/${DB}?schema=public"
export AUTH_SECRET='ci-secret-not-for-production'
export SHOW_DEMO_ACCOUNTS=1
export SITE_URL='http://localhost:3100'
export PORT=3100
export NODE_ENV=production
export API_URL='http://localhost:3100'

echo "==> пересоздание БД ${DB}"
bun scripts/reset-test-db.ts "$DB" || exit 1

echo "==> инициализация схемы: $MODE"
if [ "$MODE" = "push" ]; then
  bunx prisma db push --accept-data-loss 2>&1 | tail -3
else
  bunx prisma migrate deploy 2>&1 | tail -5
fi

echo "==> сид демо-данных"
bun prisma/seed.ts 2>&1 | tail -3

echo "==> сколько FormatLink в БД после инициализации"
bun -e 'const {PrismaClient}=require("@prisma/client");const p=new PrismaClient();p.formatLink.count().then(c=>{console.log("FormatLink rows:",c);return p.$disconnect()})'

echo "==> запуск standalone-сервера (порт 3100)"
bun .next/standalone/server.js > /tmp/repro-ci35.log 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null; pkill -f "standalone/server.js" 2>/dev/null; }
trap cleanup EXIT

for i in $(seq 1 30); do curl -sf http://localhost:3100/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf http://localhost:3100/api/health | grep -o '"version":"[^"]*"' || { echo "SERVER FAIL"; tail -20 /tmp/repro-ci35.log; exit 1; }
echo ""

echo "==> интеграционные тесты (${MODE})"
bun test tests/integration 2>&1 | tail -12
