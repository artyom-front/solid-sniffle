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
ONEFILE=download/scoresbox-2026-09-26-cifix31.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-09-26 cifix31: фикс CI-сборки v1.0.31 — (0) РЕГРЕССИЯ v1.0.30, воспроизведена строка-в-строку: CI-фикс v1.0.30 заменил в integration-job prisma db push на prisma migrate deploy, но db push НЕЯВНО генерировал Prisma-клиент, а migrate deploy — нет; явного шага generate в integration-job не было → клиент из кэша node_modules оставался от схемы v1.0.28 (без FormatLink/StatBlock) → bun run build падал на type-check: 17× TS2339 «Property 'formatLink'/'statBlock' does not exist» (quality-job проходил — там generate был явным). (1) ФИКС ДВУХСЛОЙНЫЙ: integration-job ci.yml — явный bunx prisma generate после install (как в quality-job); package.json: build = «prisma generate && next build && …» — самоисцеление в ЛЮБОМ окружении (CI/локальная машина/будущие job-ы). Проверено на протухшем клиенте: build перегенерировал клиент и собрался. Docker не страдал никогда (в Dockerfile generate явный). (2) Верификация: tsc 0, eslint 0/0, unit 90/90, build OK, интеграция 30/30 по CI-пути (migrate deploy + seed, FormatLink rows: 4). (3) Поставка v1.0.31 = всё v1.0.29–v1.0.30 (колонки главной, стат-карточки анти-CLS, форматы футбола + миграция 00000000000002, разборка ProtocolEditor 824→315+4 вкладки) + этот фикс. Тегать v1.0.31, минуя битые в CI v1.0.29/v1.0.30; с прод v1.0.28 миграция применится автоматически при деплое" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-26-cifix31.git-bundle
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
# Поставка SCORESBOX — v1.0.31 «фикс CI: генерация Prisma-клиента» (26.09.2026)

**Что это:** точечный фикс регрессии v1.0.30 — CI падал на сборке.
Бандл содержит ВСЁ из v1.0.29–v1.0.30 (колонки главной, стат-карточки
с фото, форматы футбола из админки, разборку ProtocolEditor) + фикс.

1. **Регрессия v1.0.30 (воспроизведена строка-в-строку):** CI-фикс
   v1.0.30 заменил в integration-job `prisma db push` на
   `prisma migrate deploy`. Но db push генерировал Prisma-клиент
   НЕЯВНО, а migrate deploy — нет; явного шага generate в job не
   было → клиент из кэша node_modules оставался от схемы v1.0.28
   (без FormatLink/StatBlock) → `bun run build` падал на
   type-check: 17× TS2339 «Property 'formatLink'/'statBlock' does
   not exist». quality-job проходил — там generate был явным.
2. **Фикс двухслойный:** (а) integration-job ci.yml — явный
   `bunx prisma generate` после install; (б) package.json:
   `build: prisma generate && next build && …` — самоисцеление в
   ЛЮБОМ окружении (CI, локальная машина, будущие job-ы). Проверено:
   билд запущен с протухшим клиентом — перегенерировался и собрался.
   Docker не страдал никогда (в Dockerfile generate явный).

Деплой: тег **v1.0.31**. Версии v1.0.29/v1.0.30 в CI битые — не
тегать. С прод-уровня v1.0.28 миграция 00000000000002 (форматы +
стат-карточки) применится автоматически при деплое (deploy.sh:
migrate deploy). Если тег v1.0.30 успел уйти в origin — удалите:
`git tag -d v1.0.30 && git push origin :refs/tags/v1.0.30`.

## 📦 Архив поставок — все бандлы с v1.0.21 (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.31** (текущая) | `scoresbox-2026-09-26-cifix31.git-bundle` | фикс CI: явный prisma generate в integration-job + generate внутри build-скрипта |
| v1.0.30 ⛔ БИТЫЙ В CI | `scoresbox-2026-09-26-refactor30.git-bundle` | контент ок (ProtocolEditor разобран), но CI падал на сборке — не тегать |
| v1.0.29 ⛔ БИТЫЙ В CI | `scoresbox-2026-09-25-site29.git-bundle` | контент ок, но тест форматов падал в CI — не тегать |
| v1.0.28 | `scoresbox-2026-09-24-lineup28.git-bundle` | города вместо «хозяев/гостей», заявка «старт→№→запас→штаб», 3-колоночный лэйаут |
| v1.0.27 | `scoresbox-2026-09-24-deploytimeout.git-bundle` | фикс деплоя: таймаут джобы 10→30 мин |
| v1.0.26 | `scoresbox-2026-09-23-sonnerfix.git-bundle` | хотфикс сборки: sonner, check-deps |
| v1.0.25 ⛔ БИТВАЯ | `scoresbox-2026-09-20-stage3.git-bundle` | НЕ ПРИМЕНЯТЬ |
| v1.0.24 | `scoresbox-2026-09-20-hotfix24.git-bundle` | хотфикс аудита: BOLA, XSS, media 404 |
| v1.0.23 | `scoresbox-2026-09-17-stage2fix.git-bundle` | prisma migrate, 20 индексов, sessionVersion |
| v1.0.22 | `scoresbox-2026-09-17-next35.git-bundle` | Next 16.3.5, sharp 0.35.4 (2 RCE закрыты) |
| v1.0.21 | `scoresbox-2026-09-17-security.git-bundle` | RBAC-скоупы, CSRF, 2FA, брутфорс-лимит |

**Прямые ссылки (панель /download/):**

- v1.0.31: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-26-cifix31.git-bundle
- v1.0.30: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-26-refactor30.git-bundle
- v1.0.29: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-25-site29.git-bundle
- v1.0.28: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-24-lineup28.git-bundle
- v1.0.27: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-24-deploytimeout.git-bundle
- v1.0.26: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-23-sonnerfix.git-bundle
- v1.0.24: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-20-hotfix24.git-bundle
- v1.0.23: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-stage2fix.git-bundle
- v1.0.22: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-next35.git-bundle
- v1.0.21: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-security.git-bundle

## ⚠️ Деплой v1.0.31

Push main + тег **v1.0.31**. Миграция 00000000000002 (таблицы
FormatLink/StatBlock + сид форматов) применится автоматически —
это штатный путь deploy.sh. После деплоя:
`curl -s https://scoresbox.ru/api/health` → `"version":"1.0.31"`.

## Применить (PowerShell, папка вашего клона)

```bash
cd D:\project\scoresbox_bundle
git fetch "$HOME\Downloads\scoresbox-2026-09-26-cifix31.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-09-26 cifix31: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.31 && git push origin v1.0.31
```

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## Верификация (v1.0.31)

- репро провала: клиент от схемы v1.0.28 + новый код → tsc = те же
  17× TS2339, что в логе CI (строка-в-строку);
- после фикса: билд, запущенный с протухшим клиентом, прошёл —
  generate внутри build-скрипта самоисцеляет;
- tsc 0; eslint 0/0; unit 90/90; интеграция 30/30 по CI-пути
  (migrate deploy + seed, FormatLink rows: 4).

## Грабля agent-browser (задокументирована)

`agent-browser eval` держит ПЕРСИСТЕНТНЫЙ JS-контекст: top-level
`const` живёт между вызовами, повторное объявление = SyntaxError и
пустой результат. Все multi-statement eval — оборачивать в IIFE.
EOF
