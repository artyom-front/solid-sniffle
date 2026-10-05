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
ONEFILE=download/scoresbox-2026-10-05-fs44.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-10-05 fs44: v1.0.44 — фидбек 2026-10-05 (4 UI-правки) + разбор аудита аналитика (пункты 9-19: починены реально опасные, №9 отложен по договорённости). UI: (1) ФИЛЬТР ДАТ: кнопка даты — ФИКСИРОВАННАЯ ширина w-[88px]/sm:w-[196px] (подпись «Среда, 16 сентября» меняла длину и кнопка «дышала» при листании дат; самая длинная подпись «Понедельник, 30 сентября» влезает, truncate + tabular) — все фильтры в одну строку h-12 на любом экране. (2) ПРОТОКОЛ: имена КОРОТКИЕ «И. Иванов» (shortName: «Фамилия Имя» -> «И. Фамилия», полное — в title-тултипе, юнит-тесты), ассист — отдельное приглушённое имя РЯДОМ с автором БЕЗ скобок (эталон futbol24: S. Gudelj + A. Terzic), порядок узлов хозяева [имя][ассист][иконка] / гости [иконка][имя][ассист]. (3) ПРОФИЛИ (игрок/команда/стадион): только своя информация — убраны правый рейл («Прямо сейчас», «Самый результативный», таблица, топ-игроки), колонка лиг и мобильные секции статистики; широкая центральная колонка, реклама AD-TOP/AD-BOTTOM остаётся. (4) СТРАНИЦА МАТЧА: ВОЗВРАЩЕНЫ боковые колонки (откат решения v1.0.41): лиги слева >=1200px, статистика+реклама справа >=768px, мобильные секции статистики под матчем; рекламный ряд из 3 над матчем убран (RIGHT-слоты снова в правой колонке, как на flashscore/livescore). АУДИТ: №10 PATCH/POST/импорт заявок — роль только из справочника src/lib/registration-roles.ts (единый для API и UI; раньше принималась любая строка BANNA/TEST123), смена роли на PLAYER идёт через assertPlayerRegistrationAllowed (обход инварианта «судья-не-игрок» закрыт); №11 замена — ОБА участника через validateEvent (входящий проверялся только на бан: прямым API «выпускали» произвольного Person); №12 товарищеские матчи — если состав подан, участник обязан быть в LineupEntry (раньше гол можно было записать кому угодно); №13 /api/auth/otp — проверка user.isActive (заблокированный успевал создать сессию в 5-минутном окне challenge); №14 recordHit(key, windowMs) — окно параметром (лимиты 10-минут работали как минутные); №15 deploy.sh — PREVIOUS_TAG из .deploy/current, откат при провале health на РАБОЧУЮ версию (раньше откатывал на ДВЕ версии назад); №16 DEPLOY.md Б10-1 — release policy expand/contract (rollback не откатывает БД); №17 бэкап: .part-файл + [ -s ] + pg_restore --list, провал = СТОП деплоя (раньше пустой файл «подтверждал» бэкап); №18 restore-db.sh переписан на PostgreSQL-дрилл (pg_restore во временную БД + сверка счётчиков + drop; старый искал SQLite-файлы); №19 SQLite-останки: check-integrity.ts (PRAGMA -> PG-проверки), DEPLOY.md (db push -> migrate deploy), Dockerfile, deploy.sh шапка. №9 (две ACTIVE-заявки за разные команды) — ОТЛОЖЕНО по договорённости с владельцем (миграция БД, «потом если что исправим»). Верификация: tsc 0; eslint 0; unit 114/114 (добавлены тесты shortName); build OK; SMOKE-44-UI (scripts/smoke-44-ui.sh, standalone :3100, сид-данные): матч 1280px — 3 колонки 220|624|300, aside=2, рекламного ряда нет; протокол — 12 событий, имена «Р. Тимофеев»/«А. Беляев», ассист без скобок; кнопка даты 88/88/88px при листании -1/+3 дня, фильтр одной строкой h=48; профили игрока/команды — asides=0, «Прямо сейчас»/«Самый результативный» отсутствуют. МИГРАЦИЙ НЕТ — deploy.sh пересоберёт контейнер, health -> 1.0.44." \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-10-05-fs44.git-bundle
git bundle verify "$ONEFILE" >/dev/null 2>&1 && echo "    onefile-бандл корректен: $ONEFILE"

echo "==> Гайды для чтения без git (только выжившие — дублей больше нет)"
cp DEPLOY.md README.md DEPLOY-PLAYBOOK.md ADMIN-GUIDE.md download/
echo "    DEPLOY.md, README.md, DEPLOY-PLAYBOOK.md, ADMIN-GUIDE.md -> download/"

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
# Поставка SCORESBOX — v1.0.44 «fs44: UI-фидбек + инварианты» (05.10.2026)

**Что это:** четыре UI-правки от владельца (05.10) + закрывающая часть
разбора внешнего аудита (пункты 10–19). Код приложения менялся точечно;
**миграций БД нет**; вёрстка и цвета вне указанных мест не тронуты.

## 1. UI (по фидбеку 2026-10-05)

| # | Правка | Как сделано |
|---|---|---|
| 1 | Фильтр дат «дышал» при листании | кнопка даты — фикс-ширина w-[88px] / sm:w-[196px] (самая длинная подпись влезает, truncate, tabular); все фильтры — одна строка h-12 на любом экране |
| 2 | Протокол: полные имена | короткие «И. Иванов» (полное — в тултипе), ассист — приглушённое имя рядом с автором БЕЗ скобок (эталон futbol24), порядок [имя][ассист][иконка] / [иконка][имя][ассист] |
| 3 | Профили (игрок/команда/стадион) | только своя информация: без «Прямо сейчас», «Самый результативный», таблицы, топ-игроков и колонки лиг; широкая центральная колонка; реклама AD-TOP/AD-BOTTOM остаётся |
| 4 | Страница матча: пропали боковые блоки | ВОЗВРАЩЕНЫ (откат решения v1.0.41): лиги слева (≥1200px), статистика+реклама справа (≥768px), мобильные секции под матчем; ряд из 3 реклам над матчем убран |

## 2. Аудит №10–19: что подтверждено и починено

| № | Проблема | Фикс |
|---|---|---|
| 10 | PATCH/POST заявки принимал любую роль (BANNA/TEST123), смена COACH→PLAYER в обход инварианта | справочник `src/lib/registration-roles.ts` (един для API+UI+импорта); смена на PLAYER — через `assertPlayerRegistrationAllowed` |
| 11 | Замена: входящий не проверялся (только бан) | оба участника — через общий `validateEvent` (состав→LineupEntry, иначе заявка) |
| 12 | Товарищеский матч: гол кому угодно | если состав подан — участник обязан быть в LineupEntry (независимо от статуса матча) |
| 13 | 2FA: заблокированный успевал войти по OTP | проверка `user.isActive` в `/api/auth/otp` |
| 14 | Rate limiter: 10-минутные лимиты работали как минутные | `recordHit(key, windowMs)` — окно параметром |
| 15 | Откат при провале деплоя уводил на 2 версии назад | `PREVIOUS_TAG` фиксируется в `.deploy/current` до деплоя |
| 16 | Rollback не откатывает БД | release policy expand/contract — раздел Б10-1 в DEPLOY.md |
| 17 | Пустой файл бэкапа «подтверждал» наличие | `.part`-файл + проверка размера + `pg_restore --list`; провал = СТОП деплоя |
| 18 | restore-db.sh был от SQLite (не работал) | PostgreSQL-дрилл: pg_restore во временную БД + сверка счётчиков + drop |
| 19 | SQLite-останки в доках/скриптах | check-integrity.ts (PRAGMA→PG), DEPLOY.md, Dockerfile, deploy.sh |

**№9 (две ACTIVE-заявки игрока за разные команды одного сезона) —
ОТЛОЖЕНО по договорённости** (нужна миграция БД; вернёмся отдельным ТЗ).

## 3. Проверено

- tsc 0; eslint 0; **unit 114/114** (+тесты shortName); build OK;
- **SMOKE-44-UI** (`scripts/smoke-44-ui.sh`, standalone :3100, сид-данные):
  матч 1280px — колонки 220\|624\|300, aside=2; протокол — 12 событий,
  «Р. Тимофеев»/«А. Беляев», ассист без скобок; кнопка даты 88/88/88px
  при листании −1/+3 дня; профили — без чужих блоков.

## 4. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-10-05-fs44.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-10-05 fs44: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.44 && git push origin v1.0.44
```

После: health → "version":"1.0.44". **Миграций нет.** После деплоя
проверить: матч (колонки слева/справа вернулись), протокол (короткие
имена), профили игрока/команды (только своя информация), фильтр дат
(кнопка не меняет ширину при листании).

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 5. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.44** (текущая) | `scoresbox-2026-10-05-fs44.git-bundle` | UI-фидбек (фильтр дат, протокол «И. Иванов», профили, колонки матча) + аудит №10–19 |
| v1.0.43 | `scoresbox-2026-10-05-cifix43.git-bundle` | фикс CI: VLM-скрипты снесены, check-deps честный, @types/qrcode в devDeps |
| v1.0.42 | `scoresbox-2026-10-05-sec42.git-bundle` | security: анти-BOLA скоупы, контент strictly SUPER_ADMIN, дашборд по ролям, media DELETE, Next 16.3.8 |
| v1.0.41 | `scoresbox-2026-10-05-fs41.git-bundle` | Протокол/Составы по futbol24, матч без колонок + ряд из 3 реклам (колонки вернулись в v1.0.44) |
| v1.0.40 | `scoresbox-2026-10-01-fs40.git-bundle` | хронология FlashScore, имена без «№N», лого scoresb□x |
| v1.0.39 | `scoresbox-2026-09-30-fs39.git-bundle` | лента 52px/кнопка даты, аккордеон лиг, AD-INFEED |
| v1.0.38 | `scoresbox-2026-09-30-fs38.git-bundle` | страница матча по FlashScore (герой/таймлайн/табы) |
| v1.0.37 | `scoresbox-2026-09-29-minute37.git-bundle` | минута у счёта, Onest, лента по скетчу |
| v1.0.35–36 | `…-mobile35 / -brand36` | мобильный адаптив, фирстиль |
| v1.0.32–34 | `…-logic32 / -invite33 / -logic34` | скоуп лиги, приглашения, судейский корпус |
| v1.0.21–31 | `…-security … -lineup28 …` | RBAC, XSS/BOLA-фиксы, деплой-фиксы (см. старые README) |

**Прямые ссылки (панель /download/):**

- v1.0.44: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs44.git-bundle
- v1.0.43: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-cifix43.git-bundle
- v1.0.42: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-sec42.git-bundle
- v1.0.41: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs41.git-bundle
- v1.0.40: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-01-fs40.git-bundle
- v1.0.39: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-30-fs39.git-bundle
- v1.0.38: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-09-30-fs38.git-bundle

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
EOF

