#!/usr/bin/env bash
# ============================================================
# restore-db.sh — ДРИЛЛ ВОССТАНОВЛЕНИЯ из последнего бэкапа.
# Бэкап, который не проверяли восстановлением, — это не бэкап.
#
# Запуск:  bash scripts/restore-db.sh
# Что делает:
#   1) берёт последний файл из db/backups/;
#   2) разворачивает его в db/restore-test.db;
#   3) прогоняет проверку целостности (integrity_check + счётчики
#      таблиц через Prisma) — scripts/verify-restore.ts;
#   4) печатает вердикт. Прод-файл db/custom.db НЕ трогается.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
TARGET="$ROOT/db/restore-test.db"

LATEST="$(ls -1t "$BACKUP_DIR"/scoresbox-*.db.gz "$BACKUP_DIR"/scores21-*.db.gz 2>/dev/null | head -1 || true)"
if [ -z "$LATEST" ]; then
  echo "❌ Бэкапов нет в $BACKUP_DIR — сначала запустите scripts/backup-db.sh"
  exit 1
fi

echo "📦 Последний бэкап: $LATEST"
rm -f "$TARGET"
gunzip -c "$LATEST" > "$TARGET"
echo "🛠  Развёрнут в $TARGET ($(du -h "$TARGET" | cut -f1))"

# проверка целостности и счётчиков через Prisma (SQLite-клиент приложения)
DATABASE_URL="file:$TARGET" bun "$ROOT/scripts/verify-restore.ts"
RC=$?

if [ $RC -eq 0 ]; then
  echo "✅ ДРИЛЛ ПРОЙДЕН: бэкап восстановим, целостность подтверждена"
  echo "   (тестовый файл оставлен: $TARGET — можно удалить)"
else
  echo "❌ ДРИЛЛ ПРОВАЛЕН — бэкап непригоден! Проверьте backup-db.sh"
  exit $RC
fi
