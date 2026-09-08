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
ONEFILE=download/scoresbox-2026-09-08-roles.git-bundle
rm -f "$ONEFILE"
# подчистить старые имена, чтобы в download/ не осталось путаницы
# (+ старые dated-бандлы в корне public/ — чтобы старые ссылки не отдавали неактуальное)
rm -f download/scoresbox-onefile.git-bundle public/scoresbox-onefile.git-bundle
rm -f public/scoresbox-2026-*.git-bundle
ROOT="$(pwd)"
SQUASH=/tmp/sb-squash
rm -rf "$SQUASH"
git clone -q . "$SQUASH"
( cd "$SQUASH" \
  && git checkout -q --orphan tmp-main \
  && { git rm -rq --cached public/download 2>/dev/null || true; } \
  && rm -rf public/download \
  && git commit -q -m "SCORESBOX 2026-09-08 roles: инвариант «судья ≠ игрок» на двух уровнях (карточка персоны + чемпионат/сезон: заявка игрока ↔ назначение судьей взаимоисключающи, судья не судит свою команду даже как тренер) + раздельная статистика: тренерская карьера (В-Н-П/мяки/очки) отдельным блоком рядом с игровой и судейской + скачиваемые CSV-шаблоны импорта для всех 5 сущностей (Excel: BOM+«;»+CRLF) с таблицей колонок «обязательность/формат/пример» + DEPLOY-PLAYBOOK.md — отдельный пошаговый файл деплоя для другого проекта с 14 граблями из боевой практики — актуальная поставка solid-sniffle (клиент, админка, деплой)" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-08-roles.git-bundle
git bundle verify "$ONEFILE" >/dev/null 2>&1 && echo "    onefile-бандл корректен: $ONEFILE"

echo "==> Гайды для чтения без git (только выжившие — дублей больше нет)"
cp DEPLOY.md README.md DEPLOY-PLAYBOOK.md download/
echo "    DEPLOY.md, README.md, DEPLOY-PLAYBOOK.md -> download/"

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
# 📦 Поставка SCORESBOX (обновление «roles» от 08.09.2026)

**Что это:** жёсткое разделение «судья ≠ игрок» с раздельной статистикой,
скачиваемые CSV-шаблоны импорта и отдельный deploy-playbook для нового проекта.

## Что нового

- **Инвариант «судья ≠ игрок» — два уровня защиты**:
  - *Карточка персоны*: роли «Игрок» и судейские (судья/помощник/резервный/VAR/AVAR/инспектор)
    нельзя совместить — и в форме, и в API, и в импорте. Игрок свободно совмещается
    с тренером (играющий тренер), администратором, президентом.
  - *Чемпионат+сезон*: заявку игроком нельзя оформить человеку, назначенному судьёй
    на матчи этого сезона; судью нельзя назначить на матч, если он заявлен игроком
    в этом сезоне; судья не обслуживает матчи своей команды (даже как тренер).
    Кросс-лиговый сценарий работает: играет в лиге A — судит лигу B
    (карточка судьи + заявка игроком в другом сезоне).
- **Раздельная статистика без «каши»**: игровая карьера (по событиям/составам),
  судейская (по назначенным матчам, была) и НОВАЯ тренерская — В-Н-П, мяки, очки,
  % побед по сезонам на карточке персоны отдельным блоком.
- **CSV-шаблоны импорта** (Импорт → «Скачать шаблон CSV»): Excel-совместимые
  (BOM + «;» + CRLF), для всех 5 сущностей — заявка/персоны/команды/стадионы/клубы,
  со строками-примерами; кнопка «Как подготовить файл» показывает таблицу
  «колонка → обязательность → формат → пример» и правила (ФИО в трёх колонках,
  несколько ролей в одной ячейке через запятую).
- **DEPLOY-PLAYBOOK.md** — отдельный файл: пошаговый деплой Next.js+Prisma+PG+Docker
  на VPS для ДРУГОГО проекта: готовые Dockerfile/compose/deploy.sh/cd.yml,
  чек-листы, мониторинг, откат и таблица 14 граблей с симптомами и фиксами.

## Скачать

**Прямая ссылка (надёжная):**

https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-08-roles.git-bundle

**Отдельные файлы (читать без git):**

- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/DEPLOY-PLAYBOOK.md
- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/DEPLOY.md
- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/README.md

| Файл | Размер | Что это |
|---|---|---|
| `scoresbox-2026-09-08-roles.git-bundle` | ~0,7 МБ | ✅ **ГЛАВНЫЙ ФАЙЛ**: весь проект одним коммитом, работает в ЛЮБОМ репозитории |
| `DEPLOY-PLAYBOOK.md` | ~25 КБ | playbook деплоя для другого проекта (копируйте в новый репо) |
| `DEPLOY.md` | ~35 КБ | ops-гайд этого проекта: релизы, домен, мониторинг, откат |
| `README.md` | ~2 КБ | что за проект, стек, структура, локальный запуск |
| `scoresbox-full.git-bundle` | ~69 МБ | весь проект со всей историей (не обязателен) |
| `scoresbox-source.zip` | ~0,5 МБ | просто файлы проекта без git |

## Применить (PowerShell, папка вашего клона)

```bash
cd D:\project\scoresbox_bundle
git fetch "$HOME\Downloads\scoresbox-2026-09-08-roles.git-bundle" main
git log --oneline -1 FETCH_HEAD       # проверка: «SCORESBOX 2026-09-08 roles...»
git reset --hard FETCH_HEAD && git push --force origin main
```

## Проверка актуальности

- В имени файла: `2026-09-08-roles`. Есть дата старее или другое слово
  (admin2/cleanup/composefix/…) — файл старый, скачайте по ссылке выше.
- В сообщении коммита (`git log --oneline -1 FETCH_HEAD`): первая строка
  начинается с `SCORESBOX 2026-09-08 roles:`.

После push: тег **v1.0.15** задеплоит изменения. Миграций БД нет (изменения
логические, поверх существующей схемы — prisma db push ничего не меняет).
Подробности — DEPLOY.md §I.7.
EOF

# копия поставки в git (переживает сбросы песочницы)
mkdir -p public/download
rm -f public/download/scoresbox-*.git-bundle
cp "$ONEFILE" public/download/
cp download/README.md public/download/README.md
git add -A public/download 2>/dev/null || true
echo "    public/download/scoresbox-2026-09-08-roles.git-bundle — для ссылки /download/"

ls -lh "$BUNDLE" "$ZIP" "$UPDATE" 2>/dev/null || true
ls -lh download/ public/*.git-bundle public/*.zip 2>/dev/null | head -20
echo "==> Готово"
