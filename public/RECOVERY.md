# 🚑 ГАЙД ВОССТАНОВЛЕНИЯ SCORESBOX
## Для пользователя и для ИИ-агента в новом чате

> Этот документ — «капсула знаний» проекта. Прочитайте его целиком перед
> любыми действиями. Здесь: что где лежит, как вернуть весь функционал
> (админка + клиентская часть + деплой), и три известных бага, которые
> уже найдены и как исправлены.
>
> Дата: 2026-09-04. Версия кода: `cbcc38b` (main).

---

## ЧАСТЬ 1. Что произошло (краткая история)

- Проект **SCORESBOX** («Футбол Чувашии», репо `github.com/artyom-front/studious-tribble`)
  полностью готов: клиентский портал + админка с 2FA + CI/CD + деплой.
- Песочница платформы несколько раз перезапускалась — превью-ссылка
  умерла, скачивания стали недоступны. **Код при этом не потерялся.**
- Пользователь пробовал «новый чат» — там платформа подставила свою
  заготовку-демо (не наш проект). Это НЕ потеря функционала.
- В приложенном старом архиве `football-chuvashia-source.zip` — версия
  от 2 сентября (утро), **до** миграции на PostgreSQL и до всех фиксов.
  В нём есть ценное: `db/custom.db` — SQLite-база с данными той эпохи.

## ЧАСТЬ 2. Три пути восстановления (от лучшего к запасному)

### Путь А — свежий git-бандл (лучший, 5 минут)

В панели файлов чата (`download/`) лежат:

| Файл | Что это |
|---|---|
| `scoresbox-update.git-bundle` (~230 КБ) | все коммиты поверх вашей версии 30e60c2 |
| `scoresbox-full.git-bundle` (~69 МБ) | весь проект со всей историей |
| `scoresbox-source.zip` (~550 КБ) | просто файлы для чтения |

Применение на своём компьютере (PowerShell в папке клона):

```powershell
cd C:\Projects\studious-tribble          # ваш клон
git fetch "$HOME\Downloads\scoresbox-update.git-bundle" main
git reset --hard FETCH_HEAD
git push --force origin main
```

→ В GitHub вернётся весь функционал: админка (`/admin`), клиент,
CI/CD. Если ошибка «prerequisite commits» — используйте full-бандл
(имя подставить в первую команду).

### Путь Б — новый чат с этим гайдом (если файлы не тянутся)

1. Откройте новый чат на этой платформе.
2. Приложите этот файл (`RECOVERY.md`) и, если есть, полный бандл.
3. Скажите агенту: «Прочитай RECOVERY.md и восстанови проект SCORESBOX
   по Путь Б».

**Агенту:** воссоздать проект из бандла:
```bash
git clone scoresbox-full.git-bundle scoresbox
cd scoresbox && git fetch origin main 2>/dev/null || true
bun install && bunx prisma generate
# поднять embedded PostgreSQL:
bun .zscripts/pg/keeper.mjs &          # или bash .zscripts/dev.sh
bunx prisma db push --accept-data-loss
bun .zscripts/seed-if-empty.mjs        # демо-данные, если база пуста
bun run dev                            # сайт на :3000
```

### Путь В — из старого zip (только если бандлов нет совсем)

Архив `football-chuvashia-source.zip` (2 сентября) содержит код, но:
- БД там SQLite (`db/custom.db`), а текущая версия — PostgreSQL;
- нет CI/CD v3 (деплой по тегам), нет `.zscripts/`, нет фиксов;
- нет TUTORIAL/DEPLOY v3.1.

**Агенту для Путь В:**
```bash
mkdir scoresbox && cd scoresbox
unzip football-chuvashia-source.zip
# 1) схема: SQLite → PostgreSQL (datasource provider = "postgresql")
# 2) поднять PostgreSQL (docker или embedded: .zscripts/pg)
# 3) bunx prisma db push --accept-data-loss
# 4) данные из db/custom.db: sqlite3 db/custom.db .dump > old.sql
#    → перенести таблицы в PG (по заказу пользователя: демо или боевые)
# 5) затем вернуть все фиксы из Части 3 (share/, dependabot, cd.yml)
```

## ЧАСТЬ 3. Три бага, которые уже найдены и исправлены

### 3.1 Превью-деплой падал: «Application error» (server-side exception)

**Причина:** `.zscripts/build.sh` упаковывал в артефакт только
`pg/bin` и `pg/lib`, а PostgreSQL требует каталог `share/`
(таймзоны). Без него — FATAL «could not open directory
.../pg/share/postgresql/timezone», база мертва, все страницы 500.

**Фикс (уже в git, commit cbcc38b):**
```bash
cp -r "$NATIVE/share" "$BUILD_DIR/pg/share"   # рядом с bin и lib
```
**Проверка артефакта:** `bash scripts/test-artifact.sh` —
поднимает артефакт как платформа и проверяет /, /api/health.

### 3.2 Красный CI на GitHub

**Причина:** dependabot открывал PR с **мажорными** апгрейдами
(lucide-react 0.525→1.38, TypeScript 5.9→7.0, eslint 9→10,
recharts 2→3), они ломают сборку. Плюс старый cd.yml запускался на
каждый push без секретов.

**Фикс (в git):** `.github/dependabot.yml` — секция
`ignore: version-update:semver-major`; `cd.yml` срабатывает только
по тегам `v*`. После force-push в main красные прогоны истории
уйдут из списка.

### 3.3 Скачивания «старые»

**Причина:** сообщение «problem deploying» вело на старую страницу
генерации (эпоха SCORES21) + песочница стирала `download/` при
рестартах.

**Фикс:** `bash scripts/make-archives.sh` — пересоздаёт всё с нуля
(бандлы, zip, гайды, README) в `download/` и `public/`.

## ЧАСТЬ 4. Как деплоить (после восстановления)

1. **Секреты** GitHub → Settings → Secrets and variables → Actions
   (список — DEPLOY.md §Б8): DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY,
   DEPLOY_PUBLIC_URL, ADMIN_PASSWORD и др. **Значения БЕЗ кавычек.**
2. **Деплой тегом:**
   ```bash
   git tag v1.0.4 && git push origin v1.0.4
   ```
   Обычный push деплой НЕ запускает (cd.yml: only tags v*).
3. Первый вход в админку: `/admin`, пароль из ADMIN_PASSWORD, включить 2FA.
4. Если красный прогон: Actions → открыть прогон → красный шаг →
   последние 30 строк лога → прислать агенту.

## ЧАСТЬ 5. Карта проекта (что где)

```
src/app/(site)/        клиентские страницы портала
src/app/admin/         вход в админку (тонкая обёртка)
src/components/portal/ AdminGate, AdminPanels, SecurityPanel (2FA),
                       ProtocolEditor, MatchesCrudPanel, CrudPanels…
src/app/api/           API-роуты (+ /api/health)
prisma/schema.prisma   PostgreSQL, модель v1.0 (Person/Team/Club)
.zscripts/             бут песочницы: dev.sh, build.sh (кнопка Deploy),
                       start-preview.sh, pg/ (embedded PostgreSQL 16)
.github/workflows/     ci.yml (main+PR: lint/tsc/54 теста/integration),
                       cd.yml (теги v*: GHCR → SSH-деплой → health)
scripts/               deploy.sh, rollback.sh, setup-nginx.sh,
                       make-archives.sh, test-artifact.sh, backup-db.sh
DEPLOY.md              полная инструкция деплоя на VPS (А0–А7, Б1–Б13)
TUTORIAL.md            все команды «на пальцах»
ANALYTICS.md           архитектура проекта
```

## ЧАСТЬ 6. Что говорить агенту в новом чате (копировать целиком)

> Прочитай приложенный RECOVERY.md. Проект SCORESBOX цел, эталон в
> git-бандле (main = cbcc38b). Восстанови по Путь Б, проверь
> `bash scripts/test-artifact.sh` (все три: / → 200, /api/health → 200
> db:up, digest в HTML нет), затем `bash scripts/make-archives.sh`
> и выдай файлы в download/. Деплой на VPS — по DEPLOY.md, тег v*.
> Мой GitHub: artyom-front/studious-tribble. Секреты без кавычек.

---

*Файл создан 2026-09-04. Положить рядом с бандлами — RECOVERY.md
едет и в download/, и в public/.*
