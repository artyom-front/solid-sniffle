#!/usr/bin/env bash
# ============================================================
# make-pg-schema.sh — генерирует PostgreSQL-вариант Prisma-схемы
# из основной (SQLite, демо-среда). Вся доменная модель идентична,
# меняется только провайдер и URL.
#
# Использование:  bash scripts/make-pg-schema.sh
# Результат:      prisma/postgres/schema.prisma
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/prisma/schema.prisma"
DST_DIR="$ROOT/prisma/postgres"
DST="$DST_DIR/schema.prisma"

mkdir -p "$DST_DIR"

# 1) копируем схему с заменой провайдера
sed -e 's|provider = "sqlite"|provider = "postgresql"|' \
    -e 's|url      = env("DATABASE_URL")|url      = env("DATABASE_URL_PG")|' \
    "$SRC" > "$DST"

# 2) клиент в отдельный каталог — чтобы не перезаписать SQLite-клиент приложения
python3 - "$DST" <<'EOF'
import io, sys
path = sys.argv[1]
s = io.open(path, encoding='utf-8').read()
old = 'generator client {\n  provider = "prisma-client-js"\n}'
new = 'generator client {\n  provider = "prisma-client-js"\n  output   = "../../generated/pg-client"\n}'
if old in s:
    s = s.replace(old, new)
io.open(path, 'w', encoding='utf-8').write(s)
EOF

echo "✅ PostgreSQL-схема: $DST"
echo "   далее: DATABASE_URL_PG=postgresql://… bunx prisma migrate deploy --schema prisma/postgres/schema.prisma"
