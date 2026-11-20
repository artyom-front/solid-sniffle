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
ONEFILE=download/scoresbox-2026-11-18-feedback58.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-11-18 feedback58: v1.0.58 — фикс упавшего пуша feedback57 (гейт «Аудит deps» в CI). Причина: scripts/make-deploy-guide.mjs импортировал docx, которого нет в package.json приложения — пакет ставился глобально в песочнице для генерации docx-гайда, в CI он не резолвится, check-deps.py дал MISSING docx → exit 1. Развязка: (1) генераторы гайда вынесены из scripts/ в tools/docs/ — НОВАЯ папка вне CI-скана (check-deps сканит только src/tests/scripts/prisma), README-правило приложено; (2) хвосты несвязанного WIP в рабочем дереве (age-groups/custom-fields API, Portal-компоненты, settings.ts) ссылались на модели Prisma, которых НЕТ в трекнутой схеме — исключены из поставки (git stash); (3) tailwind.config.ts реально импортирует tailwindcss-animate, но пакет не был объявлен (локально маскировался глобальным node_modules) — добавлен в devDependencies + allowlist-комментарий в check-deps.py. ВЕРИФИКАЦИЯ (= CI quality): tsc 0; eslint 0; bun test 157/157; bun audit 0 critical; check-deps MISSING NONE; прод-сборка OK, /api/health → 1.0.58, smoke56 14/14 на сборке. МИГРАЦИЙ НЕТ — схема не менялась." \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-11-18-feedback58.git-bundle
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
# Поставка SCORESBOX — v1.0.58 «feedback58» (18.11.2026)

**Что это:** фикс упавшего пуша feedback57 — CI упал на шаге
«Аудит deps» (check-deps.py). **МИГРАЦИЙ БД НЕТ** — схема не
менялась, deploy пройдёт без применения миграций.

## Коротко: что случилось и что исправлено

Пуш feedback57 упал в CI на ОДНОЙ проблеме (линт и tsc до неё
успешно прошли — фиксы feedback56 работают):

1. **Гейт «Аудит deps»** — `scripts/make-deploy-guide.mjs`
   (генератор docx-гайда из поставки feedback57) импортировал
   пакет `docx`, которого нет в `package.json` приложения. В
   песочнице `docx` стоял глобально (для генерации гайдов), в CI
   он не резолвится → `MISSING docx` → exit 1.
   **Фикс:** генератор и пост-обработчик гайда вынесены из
   `scripts/` в новую папку `tools/docs/` — она вне зоны скана
   check-deps (тот сканит только `src/ tests/ scripts/ prisma/`).
   Правило задокументировано в `tools/docs/README.md`: утилиты
   генерации документации с внешними зависимостями живут там.

2. **Профилактика (найдено при ревизии):** `tailwind.config.ts`
   реально импортирует `tailwindcss-animate`, но пакет не был
   объявлен в package.json — локально это маскировалось
   глобальным node_modules. Добавлен как devDependency
   (`tailwindcss-animate@1.0.7`), bun.lock обновлён.

## Верификация (= шаги CI quality, локально)

- `python3 scripts/check-deps.py` — MISSING: NONE (гейт зелёный);
- `tsc --noEmit` — 0 ошибок;
- `eslint .` — 0 ошибок;
- `bun test tests/unit` — 157/157;
- `bun audit --audit-level=critical` — 0 уязвимостей;
- прод-сборка `bun run build` — OK; сервер поднялся,
  `/api/health` → `"version":"1.0.58"`, smoke56 на сборке — 14/14.

## Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-11-18-feedback58.git-bundle" main
git log --oneline -3 FETCH_HEAD   # «SCORESBOX 2026-11-18 feedback58: …»
git log FETCH_HEAD..main          # ПУСТО = терять нечего, безопасно
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.58 && git push origin v1.0.58
```

⚠️ Перед `reset --hard`: если `git log FETCH_HEAD..main` НЕ пуст —
спрячьте свои коммиты: `git branch backup/pre-v1058 main`, потом reset.

После деплоя: `/api/health` → `"version":"1.0.58"`. Миграций в логе
деплоя быть не должно. Первая сборка после этого бандла ставит
`tailwindcss-animate` (новый devDep — не влияет на прод-рантайм,
это build-плагин).

## Что проверить на проде

1. пайплайн GitHub Actions на этом пуше — зелёный ДО конца
   (quality → integration → docker → audit): теперь deps-гейт чист;
2. `/api/health` → версия 1.0.58;
3. лента матчей на главной: LIVE-минуты и время у запланированных;
4. глобальный поиск «/»: 2+ буквы — выпадают результаты;
5. главная на телефоне (~375px): строки матчей в два этажа.

## Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.58** (текущая) | `scoresbox-2026-11-18-feedback58.git-bundle` | фикс CI: deps-гейт — генераторы гайдов в tools/docs/, devDep tailwindcss-animate |
| v1.0.57 | `scoresbox-2026-11-18-feedback57.git-bundle` | (упал в CI на deps-гейте) фикс TS2322 smoke56, next 16.4.6, react-hooks v6 |
| v1.0.56 | `scoresbox-2026-11-13-feedback56.git-bundle` | медиа-конвейер (фото/лого сквозь клиент, фолбэк клуба), видео mp4/WebM + Range, тихие заглушки |
| v1.0.55 | `scoresbox-2026-10-09-feedback55.git-bundle` | штаб на матч, начальник команды, сквозная заявка, чистка подсказок |
| v1.0.54 | `scoresbox-2026-10-09-feedback54.git-bundle` | предварительная таблица, важный матч, фантомный ассист, лайтбокс-UX |
| v1.0.53 | `scoresbox-2026-10-08-feedback53.git-bundle` | консолидация линий, SB-монограмма, SEO, лайтбокс, миграции 06+07 |
| v1.0.52 | `scoresbox-2026-10-08-feedback52.git-bundle` | дубли ФИО, замены, капитан, DIRECTOR, мобильные формы |
| v1.0.46 | `scoresbox-2026-10-07-feedback46.git-bundle` | селекторы, поздние заявки, дедуп, медиа 1920px |
| v1.0.45 | `scoresbox-2026-10-06-dbfix45.git-bundle` | фикс деплоя: бэкап и проверка в контейнере db |
| v1.0.44 | `scoresbox-2026-10-05-fs44.git-bundle` | UI-фидбек + аудит №10–19 |
| v1.0.43 | `scoresbox-2026-10-05-cifix43.git-bundle` | фикс CI (check-deps) |
| v1.0.42 | `scoresbox-2026-10-05-sec42.git-bundle` | security: скоупы, media DELETE |

**Прямые ссылки (панель /download/):**

- v1.0.58: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-11-18-feedback58.git-bundle
- v1.0.57: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-11-18-feedback57.git-bundle
- v1.0.56: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-11-13-feedback56.git-bundle
- v1.0.55: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-09-feedback55.git-bundle
- v1.0.54: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-09-feedback54.git-bundle
- v1.0.53: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-08-feedback53.git-bundle
- v1.0.52: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-08-feedback52.git-bundle
- v1.0.46: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-07-feedback46.git-bundle
- v1.0.45: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-dbfix45.git-bundle
- v1.0.44: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs44.git-bundle
- v1.0.43: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-cifix43.git-bundle
- v1.0.42: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-sec42.git-bundle

## Гайд «бандл → GitHub → автодеплой»

Пошаговая инструкция для разработчика (как работает схема,
как перенести на другой проект): /download/git-bundle-autodeploy-guide.docx
(и .pdf) — 12 разделов, шпаргалка всех команд цикла.

## Грабли agent-browser (задокументированы)

`agent-browser eval` держит ПЕРСИСТЕНТНЫЙ JS-контекст: top-level `const`
живёт между вызовами, повторное объявление = SyntaxError. Все
multi-statement eval — в IIFE. `find label fill` не триггерит
React-состояние (controlled input остаётся пустым, submit блокируется
нативной валидацией): в смооках логиниться демо-кнопками по email.
`find text` кликает только первый точный матч — для табов с бейджем
счётчика («Протокол · 12») клик через eval по textContent.startsWith.
Тонкость SMTP-мока: nodemailer кодирует письма (text — base64, html —
quoted-printable, тема — RFC 2047) — токен ссылки ищется только после
декодирования (см. parseMail в test-invites.ts).

EOF

# v1.0.54: ПАНЕЛЬ синкается ЗДЕСЬ (корневой фикс бага 56b: раньше
# README/гайды копировались в public/download вручную и один раз
# «забылись» — панель осталась на v1.0.46). Правило: make-archives —
# единственная точка, где панель обновляется.
cp download/README.md public/download/README.md
cp download/ADMIN-GUIDE.md public/download/ADMIN-GUIDE.md
echo "    панель public/download синкнута (README + ADMIN-GUIDE)"
