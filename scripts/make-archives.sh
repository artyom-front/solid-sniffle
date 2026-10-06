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
ONEFILE=download/scoresbox-2026-10-06-branding48.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-10-06 branding48: v1.0.48 — ЛОГОТИП И ИКОНКА БРАУЗЕРА МЕНЯЮТСЯ ИЗ АДМИНКИ (запрос юзера: «добавление логотипа везде и иконки в браузере можно было менять из админки; текст в два яруса: сверху scores, снизу b[поле]x»). ДАННЫЕ: модель BrandSetting (одна строка id=site: logoDarkUrl/logoLightUrl/iconUrl -> Media /api/media/<id>, bytea — переживает деплои и бэкапы), МИГРАЦИЯ 00000000000006_branding (безопасный CREATE TABLE, применяется prisma migrate deploy автоматически). Каждая загрузка = НОВЫЙ Media id = новый URL -> immutable-кэш медиа не мешает смене; NULL = встроенные лого v1.0.47. ДЕФОЛТ = ДВУХЪЯРУСНАЯ вертикаль «scores / b[поле]x»: шапка 44px и футер 40px переведены на LogoVertical (SVG-пути — перенос невозможен по построению), слоган >=1024 сохранён; компонент BrandLogo: кастомный <img> ЛИБО встроенная вертикаль, светлый фон без своего лого использует тёмный. Вызовы: SiteShell шапка/футер (SSR-проп из (site)/layout), AdminShell сайдбар 42/38 light, AdminLogin+SetPasswordCard 58 dark. ФАВИКОН ДИНАМИЧЕСКИ: root layout generateMetadata -> icons = кастомный iconUrl ЛИБО дефолты /brand/logo47/mark-simple.svg + apple-icon.png; file-conventions app/icon.svg и app/apple-icon.png УДАЛЕНЫ (конкуренция с metadata.icons исключена); смена применяется СРАЗУ через revalidatePath("/", "layout") из /api/admin/brand (ISR 60 c не ждём, страницы динамические). API /api/admin/brand (SUPER_ADMIN, матрица ADMIN-GUIDE 1): GET состояние; POST multipart logoDark|logoLight|icon — файлы КАК ЕСТЬ (без WebP-конвертации: Safari не читает WebP-фавиконы, SVG остаётся вектором), лого <=2 МБ PNG/JPG/WebP/AVIF/SVG, иконка <=1 МБ +ICO; PATCH JSON — сброс к null (строки запрещены — URL создаётся ТОЛЬКО загрузкой, анти-XSS); аудит на каждое действие. БЕЗОПАСНОСТЬ SVG (stored-XSS при прямом открытии ссылки): ТРИ эшелона — sanitizeSvg в lib/branding (script/foreignObject/on*=/javascript:/ENTITY/CDATA/внешние href отклоняются, # и data:image разрешены) + CSP-sandbox на раздаче media для image/svg+xml + рендер только через <img>/<link>. АДМИНКА: секция «Сайт -> Брендинг» (Palette, SUPER_ADMIN), BrandingPanel: три блока с превью «где живёт» (тёмная/светлая плашки, мокап вкладки браузера 16/32/48px), бейджи стандартный/кастомный, загрузка применяется СРАЗУ, сброс к встроенным; брендинг для /admin — через /api/public/site-config (расширен, force-dynamic), AdminGate фетчит один раз и пробрасывает вниз; для сайта — SSR (site)/layout. ГРАБЛИ СЕССИИ: env песочницы перекрывает .env (DATABASE_URL=file:custom.db) — prisma CLI падал на протоколе, фикс: явный export DATABASE_URL=postgresql://... (паттерн смоуков); миграция приведена к конвенции 00000000000006_* и пере-применена честно. ВЕРИФИКАЦИЯ: tsc 0; eslint 0; unit 125/125 (+11 branding); build OK (страницы динамические). smoke-48 ЗЕЛЁНЫЙ полный цикл: дефолт (линки icon/apple на /brand/logo47/*, старые file-conventions 404, шапка 2 пути/маска/0 текста/h44, футер 40) -> curl-логин -> GET brand (null) -> загрузка фавикона -> link rel=icon в HTML главной сменился на /api/media/<id> (200 image/png) -> загрузка лого -> шапка И футер <img src=/api/media/...> не битый -> EVIL SVG (onload) отклонён 422 -> PATCH-сброс -> дефолт вернулся -> UI: демо-вход admin@ff21.ru -> /admin?section=branding -> панель с 3 блоками -> мобайл 375: лого влезает, скролла нет. VLM (glm-5v): дефектов нет, вёрстка при кастомном лого не поехала. ЕСТЬ МИГРАЦИЯ 00000000000006_branding." \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-10-06-branding48.git-bundle
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
# Поставка SCORESBOX — v1.0.48 «branding48: брендинг из админки» (06.10.2026)

**Что это:** логотип и иконка браузера меняются из админки («Сайт →
Брендинг») с применением **по всему сайту сразу** — без редеплоя.
Дефолт — двухъярусный логотип «scores» / «b[поле]x» в шапке и футере.
**⚠️ ЕСТЬ МИГРАЦИЯ БД** (безопасная — см. ниже).

## 1. Как это работает

| Что | Где живёт | Смена |
|---|---|---|
| **Логотип (тёмный фон)** | шапка/футер сайта, страницы входа | «Сайт → Брендинг», до 2 МБ |
| **Логотип (светлый фон)** | сайдбар панели управления | необязательно; нет → тёмный |
| **Иконка браузера** | вкладка, закладки, apple-touch | PNG/SVG/ICO до 1 МБ |
| Дефолт | встроенный «scores / b[поле]x» v1.0.47 (SVG-пути) | кнопка «Сбросить» |

- Панель **только SUPER_ADMIN** (матрица ADMIN-GUIDE §1).
- Каждая загрузка = **новый URL** (/api/media/…) → кэш браузера не
  мешает; файлы в БД (bytea) — переживают деплои и бэкапы.
- Применение **сразу**: страницы перегенерируются (revalidatePath),
  иконка вкладки обновляется после обновления страницы.
- SVG проходит санитайзер (script/onclick/javascript:/внешние ссылки
  отклоняются) + раздаётся с CSP-sandbox — прямое открытие ссылки
  безопасно.
- Загруженные файлы НЕ конвертируются (в отличие от медиатеки):
  SVG остаётся вектором, фавикон не WebP-ится (Safari).

**Дефолтные иконки:** `/brand/logo47/mark-simple.svg` +
`/brand/logo47/apple-icon.png` (file-conventions `app/icon.svg` и
`app/apple-icon.png` удалены — управляет `generateMetadata`).

## 2. Миграция — ЕСТЬ (единственная в поставке)

`00000000000006_branding` — **CREATE TABLE "BrandSetting"** (одна
строка `id='site'`). Не трогает существующие таблицы, не удаляет
данные. Применится автоматически `prisma migrate deploy` на деплое
(deploy.sh, п. 2). Отката/ручных шагов не требуется.

## 3. Проверено

tsc 0; eslint 0; unit **125/125** (+11 branding: мимы/лимиты/санитайз
SVG); build OK. **smoke-48** — полный цикл зелёный: дефолт → загрузка
фавикона → `<link rel=icon>` в HTML сменился на /api/media/… →
загрузка лого → `<img>` в шапке И футере → злой SVG (onload) отклонён
422 → сброс → дефолт вернулся; панель «Брендинг» в UI; мобайл 375 без
скролла. VLM-контроль (3 скриншота) — дефектов нет.

## 4. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-10-06-branding48.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-10-06 branding48: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.48 && git push origin v1.0.48
```

После: health → "version":"1.0.48"; миграция применится в деплое.
**Проверить после деплоя:** вкладка браузера (новый фавикон-знак),
шапка — двухъярусный лого; «Сайт → Брендинг» → загрузить свой PNG.

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 5. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.48** (текущая) | `scoresbox-2026-10-06-branding48.git-bundle` | лого + фавикон из админки по всему сайту; двухъярусный дефолт в шапке/футере; миграция BrandSetting |
| v1.0.47 | `scoresbox-2026-10-06-logo47.git-bundle` | лого по детальному брифу: пути Baloo 2, градиенты, знак по цифрам, упрощённый фавикон, витрина с правилами |
| v1.0.46 | `scoresbox-2026-10-06-brand46.git-bundle` | фирстиль v1 + UI-бриф (превью/статистика/составы/профили/планшет, og-image) |
| v1.0.45 | `scoresbox-2026-10-06-dbfix45.git-bundle` | фикс деплоя: бэкап и проверка внутри контейнера db, rollback на current |
| v1.0.44 | `scoresbox-2026-10-05-fs44.git-bundle` | UI-фидбек (фильтр дат, протокол «И. Иванов», профили, колонки матча) + аудит №10–19 |
| v1.0.43 | `scoresbox-2026-10-05-cifix43.git-bundle` | фикс CI: VLM-скрипты снесены, check-deps честный, @types/qrcode в devDeps |
| v1.0.42 | `scoresbox-2026-10-05-sec42.git-bundle` | security: анти-BOLA скоупы, контент strictly SUPER_ADMIN, дашборд по ролям, media DELETE, Next 16.3.8 |
| v1.0.41 | `scoresbox-2026-10-05-fs41.git-bundle` | Протокол/Составы по futbol24 (колонки матча вернулись в v1.0.44) |
| v1.0.40 | `scoresbox-2026-10-01-fs40.git-bundle` | хронология FlashScore, имена без «№N», лого scoresb□x |
| v1.0.38–39 | `…-fs38 / -fs39` | страница матча по FlashScore; лента 52px/кнопка даты, аккордеон лиг |
| v1.0.35–37 | `…-mobile35 / -brand36 / -minute37` | мобильный адаптив, фирстиль, минута у счёта, Onest |
| v1.0.32–34 | `…-logic32 / -invite33 / -logic34` | скоуп лиги, приглашения, судейский корпус |
| v1.0.21–31 | `…-security … -lineup28 …` | RBAC, XSS/BOLA-фиксы, деплой-фиксы (см. старые README) |

**Прямые ссылки (панель /download/):**

- v1.0.48: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-branding48.git-bundle
- v1.0.47: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-logo47.git-bundle
- v1.0.46: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-brand46.git-bundle
- v1.0.45: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-dbfix45.git-bundle
- v1.0.44: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs44.git-bundle
- v1.0.43: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-cifix43.git-bundle
- v1.0.42: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-sec42.git-bundle
- v1.0.41: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-05-fs41.git-bundle
- v1.0.40: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-01-fs40.git-bundle

## Грабли agent-browser (задокументированы)

`agent-browser eval` держит ПЕРСИСТЕНТНЫЙ JS-контекст: top-level `const`
живёт между вызовами, повторное объявление = SyntaxError. Все
multi-statement eval — в IIFE. `find label fill` не триггерит
React-состояние (controlled input остаётся пустым, submit блокируется
нативной валидацией): в смооках логиниться демо-кнопками по email.
`find text` кликает только первый точный матч — для табов с бейджем
счётчика («Протокол · 12») клик через eval по textContent.startsWith.
`\b` в eval-строках превращается в backspace — регэкспы без `\b`.
Видимость элементов — через offsetParent (textContent врёт: скрытый
DOM тоже отдаёт текст). Тонкость SMTP-мока: nodemailer кодирует письма
(text — base64, html — quoted-printable, тема — RFC 2047) — токен
ссылки ищется только после декодирования (см. parseMail в
test-invites.ts).
EOF

