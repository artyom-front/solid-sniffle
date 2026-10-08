#!/usr/bin/env bash
# ============================================================
# SCORESBOX · deploy.sh — поставка новой версии на сервере
# Вызывается из GitHub Actions (cd.yml) или вручную:
#   bash scripts/deploy.sh 1.2.3
# (вызов именно через bash: файл, залитый на сервер с Windows,
#  может не иметь бита x — «./» даст Permission denied, exit 126)
# Шаги: чистка старых образов (диск, v1.0.52) → диск-префлайт →
# пул (docker compose pull, v1.0.52 — ретрай с пониманием «диск
# переполнен») → бэкап БД (pg_dump + проверка pg_restore --list — всё
# ВНУТРИ контейнера db, v1.0.45) → миграции (prisma migrate deploy) →
# up → health-check → бутстрап админа → фиксация тега.
# Авто-откат при провале health-check — на РАБОЧУЮ версию из
# .deploy/current (аудит №15: v1.0.44 — deploy.sh передаёт тег явно;
# v1.0.45 — rollback.sh без аргумента тоже берёт current, а не
# «предпоследнюю строку истории»: деплой, упавший ДО up, тега
# в history не пишет, и старая логика откатывала ЗДОРОВЫЙ прод
# на версию ниже).
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

# ---------- 0. Чистка старых версий образа (v1.0.52) ----------
# Инцидент 2026-10-07 (деплой v1.0.51): диск VPS переполнился — «no space
# left on device» при ИЗВЛЕЧЕНИИ слоёв в overlayfs. ПРИЧИНА: теги
# ghcr.io/…:1.0.44…1.0.50 КОПИЛИСЬ (каждый ~0.5–1 ГБ распакованным),
# а чистка docker image prune из v1.0.45 была NO-OP: фильтр по label
# com.docker.compose.project матчит только образы, СОБРАННЫЕ compose, —
# наши тянутся из ghcr (сборка в CI), label нет, prune молча удалял 0 Б.
# Правило: храним ровно ДВА тега — новый ($TAG) и предыдущий РАБОЧИЙ
# ($PREVIOUS_TAG, цель авто-отката). Откат старее предыдущего — редкий
# ручной случай, образ перекачается с ghcr при необходимости.
docker images --format '{{.Repository}} {{.Tag}}' \
  | awk -v img="$DEPLOY_IMAGE" -v keep_new="$TAG" -v keep_prev="$PREVIOUS_TAG" \
      '$1==img && $2!="<none>" && $2!="" && $2!=keep_new && $2!=keep_prev {print $2}' \
  | while read -r old_tag; do
      echo "    чистим старый образ: $DEPLOY_IMAGE:$old_tag"
      docker rmi "$DEPLOY_IMAGE:$old_tag" >/dev/null 2>&1 || true
    done

# ---------- 0.1. Диск: пре-флайт (v1.0.52) ----------
# Извлечение образа требует ~1–2 ГБ свободного места (слои + временные
# snapshot-ы overlayfs). Меньше 3 ГБ — чистим dangling и меряем снова;
# всё равно мало — СТОП с диагностикой: лучше за 5 секунд, чем 10 минут
# качать и упасть на extract.
DOCKER_ROOT="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
avail_kb() { df -Pk "$1" 2>/dev/null | awk 'NR==2 {print $4}'; }
AVAIL_KB="$(avail_kb "$DOCKER_ROOT")"
if [ -n "$AVAIL_KB" ] && [ "$AVAIL_KB" -lt $((3 * 1024 * 1024)) ]; then
  echo "    мало места ($(df -h "$DOCKER_ROOT" 2>/dev/null | awk 'NR==2{print $4}') свободно) — чистим dangling-образы"
  docker image prune -f >/dev/null 2>&1 || true
  AVAIL_KB="$(avail_kb "$DOCKER_ROOT")"
fi
if [ -n "$AVAIL_KB" ] && [ "$AVAIL_KB" -lt $((3 * 1024 * 1024)) ]; then
  echo "!! Диск переполнен: доступно $(df -h "$DOCKER_ROOT" 2>/dev/null | awk 'NR==2{print $4}') < 3 ГБ — деплой ОСТАНОВЛЕН."
  echo "   Освободите место и повторите деплой (Re-run в Actions):"
  echo "     docker image prune -a -f    # старые теги, не занятые контейнерами"
  echo "     docker system df            # сколько занимает docker"
  echo "     df -h                       # что ещё растёт (бэкапы/логи)"
  docker system df 2>/dev/null | sed 's/^/     | /' || true
  df -h 2>/dev/null | sed 's/^/     | /' || true
  exit 1
fi

# ---------- 0.2. Предзагрузка образов (docker compose pull) ----------
# v1.0.27 (инцидент 2026-09-24): раньше образ приложения тянулся
# неявно внутри «compose run» (миграции) / «up» — и на медленном линке
# VPS→ghcr.io слой ~239MB качался ~10 минут, съедая весь бюджет
# деплой-джобы CD (джоба отменяла сама себя по timeout). Теперь пул —
# отдельный шаг ДО миграций, с одним ретраем на transient-обрывы.
# v1.0.52 (инцидент 2026-10-07): «no space left on device» — это НЕ
# сеть: слепой ретрай бесполезен (уходит 20с + повторная загрузка ~2 мин).
# Теперь выход пулла пишется в лог И стримится в CI (tee); при дисковом
# отказе — чистка (dangling + system prune), диагностика (df, system df)
# и повторный пул; при сетевом — прежний ретрай через 20с.
echo "==> Предзагрузка образов (docker compose pull)"
PULL_LOG="$(mktemp)"
if ! TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
     docker compose -f "$COMPOSE_FILE" pull 2>&1 | tee "$PULL_LOG"; then
  if grep -qi 'no space left on device' "$PULL_LOG"; then
    echo "!! Диск переполнен при извлечении слоёв — чистим и повторяем"
    docker image prune -f 2>/dev/null | sed 's/^/     | /' || true
    docker system prune -f >/dev/null 2>&1 || true
    df -h "$DOCKER_ROOT" 2>/dev/null | tail -n 1 | sed 's/^/     | /' || true
    docker system df 2>/dev/null | sed 's/^/     | /' || true
    TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
      docker compose -f "$COMPOSE_FILE" pull
  else
    echo "    пул не прошёл — повтор через 20с (линия VPS→ghcr.io нестабильна)"
    sleep 20
    TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
      docker compose -f "$COMPOSE_FILE" pull
  fi
fi
rm -f "$PULL_LOG"

# ---------- 0.3. Первый запуск: подготовить БД-контейнер ----------
if ! docker compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q "scoresbox-db"; then
  echo "==> Первый запуск: старт PostgreSQL"
  TAG="$TAG" DEPLOY_IMAGE="$DEPLOY_IMAGE" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    docker compose -f "$COMPOSE_FILE" up -d db
fi

# ждём готовности PostgreSQL (после старта контейнеру нужно несколько секунд)
echo "==> Ждём готовности PostgreSQL"
PG_READY=0
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U scoresbox -d scoresbox >/dev/null 2>&1; then
    PG_READY=1; break
  fi
  sleep 2
done
# v1.0.45: раньше при неготовности PG цикл молча исчерпывался, и скрипт
# шёл дальше «на удачу» до шага бэкапа — фиксируем отказ явно
if [ "$PG_READY" != "1" ]; then
  echo "!! PostgreSQL не готов за 60с — деплой ОСТАНОВЛЕН (бэкап невозможен)."
  docker compose -f "$COMPOSE_FILE" ps db 2>&1 | tail -n 3 || true
  exit 1
fi

# ---------- 1. Бэкап PostgreSQL (pg_dump перед изменениями) ----------
# v1.0.44 (аудит №17): провал бэкапа = СТОП деплоя (раньше ПУСТОЙ файл
# pg-*.dump «подтверждал» наличие бэкапа, и миграции стартовали без него).
# v1.0.45 (инцидент деплоя v1.0.44, 2026-10-05): проверка pg_restore
# запускалась на ХОСТЕ VPS — postgres-клиентов там НЕТ (весь PostgreSQL
# живёт в docker): «command not found» (127) останавливал деплой при
# РАБОЧЕМ pg_dump, а stderr проверки уходил в /dev/null — файл pg-*.err
# оставался пустым. Теперь дамп И проверка выполняются ВНУТРИ контейнера
# db одной цепочкой: pg_dump -f /tmp/scoresbox-verify.dump -> pg_restore
# --list (по файлу) -> cat наружу в .part на хосте. cat стоит ПОСЛЕ
# проверки: .part появляется только у проверенного дампа; провал любого
# звена = пустой вывод + ненулевой код — СТОП с печатью причины в лог CI.
TS=$(date +%Y%m%d-%H%M%S)
echo "==> Бэкап БД (pg_dump + проверка, внутри контейнера db)"
if docker compose -f "$COMPOSE_FILE" ps db 2>/dev/null | grep -q "running\|healthy"; then
  TMP_DUMP="$BACKUP_DIR/pg-$TS.dump.part"
  rm -f "$TMP_DUMP"
  if docker compose -f "$COMPOSE_FILE" exec -T db sh -c 'pg_dump -U scoresbox -d scoresbox --no-owner --format=custom -f /tmp/scoresbox-verify.dump && pg_restore --list /tmp/scoresbox-verify.dump >/dev/null && cat /tmp/scoresbox-verify.dump && rm -f /tmp/scoresbox-verify.dump' > "$TMP_DUMP" 2>"$BACKUP_DIR/pg-$TS.err" \
    && [ -s "$TMP_DUMP" ]; then
    mv "$TMP_DUMP" "$BACKUP_DIR/pg-$TS.dump"
    rm -f "$BACKUP_DIR/pg-$TS.err"
    echo "    бэкап: $BACKUP_DIR/pg-$TS.dump ($(du -h "$BACKUP_DIR/pg-$TS.dump" | cut -f1)) — проверен pg_restore --list в контейнере db"
  else
    rm -f "$TMP_DUMP"
    echo "!! Бэкап не прошёл проверку — деплой ОСТАНОВЛЕН."
    echo "   Продолжать миграции без бэкапа нельзя. Причина (stderr шага бэкапа):"
    if [ -s "$BACKUP_DIR/pg-$TS.err" ]; then
      tail -n 15 "$BACKUP_DIR/pg-$TS.err" | sed 's/^/     | /'
    else
      echo "     | stderr пуст — дамп не создан или поток оборвался (окружение ниже)"
    fi
    echo "   Окружение:"
    docker compose -f "$COMPOSE_FILE" ps db 2>&1 | tail -n 3 | sed 's/^/     | /' || true
    df -h "$APP_DIR" 2>/dev/null | tail -n 1 | sed 's/^/     | /' || true
    echo "   Полный stderr сохранён на сервере: $BACKUP_DIR/pg-$TS.err"
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
# v1.0.52: старые ТЕГИ чистятся в шаге 0 (до пулла); здесь — только
# dangling (кривые/осиротевшие слои), без label-фильтра из v1.0.45 —
# тот был no-op для CI-образов из ghcr (см. шаг 0).
docker image prune -f >/dev/null 2>&1 || true

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

# ---------- 7. Ротация бэкапов (30 дней; .err от провалов тоже не копим) ----------
find "$BACKUP_DIR" \( -name "pg-*.dump" -o -name "pg-*.err" \) -mtime +30 -delete 2>/dev/null || true

echo "==> Деплой $TAG завершён успешно"
