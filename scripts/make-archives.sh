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
ONEFILE=download/scoresbox-2026-10-05-cifix43.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-10-05 cifix43: v1.0.43 — фикс CI: GitHub Actions падал на check-deps (exit 1). (1) УДАЛЕНЫ 4 песочных VLM-скрипта scripts/vlm-37.js + vlm-39.js + vlm-39-run.mjs + vlm-check-36.mjs — импортировали z-ai-web-dev-sdk (приватный SDK песочницы, в npm его нет) => check-deps.py ругался MISSING на 3 файлах; скрипты были одноразовыми скриншот-проверками поставок v36/37/39 и на CI бесполезны. (2) scripts/check-deps.py: честный префикс-матч @types/* (раньше в RESOLVED_IMPLICITLY лежал нерабочий литерал \"@types/*\" — @types/qrcode ложно флагался DEAD) + react-dom добавлен в implicit-резолв (Next.js App Router сам резолвит react-dom при гидрации use client — прямой импорт из кода отсутствует, это норма, пакет НЕ мёртвый). (3) @types/qrcode перенесён из dependencies в devDependencies (типы, не рантайм; сам qrcode жив — им порт src/app/api/admin/totp). (4) bun.lock синхронизирован под новый package.json (иначе bun install --frozen-lockfile падает на CI). Код приложения НЕ менялся: build и миграции не затронуты. Верификация: check-deps.py exit 0 (MISSING 0, DEAD 0); tsc 0; eslint 0; unit 111/111 (bun test tests/unit — как в quality-джобе CI). Деплой: тег v1.0.43, health -> 1.0.43." \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-10-05-cifix43.git-bundle
git bundle verify "$ONEFILE" >/dev/null 2>&1 && echo "    onefile-бандл корректен: $ONEFILE"

echo "==> Гайды для чтения без git (только выжившие — дублей больше нет)"
cp DEPLOY.md README.md DEPLOY-PLAYBOOK.md ADMIN-GUIDE.md download/
echo "    DEPLOY.md, README.md, DEPLOY-PLAYBOOK.md, ADMIN-GUIDE.md -> download/"

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
# Поставка SCORESBOX — v1.0.43 «cifix: зелёный CI» (05.10.2026)

**Что это:** минимальный фикс упавшего GitHub Actions (джоба quality,
шаг «Аудит deps» — check-deps.py, exit 1) после пуша v1.0.42. Код
приложения не менялся ни на символ — только CI-гигиена: песочные
скрипты, нечестная проверка зависимостей и секция типов.

## 1. Что чинил

| # | Проблема в CI | Фикс |
|---|---|---|
| 1 | check-deps: MISSING `z-ai-web-dev-sdk` (3 файла) | удалены 4 песочных VLM-скрипта (`scripts/vlm-37.js`, `vlm-39.js`, `vlm-39-run.mjs`, `vlm-check-36.mjs`) — одноразовые скриншот-проверки поставок 36/37/39; SDK приватный (в npm его нет), на CI скрипты бесполезны |
| 2 | check-deps: DEAD `@types/qrcode` | в check-deps.py лежал нерабочий литерал `@types/*` (матчился только сам с собой) — заменён честным префикс-матчем `@types/*`; сам `@types/qrcode` перенесён из dependencies в devDependencies (типы, не рантайм) |
| 3 | check-deps: DEAD `react-dom` | react-dom добавлен в implicit-резолв: Next.js App Router сам резолвит его при гидрации «use client» — прямой импорт из кода не нужен, пакет НЕ мёртвый, из package.json не удалялся |
| 4 | `bun install --frozen-lockfile` | bun.lock синхронизирован под новый package.json (перенос @types/qrcode между секциями) |

**qrcode не тронут:** сам пакет жив — им портируется
`src/app/api/admin/totp` (QR-коды для 2FA).

## 2. Проверено (ровно как в quality-джобе CI)

- `python3 scripts/check-deps.py` → exit 0, MISSING 0, DEAD 0;
- tsc 0; eslint 0; **unit 111/111** (`bun test tests/unit`);
- код приложения не менялся → build и миграции не затронуты.

## 3. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-10-05-cifix43.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-10-05 cifix43: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.43 && git push origin v1.0.43
```

После: Actions должны пройти целиком (quality → integration → deploy),
`curl -s https://scoresbox.ru/api/health` → "version":"1.0.43".
**Миграций нет.**

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 4. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.43** (текущая) | `scoresbox-2026-10-05-cifix43.git-bundle` | фикс CI: VLM-скрипты снесены, check-deps честный (@types/*, react-dom), @types/qrcode в devDeps |
| v1.0.42 | `scoresbox-2026-10-05-sec42.git-bundle` | security: анти-BOLA скоупы, контент strictly SUPER_ADMIN, дашборд по ролям, media DELETE, Next 16.3.8 |
| v1.0.41 | `scoresbox-2026-10-05-fs41.git-bundle` | Протокол/Составы по futbol24, матч без колонок + ряд из 3 реклам |
| v1.0.40 | `scoresbox-2026-10-01-fs40.git-bundle` | хронология FlashScore, имена без «№N», лого scoresb□x |
| v1.0.39 | `scoresbox-2026-09-30-fs39.git-bundle` | лента 52px/кнопка даты, аккордеон лиг, AD-INFEED |
| v1.0.38 | `scoresbox-2026-09-30-fs38.git-bundle` | страница матча по FlashScore (герой/таймлайн/табы) |
| v1.0.37 | `scoresbox-2026-09-29-minute37.git-bundle` | минута у счёта, Onest, лента по скетчу |
| v1.0.35–36 | `…-mobile35 / -brand36` | мобильный адаптив, фирстиль |
| v1.0.32–34 | `…-logic32 / -invite33 / -logic34` | скоуп лиги, приглашения, судейский корпус |
| v1.0.21–31 | `…-security … -lineup28 …` | RBAC, XSS/BOLA-фиксы, деплой-фиксы (см. старые README) |

**Прямые ссылки (панель /download/):**

- v1.0.43: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-cifix43.git-bundle
- v1.0.42: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-sec42.git-bundle
- v1.0.41: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs41.git-bundle
- v1.0.40: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-01-fs40.git-bundle
- v1.0.39: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-30-fs39.git-bundle
- v1.0.38: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-30-fs38.git-bundle

## Грабли agent-browser (задокументированы)

`agent-browser eval` держит ПЕРСИСТЕНТНЫЙ JS-контекст: top-level `const`
живёт между вызовами, повторное объявление = SyntaxError. Все
multi-statement eval — в IIFE. `find label fill` не триггерит
React-состояние (controlled input остаётся пустым, submit блокируется
нативной валидацией): в смооках логиниться демо-кнопками по email.
Тонкость SMTP-мока: nodemailer кодирует письма (text — base64, html —
quoted-printable, тема — RFC 2047) — токен ссылки ищется только после
декодирования (см. parseMail в test-invites.ts).
EOF

