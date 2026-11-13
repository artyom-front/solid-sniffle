#!/usr/bin/env bash
# ============================================================
# SCORESBOX · test-diskfix52.sh — проверка дисковых блоков из
# scripts/deploy.sh (v1.0.52) БЕЗ docker и VPS.
#
# Контекст: деплой v1.0.51 (2026-10-07) упал на «no space left on
# device» — извлечение слоёв в overlayfs. deploy.sh v1.0.52 получил:
# (0) чистку старых ТЕГОВ образа, (0.1) диск-префлайт, (0.2) пулл
# с распознаванием дискового отказа (чистка+повтор вместо слепого
# ретрая). Этот тест вырезает блоки из deploy.sh ПО МАРКЕРАМ
# (рассинхрон невозможен) и гоняет их на заглушках docker/df/sleep.
# Режимы: cleanup | preflight-ok | preflight-low | preflight-recover
#         | pull-diskfail | pull-diskfail-hard | pull-netfail
# Запуск: bash scripts/test-diskfix52.sh [режим]  (по умолчанию — все)
# ============================================================
set -euo pipefail
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
HERE="$(cd "$(dirname "$0")" && pwd)"
DEPLOY="$HERE/deploy.sh"

# ---------- вырезаем блоки из deploy.sh по маркерам ----------
cut_block() { # $1=начальный маркер, $2=конечный маркер
  sed -n "/$1/,/$2/p" "$DEPLOY" | sed '1d;$d'
}
BLOCK_CLEANUP="$(cut_block '^# ---------- 0\. Чистка' '^# ---------- 0\.1')"
BLOCK_PREFLIGHT="$(cut_block '^# ---------- 0\.1' '^# ---------- 0\.2')"
BLOCK_PULL="$(cut_block '^# ---------- 0\.2' '^# ---------- 0\.3')"

# ---------- общая заглушка docker ----------
make_docker_stub() { # $1 = каталог заглушек
  cat > "$1/docker" <<'STUB'
#!/usr/bin/env sh
S="$STUB_DIR"
case "$1" in
  images)
    printf '%s\n' \
      "ghcr.io/artyom-front/solid-sniffle 1.0.44" \
      "ghcr.io/artyom-front/solid-sniffle 1.0.45" \
      "ghcr.io/artyom-front/solid-sniffle 1.0.49" \
      "ghcr.io/artyom-front/solid-sniffle 1.0.50" \
      "ghcr.io/artyom-front/solid-sniffle 1.0.51" \
      "ghcr.io/artyom-front/solid-sniffle <none>" \
      "postgres 16-alpine" \
      "ghcr.io/other/thing 9.9.9"
    ;;
  rmi)
    echo "$2" >> "$S/rmi.log"
    ;;
  info)
    echo "$S/dockerroot"
    ;;
  image)
    [ "$2" = prune ] && echo "prune" >> "$S/prune.log"
    ;;
  system)
    case "$2" in
      prune) echo "system-prune" >> "$S/prune.log" ;;
      df) echo "TYPE TOTAL ACTIVE SIZE RECLAIMABLE" ; echo "Images 8 2 4.2GB 3.1GB" ;;
    esac
    ;;
  compose)
    # docker compose -f <file> pull
    n=$(cat "$S/pull.count" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$S/pull.count"
    if [ "$DF_PULL_MODE" = diskfail ] || { [ "$DF_PULL_MODE" = diskfail-hard ] && [ "$n" -le 2 ]; }; then
      echo "failed to extract layer (application/vnd.oci.image.layer.v1.tar+gzip sha256:80bc37) to overlayfs: write .../libquery_engine-debian-openssl-3.0.x.so.node: no space left on device" >&2
      [ "$DF_PULL_MODE" = diskfail ] && exit 1
      exit 1
    fi
    if [ "$DF_PULL_MODE" = netfail ] && [ "$n" = 1 ]; then
      echo 'Error response from daemon: Get "https://ghcr.io/v2/": dial tcp: i/o timeout' >&2
      exit 1
    fi
    echo "Pulled ghcr.io/artyom-front/solid-sniffle:1.0.51"
    ;;
esac
STUB
  chmod +x "$1/docker"
  mkdir -p "$1/dockerroot"
}

# ---------- заглушка df (управляется DF_AVAIL_KB / DF_AVAIL_KB_2) ----------
make_df_stub() { # $1 = каталог заглушек
  cat > "$1/df" <<'STUB'
#!/usr/bin/env sh
if [ "${1:-}" = "-Pk" ]; then
  n=$(cat "$STUB_DIR/df.count" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$STUB_DIR/df.count"
  if [ "$n" = 1 ]; then kb="${DF_AVAIL_KB:-10485760}"; else kb="${DF_AVAIL_KB_2:-${DF_AVAIL_KB:-10485760}}"; fi
  printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
  printf 'overlay %s 1000000 %s 50%% /\n' "$((kb + 1000000))" "$kb"
  exit 0
fi
printf 'Filesystem Size Used Avail Use%% Mounted on\n'
printf 'overlay 10G 5G 5G 50%% /\n'
STUB
  chmod +x "$1/df"
  printf '#!/usr/bin/env sh\nexit 0\n' > "$1/sleep" && chmod +x "$1/sleep"
}

# окружение, единое для всех кейсов
env_common() { # $1 = каталог заглушек
  cat > "$1/env.sh" <<EOF
export STUB_DIR="$1"
export TAG="1.0.51"
export PREVIOUS_TAG="1.0.50"
export DEPLOY_IMAGE="ghcr.io/artyom-front/solid-sniffle"
export COMPOSE_FILE="deploy/docker-compose.prod.yml"
export POSTGRES_PASSWORD="stub"
export DOCKER_ROOT="$1/dockerroot"
export PATH="$1:\$PATH"
EOF
}

run_case() {
  local mode="$1"
  local work="$ROOT/$mode"
  mkdir -p "$work"
  make_docker_stub "$work"
  make_df_stub "$work"
  env_common "$work"

  case "$mode" in
    cleanup)
      bash -c ". '$work/env.sh'; $BLOCK_CLEANUP" > "$work/out.log" 2>&1
      # жёсткая проверка: удалены 1.0.44/1.0.45/1.0.49; сохранены 1.0.50 и 1.0.51
      grep -q "solid-sniffle:1.0.44$" "$work/rmi.log" && grep -q ":1.0.45$" "$work/rmi.log" && grep -q ":1.0.49$" "$work/rmi.log"
      if grep -qE ":1\.0\.50$|:1\.0\.51$|postgres|other" "$work/rmi.log"; then
        echo "FAIL($mode): удалён тег из keep-сета или чужой образ"; cat "$work/rmi.log"; return 1
      fi
      [ "$(wc -l < "$work/rmi.log")" = 3 ] || { echo "FAIL($mode): rmi вызван $(wc -l < "$work/rmi.log") раз"; return 1; }
      echo "PASS($mode): чистит старые теги, хранит 1.0.50+1.0.51, чужие не трогает"
      ;;
    preflight-ok)
      DF_AVAIL_KB=10485760 bash -c ". '$work/env.sh'; $BLOCK_PREFLIGHT" > "$work/out.log" 2>&1
      [ ! -f "$work/prune.log" ] && ! grep -q "ОСТАНОВЛЕН" "$work/out.log"
      echo "PASS($mode): 10 ГБ свободно — пре-флайт молча пропускает"
      ;;
    preflight-low)
      DF_AVAIL_KB=1048576 DF_AVAIL_KB_2=1048576 bash -c ". '$work/env.sh'; $BLOCK_PREFLIGHT" > "$work/out.log" 2>&1 && rc=0 || rc=$?
      [ "$rc" = 1 ] || { echo "FAIL($mode): rc=$rc, ожидался стоп 1"; cat "$work/out.log"; return 1; }
      grep -q "Диск переполнен" "$work/out.log" && grep -q "docker image prune -a -f" "$work/out.log"
      grep -q "prune" "$work/prune.log"
      echo "PASS($mode): 1 ГБ и чистка не помогла — СТОП с подсказками"
      ;;
    preflight-recover)
      DF_AVAIL_KB=1048576 DF_AVAIL_KB_2=10485760 bash -c ". '$work/env.sh'; $BLOCK_PREFLIGHT" > "$work/out.log" 2>&1
      grep -q "чистим dangling" "$work/out.log" && ! grep -q "ОСТАНОВЛЕН" "$work/out.log"
      grep -q "prune" "$work/prune.log"
      echo "PASS($mode): чистка освободила место — деплой продолжается"
      ;;
    pull-diskfail)
      DF_PULL_MODE=diskfail bash -c ". '$work/env.sh'; set -euo pipefail; $BLOCK_PULL" > "$work/out.log" 2>&1
      grep -q "Диск переполнен при извлечении" "$work/out.log" && grep -q "повтор через 20с" "$work/out.log" && ! grep -q "повтор через 20с" "$work/out.log"
      [ "$(cat "$work/pull.count")" = 2 ]
      grep -q "prune" "$work/prune.log" && grep -q "system-prune" "$work/prune.log"
      echo "PASS($mode): no-space распознан, чистка+повтор, слепого ретрая нет"
      ;;
    pull-diskfail-hard)
      DF_PULL_MODE=diskfail-hard bash -c ". '$work/env.sh'; set -euo pipefail; $BLOCK_PULL" > "$work/out.log" 2>&1 && rc=0 || rc=$?
      [ "$rc" != 0 ] || { echo "FAIL($mode): повторный провал должен ронять шаг"; cat "$work/out.log"; return 1; }
      grep -q "Диск переполнен при извлечении" "$work/out.log"
      echo "PASS($mode): чистка не помогла — деплой падает честно (rc=$rc)"
      ;;
    pull-netfail)
      DF_PULL_MODE=netfail bash -c ". '$work/env.sh'; set -euo pipefail; $BLOCK_PULL" > "$work/out.log" 2>&1
      grep -q "повтор через 20с" "$work/out.log" && ! grep -q "Диск переполнен при извлечении" "$work/out.log"
      [ "$(cat "$work/pull.count")" = 2 ]
      echo "PASS($mode): сетевой обрыв — прежний ретрай через 20с"
      ;;
    *) echo "FAIL: неизвестный режим $mode"; return 1 ;;
  esac
}

if [ $# -gt 0 ]; then
  run_case "$1"
else
  fail=0
  for m in cleanup preflight-ok preflight-low preflight-recover pull-diskfail pull-diskfail-hard pull-netfail; do
    run_case "$m" || fail=1
  done
  [ "$fail" = 0 ] && echo "ИТОГ: 7/7 PASS" || { echo "ИТОГ: есть FAIL"; exit 1; }
fi
