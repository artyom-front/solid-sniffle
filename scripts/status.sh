#!/usr/bin/env bash
# ============================================================
# SCORESBOX · status.sh — экспресс-диагностика на сервере (1 минута).
# Запуск (из /opt/scoresbox):  bash scripts/status.sh
# Показывает: контейнеры, health приложения, версию, диск,
# свежие бэкапы, последние строки лога. Читайте сверху вниз —
# первый красный/пустой пункт и есть место проблемы.
# ============================================================
set -uo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
COMPOSE_FILE="deploy/docker-compose.prod.yml"

echo "=== 1. Контейнеры (оба должны быть Up, app — healthy) ==="
docker compose -f "$COMPOSE_FILE" ps 2>/dev/null || echo "!! docker compose не отвечает"

echo
echo "=== 2. Health-check приложения (ждём {\"ok\":true}) ==="
curl -s --max-time 5 http://127.0.0.1:3000/api/health || echo "!! /api/health НЕ отвечает — смотрите п.6"
echo

echo
echo "=== 3. Текущая версия и история деплоев ==="
echo "current: $(cat .deploy/current 2>/dev/null || echo 'нет данных (первый деплой ещё не завершался')"
tail -5 .deploy/history 2>/dev/null || echo "истории ещё нет"

echo
echo "=== 4. Место на диске (тревожно, когда Use% > 80) ==="
df -h / | tail -1

echo
echo "=== 5. Свежие бэкапы БД (должны быть, если деплои шли) ==="
ls -lht backups/pg-*.dump 2>/dev/null | head -3 || echo "бэкапов нет — сделайте: bash scripts/backup-db.sh"

echo
echo "=== 6. Последние строки лога приложения ==="
docker logs scoresbox-app --tail 10 2>&1 | tail -10

echo
echo "Подсказки: подробный лог — docker logs scoresbox-app --tail 100;"
echo "откат — bash scripts/rollback.sh; полный гайд — DEPLOY.md, раздел I."
