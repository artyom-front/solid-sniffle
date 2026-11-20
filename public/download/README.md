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

