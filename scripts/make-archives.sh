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
ONEFILE=download/scoresbox-2026-09-15-protocol.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-09-15 protocol: судейская бригада матча (новая таблица MatchOfficial — помощники/резервный/VAR/AVAR/инспектор/делегат/врач; вкладка «Бригада» в редакторе протокола и при создании матча; на клиенте — единый блок бригады в превью); добавленное время событий (45+3) и замены одной строкой (вышел+ушёл); merge команд-правопреемников и merge персон — транзакционно; массовое удаление в списках админки (BulkBar с отчётом); карточка матча на клиенте — единая точка знаний: зеркальная хронология без шапки (ось минут и счёт в центре, иконка у оси, фамилия дальше, ассист у края), из геря убраны дубли — дата/тур/стадион/судья/статус только в превью, «Завершён» под счётом, под названиями команд только «хозяева/гости»; тексты «важного матча» — с названиями команд — актуальная поставка solid-sniffle (клиент, админка, деплой)" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-15-protocol.git-bundle
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
# 📦 Поставка SCORESBOX (обновление «protocol» от 15.09.2026)

**Что это:** судейская бригада матча + добавленное время протокола +
замены одной строкой + merge команд + массовые операции — и чистка
карточки матча на клиенте по принципу «единой точки знаний».

## Что нового

### Протокол и бригада (админка)

- **Судейская бригада матча**: новая таблица `MatchOfficial` — помощники
  (×2), резервный судья, VAR/AVAR, инспектор, делегат, врачи. Вкладка
  «Бригада» в редакторе протокола и блок бригады при создании/правке
  матча; конфликты «судья ≠ игрок» проверяются и для бригады.
- **Добавленное время**: события протокола вводятся как 45+3 (минута +
  добавленная), сортировка и отображение это учитывают.
- **Замены одной строкой**: тип SUBSTITUTION — «вышедший + ушедший» в
  одной записи (легаси-пары SUB_OUT/SUB_IN читаются автоматически).
- **Merge команд**: команда-правопреемник забирает всю историю (матчи,
  заявки, события) — для сценария «пересоздали под другим именем»;
  merge персон переписан транзакционно.
- **Массовые операции**: чекбоксы + BulkBar в списках админки — массовое
  удаление с отчётом (заблокированные сущности пропускаются с причиной).

### Карточка матча (клиент) — единая точка знаний

- **Хронология — зеркальная ось**: в центре минуты и бегущий счёт,
  события расходятся от центра: иконка (мяч/карточка) всегда рядом с
  осью, фамилия дальше, ассист у края. Шапка с названиями команд убрана.
- **Гери без дублей**: блок дата/тур/стадион/судья/статус убран — вся
  эта фактура живёт во вкладке «Превью»; статус «Завершён» — под счётом.
- **Под названиями команд** — только «хозяева/гости» (позиция, серия,
  бомбардир, новый тренер — в превью, не мусорим).
- **Превью**: карточка «Судья» из верхней сетки убрана — бригада целиком
  (главный + помощники + VAR + инспектор) в одном блоке внизу.
- **Таблица**: пояснение «Подсвечены команды…» убрано — интуитивно ясно.
- **Тексты «важного матча»** — с названиями команд вместо «№7 против №5»
  и короче: «М-Звезда и М-Стрела борются за место в таблице — до конца
  турнира остался 1 тур».

## ⚠️ База данных

В этой поставке есть **аддитивные** изменения схемы: новая таблица
`MatchOfficial` и nullable-колонка `MatchEvent.stoppage`. Деплой
запустит `prisma db push` автоматически — существующие данные не
затрагиваются, потерь нет.

## Скачать

**Бандл (главный файл):**

https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-15-protocol.git-bundle

**Отдельные файлы:**

- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/DEPLOY-PLAYBOOK.md
- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/DEPLOY.md
- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/README.md

| Файл | Размер | Что это |
|---|---|---|
| `scoresbox-2026-09-15-protocol.git-bundle` | ~1 МБ | ✅ **ГЛАВНЫЙ ФАЙЛ**: весь проект одним коммитом, работает в ЛЮБОМ репозитории |
| `DEPLOY-PLAYBOOK.md` | ~28 КБ | playbook деплоя для другого проекта (копируйте в новый репо) |
| `DEPLOY.md` | ~35 КБ | ops-гайд этого проекта: релизы, домен, мониторинг, откат |
| `README.md` | ~2 КБ | что за проект, стек, структура, локальный запуск |

## Применить (PowerShell, папка вашего клона)

```bash
cd D:\project\scoresbox_bundle
git fetch "$HOME\Downloads\scoresbox-2026-09-15-protocol.git-bundle" main
git log --oneline -1 FETCH_HEAD       # проверка: «SCORESBOX 2026-09-15 protocol: ...»
git reset --hard FETCH_HEAD && git push --force origin main
```

## Проверка актуальности

- В имени файла: `2026-09-15-protocol`. Есть дата старше или другое слово
  (entities/encoding/roles/admin2/cleanup/…) — файл старый, скачайте по
  ссылке выше.
- В сообщении коммита (`git log --oneline -1 FETCH_HEAD`): первая строка
  начинается с `SCORESBOX 2026-09-15 protocol:`.

После push: тег **v1.0.19** задеплоит изменения. `prisma db push`
добавит таблицу `MatchOfficial` и колонку `stoppage` — аддитивно, без
потери данных.
EOF

# копия поставки в git (переживает сбросы песочницы)
mkdir -p public/download
rm -f public/download/scoresbox-*.git-bundle
cp "$ONEFILE" public/download/
cp download/README.md public/download/README.md
git add -A public/download 2>/dev/null || true
echo "    public/download/scoresbox-2026-09-15-protocol.git-bundle — для ссылки /download/"

ls -lh "$BUNDLE" "$ZIP" "$UPDATE" 2>/dev/null || true
ls -lh download/ public/*.git-bundle public/*.zip 2>/dev/null | head -20
echo "==> Готово"
