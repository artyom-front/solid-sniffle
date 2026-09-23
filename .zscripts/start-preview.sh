#!/bin/bash
# ============================================================
# SCORESBOX · start.sh рантайма превью (уезжает в артефакт Deploy)
# Запускается платформой на FC-инстансе из корня артефакта.
# Поднимает: embedded PostgreSQL 16 (порт 5432) → Next.js
# standalone (:3000) → Caddy (:81, основной процесс).
# ============================================================
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

LIB="$DIR/pg/lib"
export LD_LIBRARY_PATH="$LIB"

# ---------- PostgreSQL ----------
# pgdata копируем в /tmp: каталог артефакта может быть read-only
PGDATA_SRC="$DIR/pg/pgdata"
PGDATA=/tmp/scoresbox-pgdata
if [ ! -d "$PGDATA" ]; then
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"
  cp -a "$PGDATA_SRC/." "$PGDATA/"
  rm -f "$PGDATA/postmaster.pid"
fi

if ! (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null; then
  echo "[start] запуск PostgreSQL..."
  if [ "$(id -u)" = "0" ]; then
    chown -R nobody "$PGDATA" 2>/dev/null || chmod -R 777 "$PGDATA"
    su nobody -s /bin/bash -c "\"$DIR/pg/bin/postgres\" -D \"$PGDATA\" -p 5432 -k /tmp" > /tmp/pg.log 2>&1 &
  else
    "$DIR/pg/bin/postgres" -D "$PGDATA" -p 5432 -k /tmp > /tmp/pg.log 2>&1 &
  fi
  for i in $(seq 1 60); do
    (exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && break
    sleep 1
  done
fi
(exec 3<>/dev/tcp/127.0.0.1/5432) 2>/dev/null && echo "[start] PostgreSQL: готов" || echo "[start] !! PostgreSQL не поднялся (см. /tmp/pg.log)"

# ---------- Next.js (standalone) ----------
export NODE_ENV=production
export PORT="${PORT:-3000}"
export HOSTNAME=0.0.0.0
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public"
echo "[start] запуск Next.js на :$PORT..."
cd "$DIR/next-service-dist" || exit 1
bun server.js > /tmp/next.log 2>&1 &
NEXT_PID=$!
sleep 2
if kill -0 "$NEXT_PID" 2>/dev/null; then
  echo "[start] Next.js работает (PID $NEXT_PID)"
else
  echo "[start] !! Next.js упал (см. /tmp/next.log)"; tail -20 /tmp/next.log || true
fi
cd "$DIR"

# ---------- Caddy (основной процесс) ----------
echo "[start] запуск Caddy на :81"
exec caddy run --config "$DIR/Caddyfile" --adapter caddyfile
