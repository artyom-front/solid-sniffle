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
ONEFILE=download/scoresbox-2026-09-25-site29.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-09-25 site29: колонки+контент из админки v1.0.29 — (0) ФИКС CD: appleboy/ssh-action имеет СВОЙ command_timeout (дефолт 10m), не связанный с timeout-minutes джобы — медленный пул образа съедал бюджет и убивал сессию посреди health-check (инцидент v1.0.28 «Run Command Timeout»); cd.yml: command_timeout 28m (deploy) / 15m (rollback). Сайт при этом работал: контейнер 1.0.28 запущен. (1) СВАП КОЛОНОК: слева — список лиг (LEFT_TOP/LEFT_BOTTOM баннеры, закреплённые выше, «Другие форматы» для скрытых), справа — статистика: «Прямо сейчас»/«Матч тура», СТАТ-КАРТОЧКИ, ТУРНИРНАЯ ТАБЛИЦА (top-8 + выбор лиги), топ игроков (RIGHT_* баннеры); центр ≤800px не тронут, грид от 1424px прежний — анти-CLS сохранён (скелетоны, фиксированные боксы). (2) ФОТО В СТАТИСТИКЕ: модель StatBlock + /api/admin/statblocks + панель «Сайт → Стат-карточки»: редакционные карточки с фото игрока/лого клуба, бокс ВСЕГДА 120px — с фото и без размер одинаков; аватары 24×24 в «Топе игроков» (слот всегда зарезервирован, фото из Person.photoUrl). (3) ФОРМАТЫ ИЗ АДМИНКИ: модель FormatLink + миграция 00000000000002_site_content (с сидом F11/F8/F6/FUTSAL) + панель «Сайт → Виды футбола»: ссылки меню «Футбол/8×8/6×6/Мини-футбол» добавляются/скрываются/переименовываются; лента ?format= фильтруется по коду формата, лиге можно назначить кастомный формат. Багфикс: LEFT_TOP/LEFT_BOTTOM добавлены в PLACEMENTS API баннеров (в 1.0.28 админка предлагала слоты, API отвергал 422). ДЕПЛОЙ ТЕГОМ v1.0.29 — ВНИМАНИЕ: ЕСТЬ МИГРАЦИЯ (аддитивная, с сидом), deploy.sh применит сам. Верификация: tsc 0, eslint 0/0, unit 90/90, интеграция 30/30 на чистой БД (+4 новых: форматы-сид/CRUD/кастомная лига/стат-карточки XSS+SSR), смоук лэйаута 1920/1280 (слева лиги, справа таблица), VLM — без наложений" \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-09-25-site29.git-bundle
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
# ⛔ ЧИСТКИ НЕТ: versioned-бандлы v1.0.21+ копируются в download/ как есть
# (требование юзера 2026-09-20: ссылки на прошлые бандлы живут вечно).
mkdir -p public/download
cp "$ONEFILE" public/download/

# README генерируется ЗДЕСЬ (до копирования — папка download/ могла быть
# стёрта сбросом песочницы, chicken-egg).
cat > download/README.md <<'EOF'
# Поставка SCORESBOX — v1.0.28 «косметика + номера + лэйаут» (24.09.2026)

**Что это:** после зелёного CI/CD v1.0.27 — косметика клиента по
вашему списку + продолжение Этапа 3. Три правки:

1. **Карточка матча**: подписи «хозяева/гости» под названиями команд
   убраны — вместо них населённые пункты (у Атал-ШУ — «Шумерля»,
   у Сокол-АЛ — «Алатырь»; город команды, при отсутствии — город клуба).
2. **Заявка на матч «старт → № → запас → штаб»** — как в бумажном
   протоколе любителей. В редакторе протокола (вкладка «Составы»)
   сначала отмечаются СТАРТОВЫЕ (первые N до лимита формата: 11/8/6/5,
   счётчик под кнопками), им назначаются **номера на матч** — поле
   предзаполняется последним номером игрока в этой команде (или
   номером из сезонной заявки). **Одинаковые номера в одной команде
   запрещены**: красная подсветка, баннер с именами, сохранение
   заблокировано (и валидация на API). Затем добавляются запасные
   (когда старт заполнен — отметки идут в запас) и в конце —
   тренер/руководство из заявки («Штаб и руководство», без номеров).
   На карточке матча состав показывается группами «Стартовые /
   Запасные / Штаб и руководство»; старые протоколы, где «стартовых»
   больше лимита, показаны одной группой «Состав · заявка».
   Автонумерация «по порядку списка» убрана: номер вносится только
   при заполнении протокола.
3. **Лэйаут как cybersport.ru**: от 1424px — три колонки: центр ≤800px
   (контент не растягивается), **слева** — «Прямо сейчас»/«Матч тура»,
   «Топ игроков» и реклама, **справа** — лиги и реклама. Ниже 1424px —
   одна колонка (виджеты внутри неё, как раньше). Стабильность:
   колонки заданы фиксированным грид-шаблоном — появление/снятие
   рекламы в боковых колонках НЕ двигает центр; виджеты до загрузки
   данных показывают скелетоны той же высоты; фоновая реклама —
   фиксированный слой, вёрстку не двигает вообще.

**Этап 3 (продолжение)**: публичный поиск получил rate-limit (30/мин,
429) и фильтрацию в БД; перегенерация секрета 2FA теперь требует
пароль (симметрия с отключением); reset матча не обнуляет прогресс
отсиживания жёлтых банов; «отсиживание» считается только по заявкам,
активным на дату матча.

Схема БД **не менялась** (только комментарии) — миграций нет,
деплой стандартный тегом **v1.0.28**.

## 📦 Архив поставок — все бандлы с v1.0.21 (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.28** (текущая) | `scoresbox-2026-09-24-lineup28.git-bundle` | косметика: города вместо «хозяев/гостей», заявка «старт→№→запас→штаб» с номерами на матч, 3-колоночный лэйаут, Этап 3 |
| v1.0.27 | `scoresbox-2026-09-24-deploytimeout.git-bundle` | фикс деплоя: таймаут deploy-джобы 10→30 мин, pull образа отдельным шагом с ретраем |
| v1.0.26 | `scoresbox-2026-09-23-sonnerfix.git-bundle` | хотфикс сборки: sonner возвращён, мёртвый tailwind.config.ts удалён, CI-предохранитель check-deps |
| v1.0.25 ⛔ БИТВАЯ | `scoresbox-2026-09-20-stage3.git-bundle` | Этап 3 «гигиена»: sonner снесён ошибочно, next build падает. НЕ ПРИМЕНЯТЬ |
| v1.0.24 | `scoresbox-2026-09-20-hotfix24.git-bundle` | хотфикс аудита: BOLA-импорт, XSS-баннеры, атомарность мутаций, media 404 |
| v1.0.23 | `scoresbox-2026-09-17-stage2fix.git-bundle` | Этап 2: prisma migrate, история заявок, 20 индексов, sessionVersion, APP_VERSION, пин bun 1.3.14 |
| v1.0.22 | `scoresbox-2026-09-17-next35.git-bundle` | Этап 1: Next 16.3.5, sharp 0.35.4, next-auth удалён (2 RCE закрыты) |
| v1.0.21 | `scoresbox-2026-09-17-security.git-bundle` | security-этап: RBAC-скоупы, CSRF, security-заголовки, 2FA (TOTP), брутфорс-лимит |

**Прямые ссылки (панель /download/):**

- v1.0.28: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-24-lineup28.git-bundle
- v1.0.27: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-24-deploytimeout.git-bundle
- v1.0.26: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-23-sonnerfix.git-bundle
- v1.0.25 (⛔ битая, не применять): https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-20-stage3.git-bundle
- v1.0.24: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-20-hotfix24.git-bundle
- v1.0.23: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-stage2fix.git-bundle
- v1.0.22: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-next35.git-bundle
- v1.0.21: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-17-security.git-bundle

## Грабля Tailwind, о которой стоит знать (v1.0.28)

Классы вида `min-[1424px]:block` обязаны стоять в className
**литеральной строкой** — Tailwind-сканер не разворачивает шаблонные
подстановки (`${RAIL_BP}:block`), и CSS для брейкпоинта молча не
генерируется: колонок просто нет, ошибок тоже. Поймали визуальным
смоуком; в SiteShell оставлен комментарий-предупреждение.

## Верификация (v1.0.28 — на этой поставке)

- `tsc` 0 ошибок; eslint 0/0; check-deps: MISSING 0;
- юнит: **90/90**; прод-сборка standalone: **OK**;
- интеграция: **26/26** на чистой БД (migrate reset + seed), включая
  новые: дубли №№ → 422 с именами; номера сохраняются; eligible несёт
  regRole/lastNumber; 429 поиска по rate-limit;
- VLM-смоуки: 1920px — три колонки без наложений; 1280px — одна
  колонка; карточка матча — города, без «хозяев/гостей»;
- редактор протокола: отметка игроков → старт N/11, номера
  предзаполняются, дубль №3 → красный баннер и блокировка кнопки;
- `/api/health` на standalone: `db:up`, версия `v1.0.28-smoke`.

## ⚠️ Деплой v1.0.28

Push main + тег **v1.0.28** (CD сам дождётся зелёного CI, до 15 мин).
Схема БД не менялась — миграций нет. После деплоя:
`curl -s https://scoresbox.ru/api/health` → `"version":"1.0.28"`.

Битый тег v1.0.25, если ещё жив, удалите:
`git push origin :refs/tags/v1.0.25`.

## Применить (PowerShell, папка вашего клона)

```bash
cd D:\project\scoresbox_bundle
git fetch "$HOME\Downloads\scoresbox-2026-09-24-lineup28.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-09-24 lineup28: …»
git reset --hard FETCH_HEAD && git push --force origin main
```

## Проверка актуальности

HEAD бандла — squash «SCORESBOX 2026-09-24 lineup28» и
`version 1.0.28` в package.json; рабочий коммит репо: `6a64c54`.

EOF
