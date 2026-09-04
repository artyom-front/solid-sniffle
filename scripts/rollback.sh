#!/usr/bin/env bash
# ============================================================
# SCORESBOX · rollback.sh — откат на предыдущую рабочую версию
# Читает .deploy/history: последняя строка — текущий деплой,
# предпоследняя — предыдущий рабочий тег.
#   ./scripts/rollback.sh            # откат на пред-последнюю
#   ./scripts/rollback.sh 1.2.1      # откат на конкретный тег
# ============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

STATE_DIR=".deploy"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
DEPLOY_IMAGE="${DEPLOY_IMAGE:-ghcr.io/artyom-front/studious-tribble}"
[ -f "$STATE_DIR/env" ] && . "$STATE_DIR/env"

# Пароль БД из .env (нужен compose-файлу)
set -a; [ -f .env ] && . ./.env; set +a
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD должен быть задан в .env}"

if [ -n "${1:-}" ]; then
  TARGET="$1"
else
  if [ ! -f "$STATE_DIR/history" ] || [ "$(wc -l < "$STATE_DIR/history")" -lt 2 ]; then
    echo "!! История деплоев пуста — откатывать некуда. Укажите тег: ./scripts/rollback.sh <tag>"
    exit 1
  fi
  TARGET=$(tail -2 "$STATE_DIR/history" | head -1 | awk '{print $2}')
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
