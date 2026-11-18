#!/usr/bin/env bash
# ============================================================
# SCORESBOX · restore-db.sh — ДРИЛЛ ВОССТАНОВЛЕНИЯ PostgreSQL.
# «Бэкап, который не проверяли восстановлением, — это не бэкап».
#
# v1.0.44 (аудит №18): скрипт полностью переписан — до этого он
# искал SQLite-файлы (scoresbox-*.db.gz, db/restore-test.db,
# DATABASE_URL=file:...), хотя прод давно на PostgreSQL 16 и
# бэкапы делаются pg_dump --format=custom (pg-*.dump). Старый
# «drill» не работал вообще, создавая ложную уверенность.
#
# Запуск:  bash scripts/restore-db.sh
# Что делает:
#   1) берёт ПОСЛЕДНИЙ backups/pg-*.dump;
#   2) разворачивает его во временную БД scoresbox_restore_test
#      ВНУТРИ прод-контейнера PostgreSQL (прод-база НЕ трогается);
#   3) сверяет счётчики ключевых таблиц (person/team/league/season/
#      match/"user" + завершённые матчи со счётом) с прод-базой —
#      расхождение печатается рядом для ручной оценки;
#   4) печатает вердикт и УДАЛЯЕТ временную БД.
# Восстановление в прод (по решению человека, НЕ этим скриптом):
#   docker compose -f deploy/docker-compose.prod.yml exec -T db \
#     pg_restore -U scoresbox -d scoresbox --clean --if-exists \
#     --no-owner < backups/pg-XXXX.dump
# ============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

COMPOSE_FILE="deploy/docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
RESTORE_DB="scoresbox_restore_test"

# Пароль БД из .env (нужен compose-файлу)
set -a; [ -f .env ] && . ./.env; set +a
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD должен быть задан в .env}"

LATEST="$(ls -1t "$BACKUP_DIR"/pg-*.dump 2>/dev/null | head -1 || true)"
if [ -z "$LATEST" ]; then
  echo "❌ Бэкапов pg-*.dump нет в $BACKUP_DIR — сначала запустите scripts/deploy.sh или scripts/backup-db.sh"
  exit 1
fi

echo "📦 Последний бэкап: $LATEST ($(du -h "$LATEST" | cut -f1))"

# 0) дамп обязан читаться ещё ДО разворачивания
echo "==> Проверка дампа (pg_restore --list)"
if ! docker compose -f "$COMPOSE_FILE" exec -T db pg_restore --list "$LATEST" >/dev/null 2>&1; then
  # pg_restore внутри контейнера не видит хост-путь — проверяем через stdin
  if ! docker compose -f "$COMPOSE_FILE" exec -T db pg_restore --list < "$LATEST" >/dev/null 2>&1; then
    echo "❌ Дамп не читается (pg_restore --list падает) — бэкап повреждён!"
    exit 1
  fi
fi
echo "    дамп читается ✓"

# 1) чистая временная БД (прод не трогаем)
echo "==> Временная БД $RESTORE_DB"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U scoresbox -d postgres -q \
  -c "DROP DATABASE IF EXISTS $RESTORE_DB;"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U scoresbox -d postgres -q \
  -c "CREATE DATABASE $RESTORE_DB;"

# 2) разворачивание
echo "==> pg_restore → $RESTORE_DB"
if ! docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_restore -U scoresbox -d "$RESTORE_DB" --no-owner --no-privileges < "$LATEST"; then
  echo "❌ pg_restore упал — бэкап не восстанавливается целиком!"
  docker compose -f "$COMPOSE_FILE" exec -T db psql -U scoresbox -d postgres -q \
    -c "DROP DATABASE IF EXISTS $RESTORE_DB;"
  exit 1
fi
echo "    развёрнут ✓"

# 3) сверка счётчиков ключевых таблиц: восстановленная vs прод
echo "==> Счётчики таблиц (restore vs прод)"
TABLES=(person team league season match "\"user\"" match_event audit_log)
FAIL=0
for T in "${TABLES[@]}"; do
  R=$(docker compose -f "$COMPOSE_FILE" exec -T db psql -U scoresbox -d "$RESTORE_DB" -tAc "SELECT COUNT(*) FROM $T" 2>/dev/null | tr -d '[:space:]')
  P=$(docker compose -f "$COMPOSE_FILE" exec -T db psql -U scoresbox -d scoresbox -tAc "SELECT COUNT(*) FROM $T" 2>/dev/null | tr -d '[:space:]')
  R="${R:-err}"; P="${P:-err}"
  if [ "$R" = "err" ] || [ "$R" = "0" ] && [ "$T" != "audit_log" ]; then
    echo "  ✗ $T: restore=$R прод=$P (таблица пуста/ошибка — проверьте дамп)"
    FAIL=1
  else
    echo "  ✓ $T: restore=$R прод=$P"
  fi
done

# завершённые матчи обязаны иметь счёт (инвариант данных)
R_COMPLETED=$(docker compose -f "$COMPOSE_FILE" exec -T db psql -U scoresbox -d "$RESTORE_DB" -tAc \
  "SELECT COUNT(*) FROM \"match\" WHERE status='COMPLETED' AND \"homeScore\" IS NOT NULL" 2>/dev/null | tr -d '[:space:]')
echo "  ${R_COMPLETED:-0} завершённых матчей со счётом в восстановленной базе"
if [ "${R_COMPLETED:-0}" = "0" ]; then
  echo "  ⚠ в восстановленной базе нет завершённых матчей со счётом — если прод не пуст, дамп подозрительно мал"
fi

# 4) уборка временной БД
echo "==> Уборка временной БД"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U scoresbox -d postgres -q \
  -c "DROP DATABASE IF EXISTS $RESTORE_DB;"

if [ "$FAIL" = "1" ]; then
  echo "❌ ДРИЛЛ ПРОВАЛЕН: восстановление формально прошло, но данные неполны — разберитесь до следующего деплоя"
  exit 1
fi
echo "✅ ДРИЛЛ ПРОЙДЕН: бэкап $LATEST восстанавливается, счётчики на месте. Прод не затронут."
