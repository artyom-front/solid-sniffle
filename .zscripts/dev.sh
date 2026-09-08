#!/usr/bin/env bash
# ============================================================
# SCORESBOX · .zscripts/dev.sh — бут-флоу песочницы z.ai
# ------------------------------------------------------------
# Платформа при старте контейнера ищет ЭТОТ файл и запускает
# его ВМЕСТО стандартного bun-install + db:push + dev.
#
# Зачем он нужен: проект работает на PostgreSQL (золотой
# стандарт: dev/CI/prod на одном движке), а песочница — контейнер
# без Docker. Поэтому PostgreSQL 16 поднимается здесь как
# embedded-процесс (user-space, без root, без docker).
#
# Файл коммитится в git только чтобы переживать пересборку
# песочницы (repo.tar = tracked-файлы). Прод и CI его не читают.
# ============================================================
set -uo pipefail   # без -e: бут обязан дожить до dev-сервера
cd /home/z/my-project

echo "[dev.sh] SCORESBOX sandbox boot: $(date '+%F %T')"

# ---------- 0. DATABASE_URL (перекрывает вшитый платформой sqlite-путь) ----------
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"
{
  echo "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"
  echo "SHOW_DEMO_ACCOUNTS=1"
} > .env

# ---------- 1. Зависимости проекта ----------
if [ ! -x node_modules/.bin/prisma ] || [ ! -x node_modules/.bin/next ]; then
  echo "[dev.sh] bun install (зависимости проекта)..."
  bun install
fi
echo "[dev.sh] prisma generate..."
bunx prisma generate

# ---------- 2. Embedded PostgreSQL ----------
ZPG=.zscripts/pg
if [ ! -d "$ZPG/node_modules/embedded-postgres" ]; then
  # быстрый путь: кэш из /home/sync (том переживает пересборку песочницы)
  if [ -d /home/sync/pg-cache/node_modules ]; then
    echo "[dev.sh] восстановление postgres-бинарников из кэша /home/sync/pg-cache"
    mkdir -p "$ZPG"
    cp -a /home/sync/pg-cache/node_modules "$ZPG/node_modules"
  else
    echo "[dev.sh] установка embedded-postgres (npm)"
    (cd "$ZPG" && bun install)
  fi
fi

# ICU60: бинарники postgres слинкованы с ICU 60, в системе песочницы ICU 76
ICU_DIR="$ZPG/node_modules/@embedded-postgres/linux-x64/native/lib"
if [ ! -f "$ICU_DIR/libicudata.so.60" ]; then
  if [ -d /home/sync/pg-cache/icu ]; then
    echo "[dev.sh] ICU60 из кэша /home/sync"
    cp -a /home/sync/pg-cache/icu/. "$ICU_DIR/"
  else
    echo "[dev.sh] загрузка libicu60 (Ubuntu archive)..."
    (cd "$ZPG" && \
      curl -sfL --max-time 90 -o icu.deb \
        http://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu60_60.2-3ubuntu3_amd64.deb && \
      mkdir -p icu-extract && dpkg -x icu.deb icu-extract/ && \
      cp icu-extract/usr/lib/x86_64-linux-gnu/libicudata.so.60* \
         icu-extract/usr/lib/x86_64-linux-gnu/libicui18n.so.60* \
         icu-extract/usr/lib/x86_64-linux-gnu/libicuuc.so.60* \
         "$ICU_DIR/")
  fi
fi

# ---------- 3. Запуск БД (keeper живёт, пока жив контейнер) ----------
if ! (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  echo "[dev.sh] старт PostgreSQL (keeper)..."
  nohup bun "$ZPG/keeper.mjs" > .zscripts/pg-keeper.log 2>&1 &
fi
for i in $(seq 1 60); do
  if (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then break; fi
  sleep 1
done
if ! (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  echo "[dev.sh] !! PostgreSQL не поднялся за 60с — см. .zscripts/pg-keeper.log"
fi

# ---------- 4. Схема и демо-данные ----------
echo "[dev.sh] prisma db push..."
bunx prisma db push --accept-data-loss
echo "[dev.sh] демо-данные (только если база пуста)..."
bun .zscripts/seed-if-empty.mjs

# ---------- 5. Dev-сервер (платформа ждёт его на :3000) ----------
echo "[dev.sh] запуск next dev на :3000..."
exec bun run dev
