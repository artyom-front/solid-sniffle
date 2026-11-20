# Поставка SCORESBOX — v1.0.59 «deploy59» (20.11.2026)

**Что это:** фикс упавшего деплоя v1.0.58 — Docker Hub ответил
«429 Too Many Requests» на образ `postgres:16-alpine`, и деплой
останавливался на шаге предзагрузки образов. **МИГРАЦИЙ БД НЕТ** —
меняется один файл `scripts/deploy.sh`.

## Коротко: что случилось и что исправлено

Деплой v1.0.58: CI зелёный, образ приложения в ghcr.io, но шаг
«docker compose pull» на VPS упал: Docker Hub вернул **429 Too Many
Requests** на `postgres:16-alpine`. Анонимный лимит pull с IP вашего
сервера исчерпан (деплои v1.0.56–58 долбили Docker Hub). Плюс
compose-пулл **атомарный**: postgres не скачался → и образ приложения
из ghcr.io не скачался → деплой умер целиком.

**Фикс (секция 0.2 deploy.sh → `pull_resilient`):**

1. **Локальный кэш:** образ уже на сервере (`docker image inspect`) —
   пул не нужен вовсе. Postgres стоит на сервере с v1.0.55 → после
   фикса деплой **вообще не ходит в Docker Hub**;
2. до 4 попыток с паузой 20→40→80→160с; «no space left on device» —
   чистка и повтор **без паузы** (логика диска v1.0.52 сохранена);
3. фолбэк официальных образов Docker Hub (postgres) — зеркало Google
   `mirror.gcr.io/library/<img>` + `docker tag` (зеркало не под
   анонимным лимитом Docker Hub);
4. образ приложения — ghcr.io (свой регистр, лимита нет).

Важно: деплой-скрипт **копируется из репозитория на сервер при каждом
запуске CI** (шаг scp в cd.yml) — поэтому фикс делается в репо, а не
правкой на сервере: ручные правки на VPS затираются каждым деплоем.

## Верификация

- `bash -n scripts/deploy.sh` — синтаксис OK;
- концы строк LF (без CRLF — иначе bash на сервере ломается);
- меняется ТОЛЬКО `scripts/deploy.sh` (+ версия в package.json) —
  код приложения не тронут, CI-гейты идут по unchanged-файлам v1.0.58;
- чистый клон бандла: deploy.sh идентичен, версия 1.0.59, pull_resilient на месте.

## Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-11-20-deploy59.git-bundle" main
git log --oneline -3 FETCH_HEAD   # «SCORESBOX 2026-11-20 deploy59: …»
git log FETCH_HEAD..main          # ПУСТО = терять нечего, безопасно
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.59 && git push origin v1.0.59
```

⚠️ Перед `reset --hard`: если `git log FETCH_HEAD..main` НЕ пуст —
спрячьте свои коммиты: `git branch backup/pre-v1059 main`, потом reset.

⚠️ В бандле тег уже лежит рядом с main; если `git tag v1.0.59` скажет
«already exists» — просто `git push origin v1.0.59`.

После деплоя: Actions → джоба deploy → в логе шага «Деплой через SSH»
появится «Предзагрузка образов (pull_resilient)» и для postgres —
«уже есть локально — пул не нужен». `/api/health` → `"version":"1.0.59"`.
Миграций в логе быть не должно.

## Что проверить на проде

1. пайплайн GitHub Actions на этом пуше — зелёный ДО конца
   (quality → integration → docker → deploy): в логе деплоя видно,
   что шаг pull_resilient прошёл БЕЗ обращения к Docker Hub;
2. `/api/health` → версия 1.0.59;
3. лента матчей на главной работает как раньше (деплой не трогал UI);
4. при следующем деплое postgres качаться не будет — «уже есть локально».

## Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.59** (текущая) | `scoresbox-2026-11-20-deploy59.git-bundle` | фикс деплоя: pull_resilient — без Docker Hub (429), локальный кэш → ghcr → зеркало Google |
| v1.0.58 | `scoresbox-2026-11-18-feedback58.git-bundle` | фикс CI: deps-гейт — генераторы гайдов в tools/docs/, devDep tailwindcss-animate |
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

- v1.0.59: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-11-20-deploy59.git-bundle
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
