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
ONEFILE=download/scoresbox-2026-11-18-feedback57.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-11-18 feedback57: v1.0.57 — фикс упавшего пуша feedback56: CI снова зелёный. (1) TS2322 в smoke56.ts:82 — new Blob([png]) не принимает Buffer<ArrayBufferLike> (@types/node 25): оборачиваем new Uint8Array(png). (2) bun audit 2 CRITICAL (next ≤16.4.0, GHSA-2464 RCE image-optimization + GHSA-673q RCE use cache): next 16.3.8 → 16.4.6, eslint-config-next синхронно. (3) react-hooks v6 из eslint-config-next 16.4.6 — 8 новых ошибок в старом коде, все починены ПРАВКОЙ КОДА (правила не отключались): StatusCell вынесен на уровень модуля (MatchDayView), useSyncExternalStore вместо setState-в-эффекте (use-mobile), рефактор useFetch (стейт только из async-колбэков, loading/error производные от ключа url#version, устранена гонка отменённых запросов), дебаунс SearchDialog без setState-в-эффекте, make-deploy-guide.js → .mjs. (4) smoke56 упрочнён: standings-logoUrl ищется в сезоне, где играет команда клуба (падало по демо-данным, не по коду). ВЕРИФИКАЦИЯ: tsc 0; eslint 0; bun 157/157; audit 0 critical; прод-сборка 16.4.6 поднята, /api/health → 1.0.57, smoke56 14/14 на сборке. МИГРАЦИЙ НЕТ — схема не менялась." \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-11-18-feedback57.git-bundle
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
# Поставка SCORESBOX — v1.0.57 «feedback57» (18.11.2026)

**Что это:** фикс упавшего пуша feedback56 — CI был красным по двум
независимым причинам. **МИГРАЦИЙ БД НЕТ** — схема не менялась,
deploy пройдёт без применения миграций.

## Коротко: что случилось и что исправлено

Пуш feedback56 упал в CI на двух несвязанных проблемах:

1. **TypeScript** — `scripts/smoke56.ts:82`: `new Blob([png])` больше
   не принимает `Buffer` (новые @types/node типизируют его как
   `Buffer<ArrayBufferLike>`, а `BlobPart` требует чистый
   `ArrayBuffer`). Фикс: `new Uint8Array(png)`.
2. **Безопасность** — `bun audit`: 2 CRITICAL в Next.js ≤16.4.0
   (GHSA-2464 — RCE в image optimization при SVG; GHSA-673q — RCE в
   `use cache`). Фикс: **next 16.3.8 → 16.4.6** (последний патч 16.4.x),
   `eslint-config-next` синхронно.

3. **Следствие апгрейда** (главная часть работы): eslint-config-next
   16.4.6 поднял react-hooks v6 — 8 новых ошибок линта в старом коде.
   Все починены **правкой кода, правила не отключались**:
   - MatchDayView: StatusCell вынесен из рендера на уровень модуля;
   - use-mobile: `useSyncExternalStore(matchMedia)` — честная
     подписка вместо setState-в-эффекте;
   - useFetch: рефактор — стейт только из async-колбэков,
     loading/error вычисляются от ключа `url#version`; побочно
     устранена гонка «ответ отменённого запроса затирает новый»;
   - SearchDialog: дебаунс без setState-в-эффекте.
4. **smoke56 упрочнён**: проверка standings-logoUrl падала по
   демо-данным (команда клуба не играла в первой лиге) — теперь
   сезон ищется там, где команда реально играет.

## Верификация (= шаги CI quality, локально)

- `tsc --noEmit` — 0 ошибок;
- `eslint .` — 0 ошибок (react-hooks v6, все правила включены);
- `bun test tests/unit` — 157/157;
- `bun audit --audit-level=critical` — 0 уязвимостей;
- прод-сборка на Next 16.4.6 поднята, `/api/health` →
  `"version":"1.0.57"`, smoke56 на сборке — 14/14;
- браузер: строки матчей с LIVE-минутами, глобальный поиск «/»,
  мобильный вьюпорт 375px.

## Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-11-18-feedback57.git-bundle" main
git log --oneline -3 FETCH_HEAD   # «SCORESBOX 2026-11-18 feedback57: …»
git log FETCH_HEAD..main          # ПУСТО = терять нечего, безопасно
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.57 && git push origin v1.0.57
```

⚠️ Перед `reset --hard`: если `git log FETCH_HEAD..main` НЕ пуст —
спрячьте свои коммиты: `git branch backup/pre-v1057 main`, потом reset.

После деплоя: `/api/health` → `"version":"1.0.57"`. Первая сборка
после этого бандла пересоздаст `node_modules` (next обновлён до
16.4.6) — это нормально, `bun install` / `npm ci` в deploy.sh
отработает как обычно. Миграций в логе деплоя быть не должно.

## Что проверить на проде

1. пайплайн GitHub Actions на этом пуше — зелёный (quality,
   integration, docker, audit);
2. `/api/health` → версия 1.0.57;
3. лента матчей на главной: LIVE-минуты и время у запланированных;
4. глобальный поиск «/»: вводишь 2+ буквы — выпадают результаты
   (мини-пауза 250 мс — это дебаунс);
5. главная на телефоне (~375px): строки матчей в два этажа.

## Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.57** (текущая) | `scoresbox-2026-11-18-feedback57.git-bundle` | фикс CI: TS2322 smoke56, next 16.4.6 (2 critical RCE), react-hooks v6 — 8 фиксов кода, smoke56 упрочнён |
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
