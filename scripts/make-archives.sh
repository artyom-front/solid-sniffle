#!/usr/bin/env bash
# ============================================================
# SCORESBOX · make-archives.sh — сборка доставочных архивов
# 1. scoresbox-full.git-bundle  — git bundle --all (полная история)
# 2. scoresbox-source.zip       — git archive HEAD (только файлы репо)
# 3. scoresbox-update.git-bundle — тонкий бандл поверх 30e60c2
# 4. гайды (DEPLOY/PLAYBOOK) + README + versioned-бандлы
# Всё кладётся в download/ (панель файлов чата) и public/ (превью-ссылка).
# Папка download/ в .gitignore — при сбросе песочницы стирается,
# поэтому скрипт создаёт её сам: bash scripts/make-archives.sh.
#
# ПОЛИТИКА ХРАНЕНИЯ БАНДЛОВ (v1.0.24, требование юзера от 2026-09-20):
# ВСЕ versioned-бандлы начиная с v1.0.21 хранятся НАВСЕГДА в
# download/ и public/download/ — юзер всегда может скачать любую
# прошлую поставку. Чистятся ТОЛЬКО generic-имена (onefile).
# ⛔ ЗАПРЕЩЕНО: rm по маскам scoresbox-2026-* / scoresbox-20*.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE=download/scoresbox-full.git-bundle
ZIP=download/scoresbox-source.zip

mkdir -p download public

echo "==> Сборка git bundle (полная история)"
rm -f "$BUNDLE"
git bundle create "$BUNDLE" --all
git bundle verify "$BUNDLE" >/dev/null && echo "    bundle корректен"

echo "==> Сборка zip исходников (tracked-файлы)"
rm -f "$ZIP"
git archive --format=zip -o "$ZIP" HEAD
unzip -t "$ZIP" >/dev/null 2>&1 && echo "    zip без ошибок"

echo "==> Копии в public/ (раздача через превью-сервер)"
cp "$BUNDLE" public/scoresbox-full.git-bundle
cp "$ZIP" public/scoresbox-source.zip

echo "==> Тонкий update-бандл (только новые коммиты поверх 30e60c2)"
# 30e60c2 — коммит, которым завершалась предыдущая поставка bundle
# (то, что пользователь уже запушил в GitHub). Если у него репо есть —
# хватит маленького файла вместо 69 МБ.
UPDATE=download/scoresbox-update.git-bundle
rm -f "$UPDATE"
if git rev-parse --verify --quiet 30e60c2^{commit} >/dev/null; then
  git bundle create "$UPDATE" main ^30e60c2
  cp "$UPDATE" public/scoresbox-update.git-bundle
  echo "    update-бандл собран"
else
  echo "    (базовый коммит 30e60c2 не найден — update-бандл пропущен)"
fi

echo "==> Самодостаточный мини-бандл (один коммит, работает в ЛЮБОМ репозитории)"
# Имя файла содержит ДАТУ — чтобы пользователь сразу отличал актуальный бандл
# от скачанных ранее. Сообщение коммита внутри тоже начинается с даты:
# проверка «git log --oneline -1 FETCH_HEAD» должна показывать ту же дату.
ONEFILE=download/scoresbox-2026-09-24-deploytimeout.git-bundle
# Чистим ТОЛЬКО generic-имя. Versioned-бандлы (security/next35/stage2fix/
# hotfix24/…) НЕ трогаем — см. политику хранения в шапке скрипта.
rm -f download/scoresbox-onefile.git-bundle public/scoresbox-onefile.git-bundle
ROOT="$(pwd)"
SQUASH=/tmp/sb-squash
rm -rf "$SQUASH"
git clone -q . "$SQUASH"
( cd "$SQUASH" \
  && git checkout -q --orphan tmp-main \
  && { git rm -rq --cached public/download 2>/dev/null || true; } \
  && rm -rf public/download \
  && git commit -q -m "SCORESBOX 2026-09-24 deploytimeout: фикс отмены деплоя v1.0.26 — CD-джоба «Deploy → VPS» отменялась ровно на 10-й минуте (run 10m15s, SSH-шаг 9m58s) СВОИМ ЖЕ timeout-minutes:10, пока VPS качал из ghcr.io слой образа ~239MB по медленному линку (~400КБ/с). Сборка ЗЕЛЁНАЯ: CI-гейт пройден, образ в GHCR (фикс sonner подтверждён в реальном Docker); прод не тронут — отмена до переключения контейнеров. (1) cd.yml: deploy timeout 10→30 мин; (2) deploy.sh: явный docker compose pull с ретраем ДО миграций — сетевая фаза отделена от миграций; (3) bun.lock: синк спецификации sonner ^2.0.6; (4) version 1.0.27. Кода приложения НЕ меняли (дерево идентично v1.0.26), схема БД НЕ менялась — деплой стандартный тегом v1.0.27, миграций и ручных шагов нет. Воркараунд без обновления: pre-pull образа на VPS + Re-run failed jobs. Верификация: tsc 0, check-deps MISSING 0, unit 90/90, прод-сборка standalone OK, интеграция 24/24 на чистой БД (reset+seed), /api/health db:up" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-24-deploytimeout.git-bundle
git bundle verify "$ONEFILE" >/dev/null 2>&1 && echo "    onefile-бандл корректен: $ONEFILE"

echo "==> Гайды для чтения без git (только выжившие — дублей больше нет)"
cp DEPLOY.md README.md DEPLOY-PLAYBOOK.md download/
echo "    DEPLOY.md, README.md, DEPLOY-PLAYBOOK.md -> download/"

# образцовый CSV импорта (UTF-8+BOM, «;», CRLF) — генерится из скрипта
if command -v python3 >/dev/null; then python3 scripts/make-sample-import.py; fi

echo "==> public/download/ — переживает сбросы песочницы (лежит в git)"
# Бандлы в корне public/ и папка download/ исключены из git и стираются
# при пересоздании песочницы — отсюда «404» на старых ссылках.
# Копия в public/download/ коммитится в git: сброс песочницы → git restore
# → ссылка /download/... снова работает без пересборки.
# ВАЖНО: из сквош-клона выше public/download удалён — иначе бандл
# вкладывался бы сам в себя при каждой пересборке.
# ⛔ ЧИСТКИ НЕТ: versioned-бандлы v1.0.21+ копируются в download/ как есть
# (требование юзера 2026-09-20: ссылки на прошлые бандлы живут вечно).
mkdir -p public/download
cp "$ONEFILE" public/download/

# README генерируется ЗДЕСЬ (до копирования — папка download/ могла быть
# стёрта сбросом песочницы, chicken-egg).
cat > download/README.md <<'EOF'
# Поставка SCORESBOX — фикс деплоя v1.0.27 (24.09.2026)

**Что это:** ваш деплой тега v1.0.26 «упал» не сборкой, а отменой:
CD-джоба «Deploy → VPS» имела лимит 10 минут, а VPS качал из ghcr.io
слой образа ~239MB по медленной сети — джоба отменила сама себя ровно
на 10-й минуте. Сборка при этом **зелёная** (CI-гейт пройден, образ в
GHCR — фикс sonner подтверждён в реальном Docker), прод **не тронут**.
v1.0.27 поднимает лимит до 30 минут и выносит загрузку образа в
отдельный шаг с ретраем. Кода приложения не меняли, схема БД **не
менялась** — деплой стандартный тегом **v1.0.27**, миграций и ручных
шагов нет.

## ⚡ Можно без обновления (pre-pull + Re-run)

1. На VPS скачайте образ вручную — без таймаута, сколько нужно:
   зайти по ssh в `/opt/scoresbox` и выполнить
   `docker pull ghcr.io/<логин>/<репо>:1.0.26`
   (точное имя образа — в логе шага «Деплой через SSH», строка
   «==> Деплой SCORESBOX ghcr.io/…:1.0.26». Если pull отвечает
   «denied» — образ приватный: `docker login ghcr.io -u <github-логин>`,
   пароль = Personal Access Token со scope `read:packages`).
2. GitHub → Actions → отменённый прогон CD → **Re-run failed jobs**:
   build возьмёт кеш, deploy увидит образ локально и уложится в минуты.

Недокачанный слой Docker начнёт заново (резюма нет) — поэтому «Re-run»
без pre-pull может снова упереться в 10-минутный лимит.

## 📦 Архив поставок — все бандлы с v1.0.21 (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.27** (текущая) | `scoresbox-2026-09-24-deploytimeout.git-bundle` | фикс деплоя: таймаут deploy-джобы 10→30 мин, pull образа отдельным шагом с ретраем |
| v1.0.26 | `scoresbox-2026-09-23-sonnerfix.git-bundle` | хотфикс сборки: sonner возвращён, мёртвый tailwind.config.ts удалён, CI-предохранитель check-deps |
| v1.0.25 ⛔ БИТВАЯ | `scoresbox-2026-09-20-stage3.git-bundle` | Этап 3 «гигиена»: sonner снесён ошибочно, next build падает. НЕ ПРИМЕНЯТЬ |
| v1.0.24 | `scoresbox-2026-09-20-hotfix24.git-bundle` | хотфикс аудита: BOLA-импорт, XSS-баннеры, атомарность мутаций, media 404 |
| v1.0.23 | `scoresbox-2026-09-17-stage2fix.git-bundle` | Этап 2: prisma migrate, история заявок, 20 индексов, sessionVersion, APP_VERSION, пин bun 1.3.14 |
| v1.0.22 | `scoresbox-2026-09-17-next35.git-bundle` | Этап 1: Next 16.3.5, sharp 0.35.4, next-auth удалён (2 RCE закрыты) |
| v1.0.21 | `scoresbox-2026-09-17-security.git-bundle` | security-этап: RBAC-скоупы, CSRF, security-заголовки, 2FA (TOTP), брутфорс-лимит |

**Прямые ссылки (панель /download/):**

- v1.0.27: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-24-deploytimeout.git-bundle
- v1.0.26: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-23-sonnerfix.git-bundle
- v1.0.25 (⛔ битая, не применять): https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-20-stage3.git-bundle
- v1.0.24: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-20-hotfix24.git-bundle
- v1.0.23: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-stage2fix.git-bundle
- v1.0.22: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-next35.git-bundle
- v1.0.21: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-security.git-bundle

## Что случилось с деплоем v1.0.26 (диагноз)

Run «Deploy → VPS cancelled in 10m 15s», последний шаг (SSH) шёл
9m58s и качал «Downloading 237MB → 239.1MB». Это тайм-аут самой
джобы: в cd.yml у deploy стояло `timeout-minutes: 10`, а сеть
VPS→ghcr.io (~400КБ/с) не успела. Аннотации «2 errors and 1 notice» =
штатная тройка отмены по таймауту («The operation was canceled» /
exit 143 / shutdown signal) — никто деплой не отменял вручную.
Важно: отмена случилась ДО переключения контейнеров (шла загрузка
образа) — работающая версия продолжает служить, rollback корректно
не запустился (cancelled ≠ failure).

В v1.0.27: таймаут deploy 30 минут (build и так 45), а в deploy.sh
загрузка образа вынесена в отдельный шаг `docker compose pull` с
ретраем — сетевая фаза отделена от миграций, обрыв линии не роняет
деплой на середине.

## Верификация (v1.0.27 — на этой поставке)

- `tsc` 0 ошибок; check-deps: MISSING 0;
- юнит: **90/90**; прод-сборка standalone: **OK**;
- интеграция: **24/24** на чистой БД (migrate reset + seed);
- `/api/health` на standalone: `db:up`, версия `v1.0.27-smoke`;
- YAML cd/ci провалидирован (deploy: 30 мин); `bash -n deploy.sh`.

## ⚠️ Деплой v1.0.27

Push main + тег **v1.0.27** (CD сам дождётся зелёного CI, до 15 мин).
Схема БД не менялась — миграций нет. Битый тег v1.0.25, если ещё
жив, удалите: `git push origin :refs/tags/v1.0.25`. Тег v1.0.26
трогать не нужно (образ в GHCR валиден). После деплоя:
`curl -s https://scoresbox.ru/api/health` → `"version":"1.0.27"`.

## Применить (PowerShell, папка вашего клона)

```bash
cd D:\project\scoresbox_bundle
git fetch "$HOME\Downloads\scoresbox-2026-09-24-deploytimeout.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-09-24 deploytimeout: …»
git reset --hard FETCH_HEAD && git push --force origin main
```

## Проверка актуальности

- В имени файла: `2026-09-24-deploytimeout`. Дата старше или другое
  слово (sonnerfix/stage3/hotfix24/stage2fix/next35/security) —
  архивная поставка из таблицы выше (каждая доступна по своей ссылке).
- В сообщении коммита (`git log --oneline -1 FETCH_HEAD`): первая
  строка начинается с `SCORESBOX 2026-09-24 deploytimeout:`.
EOF

# копия поставки в git (переживает сбросы песочницы)
cp download/README.md public/download/README.md
# ⛔ БЕЗ ЧИСТКИ: versioned-бандлы v1.0.21+ в public/download/ не трогаем
# (восстановлены из git-истории 20.09.2026 и должны жить в панели вечно)
cp -p public/download/scoresbox-2026-*.git-bundle download/ 2>/dev/null || true
git add public/download/scoresbox-2026-09-24-deploytimeout.git-bundle public/download/README.md 2>/dev/null || true
echo "    public/download/: $(ls public/download/*.git-bundle 2>/dev/null | wc -l) бандла в панели (v1.0.21+)"

ls -lh "$BUNDLE" "$ZIP" "$UPDATE" 2>/dev/null || true
ls -lh download/*.git-bundle 2>/dev/null | head -10
echo "==> Готово"
