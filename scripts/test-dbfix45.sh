#!/usr/bin/env bash
# ============================================================
# SCORESBOX · test-dbfix45.sh — проверка логики блока бэкапа из
# scripts/deploy.sh (v1.0.45) БЕЗ docker и PostgreSQL.
#
# Контекст: деплой v1.0.44 (2026-10-05) падал на шаге «Бэкап не
# прошёл проверку» — pg_dump работал ВНУТРИ контейнера db, а
# pg_restore --list запускался на ХОСТЕ VPS, где postgres-клиентов
# нет. Новый блок гоняет дамп и проверку одной цепочкой внутри
# контейнера. Этот тест эмулирует контейнер: PATH с заглушками
# pg_dump/pg_restore + В ТОЧНО ТАКУЮ ЖЕ команду sh -c '...', что в
# deploy.sh. Режимы:
#   ok         — всё работает: дамп выходит наружу целиком, exit 0
#   dumpfail   — pg_dump падает: пустой вывод, exit != 0 (СТОП)
#   verifyfail — pg_restore --list падает: cat НЕ выполняется,
#                вывод пуст, exit != 0 (СТОП) — главный сценарий
#                инцидента (кривой дамп не должен покидать контейнер)
# Запуск: bash scripts/test-dbfix45.sh [режим]  (по умолчанию — все 3)
# ============================================================
set -euo pipefail

# В ТОЧНО ТАКУЮ ЖЕ команду sh -c '...', что в deploy.sh — если
# там поменяли путь/флаги, тест надо синхронизировать.
INNER='pg_dump -U scoresbox -d scoresbox --no-owner --format=custom -f /tmp/scoresbox-verify.dump && pg_restore --list /tmp/scoresbox-verify.dump >/dev/null && cat /tmp/scoresbox-verify.dump && rm -f /tmp/scoresbox-verify.dump'

DUMP_MAGIC="PGDMP-FAKE-DATA-BLOB-0123456789"

run_case() {
  local mode="$1"
  local work="$ROOT/$mode"
  local bin="$work/bin"
  mkdir -p "$bin" "$work/backups"

  # заглушки инструментов «контейнера»
  cat > "$bin/pg_dump" <<STUB
#!/usr/bin/env sh
if [ "\$DBFIX_MODE" = dumpfail ]; then
  echo "pg_dump: error: stub failure" >&2
  exit 1
fi
printf '%s' "\$DBFIX_MAGIC" > /tmp/scoresbox-verify.dump
STUB
  cat > "$bin/pg_restore" <<STUB
#!/usr/bin/env sh
if [ "\$DBFIX_MODE" = verifyfail ]; then
  echo "pg_restore: error: stub verify failure" >&2
  exit 1
fi
# настоящий pg_restore требует непустой читаемый архив
[ -s /tmp/scoresbox-verify.dump ] || exit 1
exit 0
STUB
  chmod +x "$bin/pg_dump" "$bin/pg_restore"
  rm -f /tmp/scoresbox-verify.dump

  local part="$work/backups/pg-TEST.dump.part"
  local err="$work/backups/pg-TEST.err"
  rm -f "$part" "$err"

  local rc=0
  if DBFIX_MODE="$mode" DBFIX_MAGIC="$DUMP_MAGIC" PATH="$bin:$PATH" sh -c "$INNER" \
      > "$part" 2>"$err" \
    && [ -s "$part" ]; then
    rc=0
  else
    rc=1
  fi

  echo "-- режим $mode: rc=$rc, .part=$( [ -s "$part" ] && echo non-empty || echo empty ), .err=$( [ -s "$err" ] && echo non-empty || echo empty )"

  case "$mode" in
    ok)
      # дамп целиком снаружи, временный файл удалён, err пуст
      if [ "$rc" = 0 ] && grep -q 'PGDMP-FAKE-DATA-BLOB' "$part" \
         && [ ! -e /tmp/scoresbox-verify.dump ] && [ ! -s "$err" ]; then
        echo "   PASS: проверенный дамп вышел наружу целиком, /tmp-файл удалён"
        return 0
      fi
      echo "   FAIL: успех должен давать полный дамп и чистый stderr"
      return 1
      ;;
    dumpfail | verifyfail)
      # СТОП: вывод пуст (мусорный .part не остаётся), код ненулевой
      if [ "$rc" = 1 ] && [ ! -s "$part" ] && [ -s "$err" ]; then
        echo "   PASS: деплой остановлен, .part пуст, причина в stderr"
        return 0
      fi
      echo "   FAIL: провал обязан давать пустой вывод + ненулевой код"
      return 1
      ;;
    *)
      echo "   FAIL: неизвестный режим $mode"
      return 1
      ;;
  esac
}

ROOT="$(pwd)/.tmp-dbfix45"
rm -rf "$ROOT"
trap 'rm -rf "$ROOT"; rm -f /tmp/scoresbox-verify.dump' EXIT

echo "==> test-dbfix45: логика блока бэкапа deploy.sh (v1.0.45)"
fail=0
for m in ok dumpfail verifyfail; do
  run_case "$m" || fail=1
done
if [ "$fail" = 1 ]; then
  echo "!! test-dbfix45: ЕСТЬ ПРОВАЛЫ"
  exit 1
fi
echo "==> test-dbfix45: 3/3 PASS"
