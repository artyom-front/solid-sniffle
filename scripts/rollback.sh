#!/usr/bin/env bash
# ============================================================
# SCORESBOX · rollback.sh — откат на рабочую версию
# Без аргумента — .deploy/current (версия, чей health-check прошёл);
# фолбэк для старых установок — предпоследняя строка .deploy/history
# (последняя — текущий деплой).
#   bash scripts/rollback.sh            # откат на текущую рабочую
#   bash scripts/rollback.sh 1.2.1      # откат на конкретный тег
# ============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

STATE_DIR=".deploy"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
DEPLOY_IMAGE="${DEPLOY_IMAGE:-ghcr.io/artyom-front/solid-sniffle}"
[ -f "$STATE_DIR/env" ] && . "$STATE_DIR/env"

# Пароль БД из .env (нужен compose-файлу)
set -a; [ -f .env ] && . ./.env; set +a
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD должен быть задан в .env}"

if [ -n "${1:-}" ]; then
  TARGET="$1"
else
  # v1.0.45 (инцидент деплоя v1.0.44, 2026-10-05): без аргумента
  # откатываемся на ПОСЛЕДНЮЮ РАБОЧУЮ версию из .deploy/current —
  # она пишется только после успешного health-check. Прежняя логика
  # «предпоследняя строка history» предполагала, что последняя строка —
  # провалившийся тег, но деплой, упавший ДО docker compose up, в
  # history вообще не попадает: 2026-10-05 CD-джоб rollback без
  # аргумента зря откатил ЗДОРОВУЮ 1.0.43 (контейнеры не трогались)
  # на 1.0.42. Фолбэк на history оставлен для установок без current.
  TARGET=""
  if [ -f "$STATE_DIR/current" ]; then
    TARGET=$(tr -d '[:space:]' < "$STATE_DIR/current")
  fi
  if [ -z "$TARGET" ]; then
    if [ ! -f "$STATE_DIR/history" ] || [ "$(wc -l < "$STATE_DIR/history")" -lt 2 ]; then
      echo "!! Нет .deploy/current, история деплоев пуста — откатывать некуда. Укажите тег: bash scripts/rollback.sh <tag>"
      exit 1
    fi
    TARGET=$(tail -2 "$STATE_DIR/history" | head -1 | awk '{print $2}')
  fi
fi

echo "==> Откат: $DEPLOY_IMAGE:$TARGET"

TAG="$TARGET" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

ok=0
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/health | grep -q '"ok":true'; then ok=1; break; fi
  sleep 3
done
if [ "$ok" != "1" ]; then
  echo "!! Откат тоже нездоров — проверьте сервисы вручную: docker compose -f $COMPOSE_FILE ps && docker logs scoresbox-app"
  exit 1
fi

echo "$TARGET" > "$STATE_DIR/current"
TS=$(date +%Y%m%d-%H%M%S)
echo "$TS $TARGET (rollback)" >> "$STATE_DIR/history"
echo "==> Откат на $TARGET выполнен, прод здоров ✓"
