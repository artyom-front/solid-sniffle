# Поставка SCORESBOX — v1.0.60 «cifix60» (20.11.2026)

**Что это:** фикс упавшего пуша v1.0.59 — CI упал на гейте «Аудит deps»
(`MISSING docx`). **МИГРАЦИЙ БД НЕТ**; деплой-фикс v1.0.59
(pull_resilient, без Docker Hub) внутри и не тронут.

## Коротко: что случилось и что исправлено

Пуш v1.0.59 упал там же, где feedback57: `scripts/make-deploy-guide.mjs`
импортирует `docx`, которого нет в `package.json`. feedback58 решал это
переносом генераторов гайда в `tools/docs/` (вне зоны скана check-deps),
но при сборке deploy59 старые копии **случайно вернулись в трек** в
`scripts/` — и гейт снова увидел импорт `docx`.

**Фикс:** старые копии (`make-deploy-guide.mjs`,
`patch-deploy-guide-footers.py`) удалены из `scripts/`; канон —
`tools/docs/`, как в v1.0.58. Больше ничего не менялось: deploy.sh
pull_resilient из v1.0.59 едет дальше, версия 1.0.60.

## Верификация (= шаги CI quality, локально на чистом клоне бандла)

- `python3 scripts/check-deps.py` — «ок: все импортируемые пакеты
  объявлены», exit 0 (тот самый гейт, что упал);
- `bash -n scripts/deploy.sh` — синтаксис OK; концы строк LF;
- `scripts/make-deploy-guide.mjs` в клоне ОТСУТСТВУЕТ (канон в
  `tools/docs/`), deploy.sh идентичен версии v1.0.59;
- меняются только 2 удаления + версия в package.json — код приложения
  не тронут, остальные гейты CI идут по unchanged-файлам v1.0.58.

## Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-11-20-cifix60.git-bundle" main
git log --oneline -3 FETCH_HEAD   # «SCORESBOX 2026-11-20 cifix60: …»
git log FETCH_HEAD..main          # ПУСТО = терять нечего, безопасно
git reset --hard FETCH_HEAD && git push --force origin main
git tag -d v1.0.59                # если уже ставили тег с deploy59
git push origin :refs/tags/v1.0.59   # убрать упавший тег из GitHub (если был)
git tag v1.0.60 && git push origin v1.0.60
```

⚠️ Перед `reset --hard`: если `git log FETCH_HEAD..main` НЕ пуст —
спрячьте свои коммиты: `git branch backup/pre-v1060 main`, потом reset.

⚠️ В бандле тег v1.0.60 уже лежит рядом с main; если `git tag v1.0.60`
скажет «already exists» — просто `git push origin v1.0.60`.

После деплоя: Actions → джоба deploy → в логе шага «Деплой через SSH»
появится «Предзагрузка образов (pull_resilient)» и для postgres —
«уже есть локально — пул не нужен». `/api/health` → `"version":"1.0.60"`.
Миграций в логе быть не должно.

## Что проверить на проде

1. пайплайн GitHub Actions на этом пуше — зелёный ДО конца
   (quality → integration → docker → deploy): deps-гейт чист;
2. `/api/health` → версия 1.0.60;
3. в логе деплоя: pull_resilient прошёл БЕЗ обращения к Docker Hub
   (postgres — «уже есть локально»);
4. лента матчей на главной работает как раньше (код не трогали).

## Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.60** (текущая) | `scoresbox-2026-11-20-cifix60.git-bundle` | фикс CI: deps-гейт — из scripts/ убраны старые копии генераторов гайда (docx); внутри деплой-фикс v1.0.59 pull_resilient |
| v1.0.59 | `scoresbox-2026-11-20-deploy59.git-bundle` (снят с раздачи — упал в CI на deps-гейте; фикс = v1.0.60) | деплой-фикс: pull_resilient — без Docker Hub (429) |
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

- v1.0.60: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-11-20-cifix60.git-bundle
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
