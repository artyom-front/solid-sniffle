#!/usr/bin/env bash
# ============================================================
# SCORESBOX · deploy.sh — поставка новой версии на сервере
# Вызывается из GitHub Actions (cd.yml) или вручную:
#   bash scripts/deploy.sh 1.2.3
# (вызов именно через bash: файл, залитый на сервер с Windows,
#  может не иметь бита x — «./» даст Permission denied, exit 126)
# Шаги: бэкап БД (pg_dump, v1.0.44 — проверяемый) → миграции
# (prisma migrate deploy) → up → health-check → бутстрап админа →
# фиксация тега. Авто-откат при провале health-check — на РАБОЧУЮ
# версию из .deploy/current (v1.0.44, аудит №15), не «предпоследнюю
# строку истории» — раньше неудачный деплой откатывал прод на ДВЕ
# версии: свежий тег в history не попадал (запись только после
# успешного health-check), и rollback.sh брал предпоследнюю строку.
# ============================================================
set -euo pipefail

TAG="${1:?Использование: bash scripts/deploy.sh <тег образа, например 1.2.3>}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

STATE_DIR=".deploy"
COMPOSE_FILE="deploy/docker-compose.prod.yml"
BACKUP_DIR="backups"
mkdir -p "$STATE_DIR" "$BACKUP_DIR"

# GHCR-образ (переопределяется .deploy/env из CI)
DEPLOY_IMAGE="${DEPLOY_IMAGE:-ghcr.io/artyom-front/solid-sniffle}"
[ -f "$STATE_DIR/env" ] && . "$STATE_DIR/env"

# Пароль БД и админ-креды из .env
set -a; [ -f .env ] && . ./.env; set +a
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD должен быть задан в .env}"
# SECURITY: без AUTH_SECRET прод-сборка откажется подписывать сессии
# (src/lib/auth.ts — fail-fast). Ловим это ДО касания БД и контейнеров.
: "${AUTH_SECRET:?AUTH_SECRET должен быть задан в .env (openssl rand -hex 32) — см. DEPLOY.md}"

echo "==> Деплой SCORESBOX $DEPLOY_IMAGE:$TAG"

# v1.0.44 (аудит №15): фиксируем РАБОЧУЮ версию до начала деплоя —
# откат при провале пойдёт на неё (не на «предпоследнюю строку истории»)
PREVIOUS_TAG=""
[ -f "$STATE_DIR/current" ] && PREVIOUS_TAG=$(cat "$STATE_DIR/current" | tr -d '[:space:]')
[ -n "$PREVIOUS_TAG" ] && echo "    предыдущая рабочая версия: $PREVIOUS_TAG"

# ---------- 0. Предзагрузка образов (docker compose pull) ----------
# v1.0.27 (инцидент 2026-09-24): раньше образ приложения тянулся
# неявно внутри «compose run» (миграции) / «up» — и на медленном линке
# VPS→ghcr.io слой ~239MB качался ~10 минут, съедая весь бюджет
# деплой-джобы CD (джоба отменяла сама себя по timeout). Теперь пул —
# отдельный шаг ДО миграций, с одним ретраем на transient-обрывы.
# Слои, скачанные до отмены, Docker кеширует; недокачанный слой
# начинается заново (резюма нет) — но бюджет джобы теперь 30 минут.
echo "==> Предзагрузка образов (docker compose pull)"
if ! TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  docker compose -f "$COMPOSE_FILE" pull; then
  echo "    пул не прошёл — повтор через 20с (линия VPS→ghcr.io нестабильна)"
  sleep 20
  TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    docker compose -f "$COMPOSE_FILE" pull
fi

# ---------- 0.5. Первый запуск: подготовить БД-контейнер ----------
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
# v1.0.44 (аудит №17): бэкап пишется во временный файл и проверяется
# (размер + pg_restore --list). Раньше падение pg_dump оставляло
# ПУСТОЙ файл pg-*.dump, а проверка [ -f ] «подтверждала» его наличие —
# миграции стартовали без бэкапа. Теперь провал бэкапа = СТОП деплоя.
TS=$(date +%Y%m%d-%H%M%S)
echo "==> Бэкап БД (pg_dump)"
if docker compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q "running\|healthy"; then
  TMP_DUMP="$BACKUP_DIR/pg-$TS.dump.part"
  rm -f "$TMP_DUMP"
  if docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_dump -U scoresbox -d scoresbox --no-owner --format=custom \
    > "$TMP_DUMP" 2>"$BACKUP_DIR/pg-$TS.err" \
    && [ -s "$TMP_DUMP" ] \
    && pg_restore --list "$TMP_DUMP" >/dev/null 2>&1; then
    mv "$TMP_DUMP" "$BACKUP_DIR/pg-$TS.dump"
    rm -f "$BACKUP_DIR/pg-$TS.err"
    echo "    бэкап: $BACKUP_DIR/pg-$TS.dump ($(du -h "$BACKUP_DIR/pg-$TS.dump" | cut -f1)) — проверен pg_restore --list"
  else
    rm -f "$TMP_DUMP"
    echo "!! Бэкап не прошёл проверку (см. $BACKUP_DIR/pg-$TS.err) — деплой ОСТАНОВЛЕН."
    echo "   Продолжать миграции без бэкапа нельзя. Разберитесь с pg_dump и повторите деплой."
    exit 1
  fi
else
  echo "!! Контейнер БД не запущен — деплой ОСТАНОВЛЕН (бэкап невозможен)."
  exit 1
fi

# ---------- 2. Миграции (prisma migrate deploy) ----------
# v1.0.23: переход с db push на управляемые миграции (prisma/migrations).
# Прод до этого жил на db push — таблицы _prisma_migrations нет, но схема есть.
# Разметка baseline-миграции как «применённой» (resolve --applied) НЕ исполняет
# её SQL, а только фиксирует в журнале миграций: с этого момента migrate
# деплоит только новые миграции. На ЧИСТОЙ базе (первый запуск) baseline
# честно исполняется, пропускаем resolve.
echo "==> Миграции (prisma migrate deploy)"
MIG="bun node_modules/prisma/build/index.js"
HAS_MIG_TABLE=$(docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U scoresbox -d scoresbox -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations'" 2>/dev/null | tr -d '[:space:]')
HAS_SCHEMA=$(docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U scoresbox -d scoresbox -tAc \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='User'" 2>/dev/null | tr -d '[:space:]')
if [ "${HAS_MIG_TABLE:-0}" = "0" ] && [ "${HAS_SCHEMA:-0}" != "0" ]; then
  echo "    легаси-схема без журнала миграций: размечаем baseline 00000000000000_init"
  TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    docker compose -f "$COMPOSE_FILE" run --rm --no-deps app \
    $MIG migrate resolve --applied 00000000000000_init
else
  echo "    журнал миграций уже ведётся (или база пустая) — baseline не нужен"
fi
TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  docker compose -f "$COMPOSE_FILE" run --rm --no-deps app \
  $MIG migrate deploy

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
  echo "!! health-check не прошёл — откат на предыдущую РАБОЧУЮ версию"
  # v1.0.44 (аудит №15): откат на зафиксированный до деплоя тег;
  # без PREVIOUS_TAG — старое поведение (предпоследняя строка history)
  if [ -n "$PREVIOUS_TAG" ]; then
    bash scripts/rollback.sh "$PREVIOUS_TAG" || true
  else
    bash scripts/rollback.sh || true
  fi
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
