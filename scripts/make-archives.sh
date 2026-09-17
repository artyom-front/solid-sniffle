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
ONEFILE=download/scoresbox-2026-09-17-ads.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-09-17 ads: рекламная платформа — сайт колонкой 800px по центру (место под рекламу как на крупных площадках), фоновый баннер BACKGROUND на весь экран за колонкой (слева/справа, кликабельный, масштаб cover/contain/repeat), полосы TOP/BOTTOM внутри колонки, маркировка «Реклама» настраивается (кегль 6–16px, прозрачность 20–100%); баннеры в админке — создание одним нажатием (фикс «двух нажатий»), живой предпросмотр «как на сайте» с мини-макетом для фона; хронология — сортировка по таймам (45+X всегда до «Перерыва»), «Перерыв» у завершённого матча даже без событий; бригада — одна роль на персону (главный судья не может быть сам себе помощником); фильтр дат без скачков ширины; судьи на клиенте — только состав бригады (оценка/комментарий убраны); составы — стартовые/запасные + значки участия (гол/ассист/карточка/замена + минута); импорт CSV — однофамильцы без ДР/отчества получают отдельный профиль (потом мерджится) — актуальная поставка (клиент, админка, деплой)" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-17-ads.git-bundle
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
# 📦 Поставка SCORESBOX (обновление «ads» от 17.09.2026)

**Что это:** рекламная платформа «как на крупных площадках» — сайт колонкой
800px с фоновым баннером, плюс правки протокола: хронология 45+X,
бригада без «сам себе помощника», составы старт/запас, однофамильцы в импорте.

## Что нового

### Реклама (главное)

- **Сайт — колонка 800px по центру экрана**: слева/справа/сверху/снизу
  остаётся рекламное поле (как на cybersport.ru / sports.ru).
- **Фоновый баннер (слот BACKGROUND)**: фиксированный слой на весь экран
  за контентной колонкой — виден по краям, кликабелен, с маркировкой.
  Масштабирование: заполнить / вписать / замостить; позиция — центр/верх/низ.
- **Полосы TOP и BOTTOM** — внутри колонки (под шапкой и над футером),
  блоки в виджетах RIGHT_TOP / RIGHT_BOTTOM — на главной витриной.
- **Маркировка «Реклама»** — деликатная пилюля в стиле adfox: кегль
  6–16px и прозрачность 20–100% настраиваются на каждом баннере.
- **Админка баннеров**: создание ОДНИМ нажатием (кнопка ждёт окончания
  загрузки фото — исправлено «два нажатия»), живой предпросмотр «как на
  сайте», для фона — мини-макет с колонкой сайта.

### Протокол и карточка матча

- **Хронология 45+X**: события добавленного времени первого тайма стоят
  ДО «Перерыва» (раньше маркер вставал раньше них — физически неверно).
  «Перерыв» показывается у завершённого матча ВСЕГДА — даже если во
  втором тайме не было событий, и при пустом протоколе («Перерыв 0:0 /
  Завершён 3:0»).
- **Бригада — одна роль на персону**: главный судья больше не может быть
  сам себе помощником (запрещено в API, занятые персоны блокируются в UI).
- **Судьи на клиенте**: только состав бригады (главный + помощники,
  инспектор, делегат) — оценка судейства и комментарии убраны.
- **Составы**: при подаче протокола каждый игрок помечается «Старт» или
  «Запас» (кнопка-переключатель); на клиенте — «Стартовые» и «Запасные»,
  у завершённых и LIVE-матчей — значки участия: гол ⚽ / ассист А /
  карточка / замена ↑↓ с минутой.
- **Фильтр дат на главной**: без слов «сегодня/вчера/завтра», кнопка
  фиксированной ширины — подпись не прыгает при листании дней.
- **Импорт CSV — однофамильцы**: строка без даты рождения и отчества при
  заявке в ДРУГУЮ команду сезона создаёт отдельный профиль с пометкой
  «однофамилец» (потом профили мерджатся). Повторный импорт в ту же
  команду — по-прежнему «уже в заявке».

## ⚠️ База данных

Аддитивные изменения таблицы `Banner`: nullable-колонки `imageFit`,
`imagePos`, `markSize`, `markOpacity`. Деплой запустит `prisma db push`
автоматически — существующие данные не затрагиваются.

## Скачать

**Бандл (главный файл):**

https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-ads.git-bundle

**Отдельные файлы:**

- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/DEPLOY-PLAYBOOK.md
- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/DEPLOY.md
- https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/README.md

| Файл | Размер | Что это |
|---|---|---|
| `scoresbox-2026-09-17-ads.git-bundle` | ~1 МБ | ✅ **ГЛАВНЫЙ ФАЙЛ**: весь проект одним коммитом, работает в ЛЮБОМ репозитории |
| `DEPLOY-PLAYBOOK.md` | ~28 КБ | playbook деплоя для другого проекта (копируйте в новый репо) |
| `DEPLOY.md` | ~35 КБ | ops-гайд этого проекта: релизы, домен, мониторинг, откат |
| `README.md` | ~2 КБ | что за проект, стек, структура, локальный запуск |

## Применить (PowerShell, папка вашего клона)

```bash
cd D:\project\scoresbox_bundle
git fetch "$HOME\Downloads\scoresbox-2026-09-17-ads.git-bundle" main
git log --oneline -1 FETCH_HEAD       # проверка: «SCORESBOX 2026-09-17 ads: ...»
git reset --hard FETCH_HEAD && git push --force origin main
```

## Проверка актуальности

- В имени файла: `2026-09-17-ads`. Есть дата старше или другое слово
  (protocol/entities/encoding/roles/admin2/cleanup/…) — файл старый,
  скачайте по ссылке выше.
- В сообщении коммита (`git log --oneline -1 FETCH_HEAD`): первая строка
  начинается с `SCORESBOX 2026-09-17 ads:`.

После push: тег **v1.0.20** задеплоит изменения. `prisma db push` добавит
колонки баннера — аддитивно, без потери данных.

## Как проверить рекламу после деплоя

1. Админка → Рекламные баннеры → «Баннер» → слот «Фон экрана» →
   загрузите картинку 1920×1080 → посмотрите предпросмотр → «Создать».
2. Откройте сайт на широком экране: фон виден слева/справа от колонки.
3. Слоты «Верх»/«Низ» — полосы внутри колонки; блоки виджетов — на
   главной под лентой матчей.
EOF

# копия поставки в git (переживает сбросы песочницы)
mkdir -p public/download
rm -f public/download/scoresbox-*.git-bundle
cp "$ONEFILE" public/download/
cp download/README.md public/download/README.md
git add -A public/download 2>/dev/null || true
echo "    public/download/scoresbox-2026-09-17-ads.git-bundle — для ссылки /download/"

ls -lh "$BUNDLE" "$ZIP" "$UPDATE" 2>/dev/null || true
ls -lh download/ public/*.git-bundle public/*.zip 2>/dev/null | head -20
echo "==> Готово"
