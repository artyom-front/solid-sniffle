#!/usr/bin/env bash
# ============================================================
# SCORESBOX · make-archives.sh — сборка доставочных архивов
# 1. scoresbox-full.git-bundle  — git bundle --all (полная история)
# 2. scoresbox-source.zip       — git archive HEAD (только файлы репо)
# 3. scoresbox-update.git-bundle — тонкий бандл поверх 30e60c2
# 4. гайды (DEPLOY/TUTORIAL/ANALYTICS/GUIDE-START-HERE) + README
# Всё кладётся в download/ (панель файлов чата) и public/ (превью-ссылка).
# Папка download/ в .gitignore — при сбросе песочницы стирается,
# поэтому скрипт создаёт её сам: bash scripts/make-archives.sh.
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
# (то, что пользователь уже запушнил в GitHub). Если у него репо есть —
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
ONEFILE=download/scoresbox-2026-09-17-stage2fix.git-bundle
# подчистить старые имена, чтобы в download/ не осталось путаницы:
# в панели файлов должен лежать РОВНО ОДИН dated-бандл (последний),
# старые (stage2/next35/security/ads/…) — в мусор, иначе юзер может
# скачать предыдущую поставку рядом с новой.
# (+ старые dated-бандлы в корне public/ — чтобы старые ссылки не отдавали неактуальное)
rm -f download/scoresbox-onefile.git-bundle public/scoresbox-onefile.git-bundle
rm -f download/scoresbox-2026-*.git-bundle public/scoresbox-2026-*.git-bundle
ROOT="$(pwd)"
SQUASH=/tmp/sb-squash
rm -rf "$SQUASH"
git clone -q . "$SQUASH"
( cd "$SQUASH" \
  && git checkout -q --orphan tmp-main \
  && { git rm -rq --cached public/download 2>/dev/null || true; } \
  && rm -rf public/download \
  && git commit -q -m "SCORESBOX 2026-09-17 stage2fix: Этап 2 рефакторинга — модель данных: переход на prisma migrate (baseline-схема v1.0.22 + миграция stage2, deploy.sh сам размечает легаси-базу через resolve --applied и деплоит новые миграции; бэкап pg_dump перед этим — как прежде); история заявок разрешена — @@unique заменён partial unique index (WHERE endDate IS NULL): игрок может уйти и вернуться в команду в том же сезоне (бывший P2002 голый 500), гонки страхуются индексом; P2002 глобально маппится в 409 с человеческими подсказками; 20 индексов горячих выборок (схема жила без единого); User.sessionVersion — сброс пароля/2FA мгновенно убивает все выданные сессии; APP_VERSION в образе (Dockerfile ARG + build-arg CD) и /api/health; изменения схемы — только индексы + 1 колонка + гигиена status ENDED, данные нетронуты; ПЛЮС фикс поставки: пин bun 1.3.14 в CI (инцидент 2026-09-17: раннеры GitHub ушли на bun 1.4.x, старый флаг --level стал hard-error, пуш промежуточного состояния упал) — пере-поставка актуального v1.0.23, тег прежний" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-17-stage2fix.git-bundle
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
# README генерируется ЗДЕСЬ (до копирования — папка download/ могла быть
# стёрта сбросом песочницы, chicken-egg).
cat > download/README.md <<'EOF'
# Поставка SCORESBOX (Этап 2 + фикс поставки от 17.09.2026, v1.0.23)

**Что это:** пере-поставка актуального Этапа 2 (v1.0.23) — код тот
же: миграции, история заявок, 409, индексы, инвалидация сессий,
версионирование образа — плюс пин bun в CI. Деплой стандартный:
deploy.sh сам применит миграции (бэкап pg_dump — как прежде).

**Почему пере-поставка:** пуш от 17.09 содержал промежуточное
состояние без части фиксов Этапа 1 (старый флаг audit + черновые
смоук-файлы) и упал; к тому же раннеры GitHub обновились на bun
1.4.x, и старый синтаксис стал жёсткой ошибкой. Этот бандл =
полное проверенное состояние + защита CI от дрейфа версий.

## Что сделано

### База данных

1. **prisma migrate вместо db push.** Появился каталог
   `prisma/migrations`: `00000000000000_init` (схема v1.0.22 как
   baseline) + `00000000000001_stage2_data_model`. deploy.sh сам
   распознаёт легаси-базу (схема есть, журнала миграций нет) и
   размечает baseline как применённый — SQL базовой миграции НЕ
   исполняется на проде, только фиксируется в журнале. Бэкап
   pg_dump делается ДО миграций, как прежде.
2. **История заявок.** Уникальность (игрок+команда+сезон) больше не
   строчная: она действует только для АКТИВНОЙ заявки (partial
   unique index `WHERE "endDate" IS NULL`). Игрок может уйти из
   команды и ВЕРНУТЬСЯ в ней в том же сезоне — раньше это ломалось
   ошибкой 500 (P2002). Закрытые заявки остаются историей.
3. **P2002 → 409.** Конфликты уникальности (гонка двух заявок,
   дубль email и т.п.) больше не отдают «Внутренняя ошибка сервера» —
   приходит осмысленный 409 с текстом.
4. **Индексы.** 20 индексов горячих выборок: календари матчей,
   составы, бомбардиры, заявки сезона, дисквалификации, судьи.
   Схема жила вообще без индексов (кроме PK/UNIQUE) — рост данных
   замедлял бы все публичные страницы.
5. **Гигиена статуса заявок:** закрытые датой заявки получают
   status=ENDED (миграция исправляет исторические строки).

### Безопасность/сессии

6. **User.sessionVersion.** Сброс пароля или 2FA администратором
   мгновенно убивает ВСЕ выданные сессии пользователя (раньше
   7-дневная cookie пережила смену пароля). Блокировка isActive
   (v1.0.21) + версия сессий (v1.0.23) = полный контроль доступа.
7. **APP_VERSION в образе.** Dockerfile принимает build-arg, CD
   передаёт тег релиза — `/api/health` теперь показывает версию
   образа: `{"version":"1.0.23"}`.

## ⚠️ Деплой v1.0.23 — что произойдёт на сервере

Действия те же, что всегда: push + тег **v1.0.23**. deploy.sh:
бэкап pg_dump → **миграции prisma migrate deploy** (новый шаг вместо
db push: размечает baseline на существующей базе, применяет миграцию
stage2 — индексы + колонка sessionVersion + partial unique index,
данные не удаляются) → новый контейнер → health-check → откат при
провале (как прежде).

**Ручных шагов на сервере НЕ требуется.** Миграция аддитивная:
- добавляются индексы и колонка `User.sessionVersion` (default 0);
- уникальность заявок сужается (дубликатов активных заявок в
  прод-данных быть не может — старый строчный constraint был строже);
- время выполнения на живой базе — секунды.

## Верификация (на живом standalone-сервере + embedded-postgres)

- Полный цикл «легаси-база → baseline → migrate deploy» отрепетирован
  на копии прода: дрейф пустой, 20 индексов, partial unique на месте
- Смоук Этапа 2 — 24/24: создание заявки, дубль активной → 409,
  отзаявка (PATCH END), возврат игрока → 200, история = 2 строки,
  сброс пароля → старая сессия мертва / новый пароль жив
- Регрессии: security-смоук 21/21, media/sharp 8/8, HTTP-смоук
  (главная/матч SSR/админка) — все 200
- tsc 0, eslint 0 ошибок, 85/85 unit, `next build` зелёный
- Интеграционный джоб CI прогнан локально на чистой базе (migrate
  reset + сид): 36/36 инвариантов PRD, 2FA-цикл, SSR/SEO — 0 fail

## Скачать

**Бандл (главный файл):**

https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-stage2fix.git-bundle

**Отдельные файлы:**

- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/DEPLOY-PLAYBOOK.md
- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/DEPLOY.md
- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/README.md

| Файл | Что это |
|---|---|
| `scoresbox-2026-09-17-stage2fix.git-bundle` | ГЛАВНЫЙ ФАЙЛ: весь проект одним коммитом, работает в ЛЮБОМ репозитории |
| `DEPLOY-PLAYBOOK.md` | playbook деплоя для другого проекта |
| `DEPLOY.md` | ops-гайд этого проекта: релизы, домен, мониторинг, откат |
| `README.md` | что за проект, стек, структура, локальный запуск |

## Применить (PowerShell, папка вашего клона)

```bash
cd D:\project\scoresbox_bundle
git fetch "$HOME\Downloads\scoresbox-2026-09-17-stage2fix.git-bundle" main
git log --oneline -1 FETCH_HEAD   # проверка: «SCORESBOX 2026-09-17 stage2fix: ...»
git reset --hard FETCH_HEAD && git push --force origin main
```

## Проверка актуальности

- В имени файла: `2026-09-17-stage2fix`. Другое слово (next35/security/
  ads/…) или дата старше — файл старый, скачайте по ссылке выше.
- В сообщении коммита (`git log --oneline -1 FETCH_HEAD`): первая
  строка начинается с `SCORESBOX 2026-09-17 stage2fix:`.

После push: тег **v1.0.23** задеплоит изменения (миграция БД выполнится
в deploy.sh автоматически).

## Как проверить после деплоя

1. `curl -s https://scoresbox.ru/api/health` — в ответе
   `"version":"1.0.23"`, `"db":"up"`.
2. В логах деплоя (GitHub Actions → Deploy): строка
   `легаси-схема без журнала миграций: размечаем baseline` (при
   первом применении) и `All migrations have been successfully applied`.
3. Админка → заявки: отзаявите игрока (кнопка/статус ENDED) и
   заверьте его обратно в ту же команду — раньше падало 500.
4. Попытка завести дубликат активной заявки — осмысленный 409.
5. SUPER_ADMIN → «Пользователи» → сброс пароля тестового аккаунта:
   открытая в другом браузере сессия умирает сразу.
EOF

# копия поставки в git (переживает сбросы песочницы)
mkdir -p public/download
rm -f public/download/scoresbox-*.git-bundle
cp "$ONEFILE" public/download/
cp download/README.md public/download/README.md
git add -A public/download 2>/dev/null || true
echo "    public/download/scoresbox-2026-09-17-stage2fix.git-bundle — для ссылки /download/"

ls -lh "$BUNDLE" "$ZIP" "$UPDATE" 2>/dev/null || true
ls -lh download/ public/*.git-bundle public/*.zip 2>/dev/null | head -20
echo "==> Готово"
