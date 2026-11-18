#!/usr/bin/env bash
# ============================================================
# SCORESBOX · test-artifact.sh — локальный тест рантайм-артефакта
# Запускает start.sh из артефакта точно так, как это делает
# платформа на FC-рантайме, и проверяет: PostgreSQL, Next.js, HTTP.
# После теста возвращает песочную БД на место.
# Использование: bash scripts/test-artifact.sh [путь-артефакта] [порт]
# ============================================================
set -u
ART="${1:-/tmp/build_fullstack_1788510719}"
PORT="${2:-3100}"

echo "==> Останавливаю песочную БД (keeper + postgres)"
pkill -f "keeper.mjs" 2>/dev/null; sleep 1
pkill -f "postgres -D" 2>/dev/null; sleep 2

echo "==> Запускаю start.sh артефакта (PORT=$PORT)"
rm -rf /tmp/scoresbox-pgdata
( cd "$ART" && PORT=$PORT nohup bash start.sh > /tmp/artifact-test.log 2>&1 & )

echo "==> Жду подъёма (до 90 с)..."
code=000
for i in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/" 2>/dev/null || true)
  if [ -n "$code" ] && [ "$code" != "000" ]; then break; fi
  sleep 1
done
echo "==> HTTP / -> $code (попытка $i)"
curl -s -o /tmp/page.html -w "Итог: HTTP %{http_code}, %{size_download} байт\n" "http://localhost:$PORT/"
echo "--- Заголовок страницы:"
rg -o '<title>[^<]*</title>' /tmp/page.html 2>/dev/null | head -1 || head -c 300 /tmp/page.html
echo ""
echo "--- Признак SSR-ошибки в теле:"
(rg -c 'digest' /tmp/page.html 2>/dev/null && echo "!! в HTML есть digest (SSR-ошибка)") || echo "чисто"

echo "=== artifact-test.log ==="; cat /tmp/artifact-test.log 2>/dev/null
echo "=== /tmp/pg.log (хвост) ==="; tail -15 /tmp/pg.log 2>/dev/null || echo "(пусто)"
echo "=== /tmp/next.log (хвост) ==="; tail -25 /tmp/next.log 2>/dev/null || echo "(пусто)"
echo "=== /api/health ==="
code2=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health" 2>/dev/null || true)
echo "HTTP /api/health -> $code2"
curl -s "http://localhost:$PORT/api/health" 2>/dev/null | head -3 || true
echo "=== Процессы артефакта ==="
ps aux | rg "build_fullstack|scoresbox-pgdata|bun server.js" | rg -v "rg " || echo "(нет)"

echo "==> Убираю за собой"
pkill -f "$ART" 2>/dev/null
pkill -f "bun server.js" 2>/dev/null
pkill -f "scoresbox-pgdata" 2>/dev/null
sleep 2
rm -rf /tmp/scoresbox-pgdata

echo "==> Возвращаю песочную БД"
cd /home/z/my-project || exit 1
nohup bun .zscripts/pg/keeper.mjs > .zscripts/pg-keeper.log 2>&1 &
for i in $(seq 1 30); do
  (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && break
  sleep 1
done
(exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null \
  && echo "БД песочницы: поднята" \
  || echo "!! БД песочницы НЕ поднялась (см. .zscripts/pg-keeper.log)"
