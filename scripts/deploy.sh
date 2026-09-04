#!/usr/bin/env bash
# ============================================================
# SCORESBOX · deploy.sh — поставка новой версии на сервере
# Вызывается из GitHub Actions (cd.yml) или вручную:
#   ./scripts/deploy.sh 1.2.3
# Шаги: бэкап БД (pg_dump) → миграции (prisma db push) →
# up → health-check → бутстрап админа → фиксация тега.
# Авто-откат на предыдущую версию при провале health-check.
# ============================================================
set -euo pipefail

TAG="${1:?Использование: ./scripts/deploy.sh <тег образа, например 1.2.3>}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

STATE_DIR=".deploy"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
BACKUP_DIR="backups"
mkdir -p "$STATE_DIR" "$BACKUP_DIR"

# GHCR-образ (переопределяется .deploy/env из CI)
DEPLOY_IMAGE="${DEPLOY_IMAGE:-ghcr.io/artyom-front/studious-tribble}"
[ -f "$STATE_DIR/env" ] && . "$STATE_DIR/env"

# Пароль БД и админ-креды из .env
set -a; [ -f .env ] && . ./.env; set +a
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD должен быть задан в .env}"

echo "==> Деплой SCORESBOX $DEPLOY_IMAGE:$TAG"

# ---------- 0. Первый запуск: подготовить БД-контейнер ----------
if ! docker compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q "scoresbox-db"; then
  echo "==> Первый запуск: старт PostgreSQL"
  TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    docker compose -f "$COMPOSE_FILE" up -d db
fi

# ждём готовности PostgreSQL (после старта контейнеру нужно несколько секунд)
echo "==> Ждём готовности PostgreSQL"
for i in $(seq 1 30); do
  docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U scoresbox -d scoresbox >/dev/null 2>&1 && break
  sleep 2
done

# ---------- 1. Бэкап PostgreSQL (pg_dump перед изменениями) ----------
TS=$(date +%Y%m%d-%H%M%S)
echo "==> Бэкап БД (pg_dump)"
if docker compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q "running\|healthy"; then
  docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_dump -U scoresbox -d scoresbox --no-owner --format=custom \
    > "$BACKUP_DIR/pg-$TS.dump" || echo "    (бэкап пропущен — БД ещё пустая)"
  [ -f "$BACKUP_DIR/pg-$TS.dump" ] && \
    echo "    бэкап: $BACKUP_DIR/pg-$TS.dump ($(du -h "$BACKUP_DIR/pg-$TS.dump" | cut -f1))"
fi

# ---------- 2. Схема БД одним прогоном нового контейнера ----------
echo "==> Миграции (prisma db push)"
TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  docker compose -f "$COMPOSE_FILE" run --rm --no-deps app \
  bun node_modules/prisma/build/index.js db push --skip-generate

# ---------- 3. Запуск новой версии ----------
echo "==> docker compose up -d"
TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
docker image prune -f --filter "label=com.docker.compose.project" >/dev/null 2>&1 || true

# ---------- 4. Health-check (до 90 секунд, напрямую в приложение) ----------
echo "==> health-check"
ok=0
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/health | grep -q '"ok":true'; then ok=1; break; fi
  sleep 3
done
if [ "$ok" != "1" ]; then
  echo "!! health-check не прошёл — откат на предыдущую версию"
  ./scripts/rollback.sh || true
  exit 1
fi
echo "    прод здоров ✓"

# ---------- 5. Бутстрап админа (идемпотентно: только если пользователей нет) ----------
echo "==> Бутстрап админа"
docker compose -f "$COMPOSE_FILE" exec -T app bun prisma/bootstrap.ts || true

# ---------- 6. Фиксация истории ----------
echo "$TAG" > "$STATE_DIR/current"
echo "$TS $TAG" >> "$STATE_DIR/history"
# держим последние 20 записей истории
tail -20 "$STATE_DIR/history" > "$STATE_DIR/history.tmp" && mv "$STATE_DIR/history.tmp" "$STATE_DIR/history"

# ---------- 7. Ротация бэкапов (30 дней) ----------
find "$BACKUP_DIR" -name "pg-*.dump" -mtime +30 -delete 2>/dev/null || true

echo "==> Деплой $TAG завершён успешно"
