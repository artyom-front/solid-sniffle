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

