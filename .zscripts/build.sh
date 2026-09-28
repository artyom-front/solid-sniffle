#!/usr/bin/env bash
# ============================================================
# SCORESBOX · .zscripts/build.sh — скрипт кнопки «Deploy»
# ------------------------------------------------------------
# Платформа (ZAI-сервис) запускает ЭТОТ файл при нажатии Deploy/
# Preview и ждёт артефакт: /tmp/build_fullstack_${BUILD_ID}.tar.gz
# Артефакт разворачивается на отдельном FC-рантайме, где его
# start.sh поднимает Caddy (:81) + приложение (:3000).
#
# Отличие от типовых проектов: SCORESBOX работает на PostgreSQL,
# поэтому в артефакт упаковывается embedded-PostgreSQL 16 + дамп
# данных (pgdata со демо-сидом), а start-preview.sh поднимает его
# на рантайме. Превью работает на ТОМ ЖЕ движке БД, что и прод.
# ============================================================
exec 2>&1

set -euo pipefail

cd /home/z/my-project
export NEXT_TELEMETRY_DISABLED=1

BUILD_ID="${BUILD_ID:?BUILD_ID не задан платформой}"
BUILD_DIR="/tmp/build_fullstack_$BUILD_ID"
echo "==> build.sh: SCORESBOX, BUILD_ID=$BUILD_ID"

# ---------- 1. Зависимости и Prisma-клиент ----------
if [ ! -x node_modules/.bin/next ] || [ ! -x node_modules/.bin/prisma ]; then
  echo "==> bun install (зависимости)"
  bun install
fi
echo "==> prisma generate"
bunx prisma generate

# ---------- 2. PostgreSQL + схема + демо-данные ----------
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"
ZPG=.zscripts/pg
ICU_DIR="$ZPG/node_modules/@embedded-postgres/linux-x64/native/lib"

if [ ! -d "$ZPG/node_modules/embedded-postgres" ]; then
  if [ -d /home/sync/pg-cache/node_modules ]; then
    echo "==> postgres-бинарники из кэша /home/sync"
    mkdir -p "$ZPG"; cp -a /home/sync/pg-cache/node_modules "$ZPG/node_modules"
  else
    echo "==> установка embedded-postgres (npm)"
    (cd "$ZPG" && bun install)
  fi
fi
if [ ! -f "$ICU_DIR/libicudata.so.60" ]; then
  if [ -d /home/sync/pg-cache/icu ]; then
    cp -a /home/sync/pg-cache/icu/. "$ICU_DIR/"
  else
    echo "==> загрузка libicu60"
    (cd "$ZPG" && \
      curl -sfL --max-time 90 -o icu.deb \
        http://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu60_60.2-3ubuntu3_amd64.deb && \
      mkdir -p icu-extract && dpkg -x icu.deb icu-extract/ && \
      cp icu-extract/usr/lib/x86_64-linux-gnu/libicu{data,i18n,uc}.so.60* "$ICU_DIR/")
  fi
fi

if ! (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  echo "==> старт PostgreSQL (keeper)"
  nohup bun "$ZPG/keeper.mjs" > .zscripts/pg-keeper.log 2>&1 &
fi
for i in $(seq 1 60); do
  (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && break
  sleep 1
done
(exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null || { echo "!! PostgreSQL не поднялся"; tail -20 .zscripts/pg-keeper.log; exit 1; }

echo "==> prisma db push"
bunx prisma db push --accept-data-loss
echo "==> демо-данные (если база пуста)"
bun .zscripts/seed-if-empty.mjs

# ---------- 3. Сборка Next.js (standalone) ----------
echo "==> bun run build"
bun run build
if [ ! -f .next/standalone/server.js ]; then
  echo "!! сборка не дала .next/standalone/server.js (нужен output:\"standalone\")"
  exit 1
fi

# ---------- 4. Снимок БД: аккуратно останавливаем postgres ----------
echo "==> снимок pgdata для артефакта"
KEEPER_PID=$(pgrep -f "keeper.mjs" | head -1 || true)
[ -n "$KEEPER_PID" ] && kill -TERM "$KEEPER_PID" 2>/dev/null || true
PG_PID=$(pgrep -f "postgres -D" | head -1 || true)
[ -n "$PG_PID" ] && kill -TERM "$PG_PID" 2>/dev/null || true
for i in $(seq 1 30); do
  (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null || break
  sleep 1
done
PGDATA_SRC="$ZPG/pgdata"
SNAP=/tmp/pgdata-snapshot
rm -rf "$SNAP"; mkdir -p "$SNAP"
cp -a "$PGDATA_SRC/." "$SNAP/"
rm -f "$SNAP/postmaster.pid" "$SNAP"/postmaster.opts

# сразу возвращаем БД песочнице (dev-превью продолжает работать)
if ! (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  nohup bun "$ZPG/keeper.mjs" > .zscripts/pg-keeper.log 2>&1 &
  for i in $(seq 1 30); do
    (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && break
    sleep 1
  done
fi

# ---------- 5. Сборка артефакта ----------
echo "==> сборка артефакта $BUILD_DIR"
rm -rf "$BUILD_DIR"; mkdir -p "$BUILD_DIR"

# Next.js standalone (внутри уже static + public — скриптом build)
cp -r .next/standalone "$BUILD_DIR/next-service-dist/"
mkdir -p "$BUILD_DIR/next-service-dist/.next"
cp -r .next/static "$BUILD_DIR/next-service-dist/.next/" 2>/dev/null || true
cp -r public "$BUILD_DIR/next-service-dist/" 2>/dev/null || true

# PostgreSQL-рантайм: бинарники + библиотеки + share (таймзоны!) + данные
# ⚠ share ОБЯЗАТЕЛЕН: без него postgres гибнет с FATAL
# «could not open directory .../pg/share/postgresql/timezone» —
# именно это убивало превью-деплой 04.09.2026.
NATIVE="$ZPG/node_modules/@embedded-postgres/linux-x64/native"
mkdir -p "$BUILD_DIR/pg"
cp -r "$NATIVE/bin" "$BUILD_DIR/pg/bin"
cp -r "$NATIVE/lib" "$BUILD_DIR/pg/lib"
cp -r "$NATIVE/share" "$BUILD_DIR/pg/share"
cp -a "$SNAP" "$BUILD_DIR/pg/pgdata"

# Caddy + стартовый скрипт рантайма
cp Caddyfile "$BUILD_DIR/Caddyfile"
cp .zscripts/start-preview.sh "$BUILD_DIR/start.sh"
chmod +x "$BUILD_DIR/start.sh"

# ---------- 6. Тарболл ----------
PACKAGE="${BUILD_DIR}.tar.gz"
echo "==> упаковка $PACKAGE"
tar -czf "$PACKAGE" -C "$BUILD_DIR" .
ls -lh "$PACKAGE"
echo "==> build.sh: ГОТОВО"
