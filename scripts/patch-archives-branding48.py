#!/usr/bin/env python3
"""branding48: подмена ONEFILE-имени, сообщения коммита сквоша и README
поставки в make-archives.sh (logo47 -> branding48). Отдельный файл — по
правилу из Task 47 (никаких python-heredoc внутри bash-heredoc),
после патча обязателен bash -n."""
from pathlib import Path

SH = Path("/home/z/my-project/scripts/make-archives.sh")
src = SH.read_text(encoding="utf-8")

# ---------- 0. ONEFILE-имя и публичная копия ----------
OLD_ONEFILE = "ONEFILE=download/scoresbox-2026-10-06-logo47.git-bundle"
NEW_ONEFILE = "ONEFILE=download/scoresbox-2026-10-06-branding48.git-bundle"
assert src.count(OLD_ONEFILE) == 1, "ONEFILE-строка logo47 не найдена/не одна"
src = src.replace(OLD_ONEFILE, NEW_ONEFILE)

OLD_CP = 'cp "$ONEFILE" public/scoresbox-2026-10-06-logo47.git-bundle'
NEW_CP = 'cp "$ONEFILE" public/scoresbox-2026-10-06-branding48.git-bundle'
assert src.count(OLD_CP) == 1, "cp-строка logo47 не найдена/не одна"
src = src.replace(OLD_CP, NEW_CP)

# ---------- 1. сообщение коммита сквоша ----------
COMMIT_START = 'git commit -q -m "SCORESBOX 2026-10-06 logo47:'
COMMIT_END = '" \\\n'
i = src.find(COMMIT_START)
assert i != -1, "commit start не найден"
j = src.find(COMMIT_END, i)
assert j != -1, "commit end не найден"

new_commit = 'git commit -q -m "SCORESBOX 2026-10-06 branding48: v1.0.48 — ЛОГОТИП И ИКОНКА БРАУЗЕРА МЕНЯЮТСЯ ИЗ АДМИНКИ (запрос юзера: «добавление логотипа везде и иконки в браузере можно было менять из админки; текст в два яруса: сверху scores, снизу b[поле]x»). ДАННЫЕ: модель BrandSetting (одна строка id=site: logoDarkUrl/logoLightUrl/iconUrl -> Media /api/media/<id>, bytea — переживает деплои и бэкапы), МИГРАЦИЯ 00000000000006_branding (безопасный CREATE TABLE, применяется prisma migrate deploy автоматически). Каждая загрузка = НОВЫЙ Media id = новый URL -> immutable-кэш медиа не мешает смене; NULL = встроенные лого v1.0.47. ДЕФОЛТ = ДВУХЪЯРУСНАЯ вертикаль «scores / b[поле]x»: шапка 44px и футер 40px переведены на LogoVertical (SVG-пути — перенос невозможен по построению), слоган >=1024 сохранён; компонент BrandLogo: кастомный <img> ЛИБО встроенная вертикаль, светлый фон без своего лого использует тёмный. Вызовы: SiteShell шапка/футер (SSR-проп из (site)/layout), AdminShell сайдбар 42/38 light, AdminLogin+SetPasswordCard 58 dark. ФАВИКОН ДИНАМИЧЕСКИ: root layout generateMetadata -> icons = кастомный iconUrl ЛИБО дефолты /brand/logo47/mark-simple.svg + apple-icon.png; file-conventions app/icon.svg и app/apple-icon.png УДАЛЕНЫ (конкуренция с metadata.icons исключена); смена применяется СРАЗУ через revalidatePath("/", "layout") из /api/admin/brand (ISR 60 c не ждём, страницы динамические). API /api/admin/brand (SUPER_ADMIN, матрица ADMIN-GUIDE 1): GET состояние; POST multipart logoDark|logoLight|icon — файлы КАК ЕСТЬ (без WebP-конвертации: Safari не читает WebP-фавиконы, SVG остаётся вектором), лого <=2 МБ PNG/JPG/WebP/AVIF/SVG, иконка <=1 МБ +ICO; PATCH JSON — сброс к null (строки запрещены — URL создаётся ТОЛЬКО загрузкой, анти-XSS); аудит на каждое действие. БЕЗОПАСНОСТЬ SVG (stored-XSS при прямом открытии ссылки): ТРИ эшелона — sanitizeSvg в lib/branding (script/foreignObject/on*=/javascript:/ENTITY/CDATA/внешние href отклоняются, # и data:image разрешены) + CSP-sandbox на раздаче media для image/svg+xml + рендер только через <img>/<link>. АДМИНКА: секция «Сайт -> Брендинг» (Palette, SUPER_ADMIN), BrandingPanel: три блока с превью «где живёт» (тёмная/светлая плашки, мокап вкладки браузера 16/32/48px), бейджи стандартный/кастомный, загрузка применяется СРАЗУ, сброс к встроенным; брендинг для /admin — через /api/public/site-config (расширен, force-dynamic), AdminGate фетчит один раз и пробрасывает вниз; для сайта — SSR (site)/layout. ГРАБЛИ СЕССИИ: env песочницы перекрывает .env (DATABASE_URL=file:custom.db) — prisma CLI падал на протоколе, фикс: явный export DATABASE_URL=postgresql://... (паттерн смоуков); миграция приведена к конвенции 00000000000006_* и пере-применена честно. ВЕРИФИКАЦИЯ: tsc 0; eslint 0; unit 125/125 (+11 branding); build OK (страницы динамические). smoke-48 ЗЕЛЁНЫЙ полный цикл: дефолт (линки icon/apple на /brand/logo47/*, старые file-conventions 404, шапка 2 пути/маска/0 текста/h44, футер 40) -> curl-логин -> GET brand (null) -> загрузка фавикона -> link rel=icon в HTML главной сменился на /api/media/<id> (200 image/png) -> загрузка лого -> шапка И футер <img src=/api/media/...> не битый -> EVIL SVG (onload) отклонён 422 -> PATCH-сброс -> дефолт вернулся -> UI: демо-вход admin@ff21.ru -> /admin?section=branding -> панель с 3 блоками -> мобайл 375: лого влезает, скролла нет. VLM (glm-5v): дефектов нет, вёрстка при кастомном лого не поехала. ЕСТЬ МИГРАЦИЯ 00000000000006_branding." \\\n'

src = src[: i] + new_commit + src[j + len(COMMIT_END):]

# ---------- 2. README поставки ----------
START = "cat > download/README.md <<'EOF'\n"
END = "\nEOF"  # блок — хвост скрипта
i = src.find(START)
assert i != -1, "README start не найден"
j = src.find(END, i + len(START))
assert j != -1, "README end не найден"

new_readme = """cat > download/README.md <<'EOF'
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
git fetch "$HOME\\Downloads\\scoresbox-2026-10-06-branding48.git-bundle" main
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
`\\b` в eval-строках превращается в backspace — регэкспы без `\\b`.
Видимость элементов — через offsetParent (textContent врёт: скрытый
DOM тоже отдаёт текст). Тонкость SMTP-мока: nodemailer кодирует письма
(text — base64, html — quoted-printable, тема — RFC 2047) — токен
ссылки ищется только после декодирования (см. parseMail в
test-invites.ts).
EOF
"""

src = src[: i] + new_readme + "\n"

assert src.count("<<'EOF'") == 1
assert "branding48" in src and 'ONEFILE=download/scoresbox-2026-10-06-branding48.git-bundle' in src
assert 'public/scoresbox-2026-10-06-branding48.git-bundle' in src
assert 'SCORESBOX 2026-10-06 logo47:' not in src, "старый коммит не заменён"
# logo47 легитимно остаётся в архивной таблице README поставки; запрещён
# только в РАБОЧИХ строках (ONEFILE=, cp, сообщение коммита)
assert 'ONEFILE=download/scoresbox-2026-10-06-logo47.git-bundle' not in src
assert 'cp "$ONEFILE" public/scoresbox-2026-10-06-logo47.git-bundle' not in src
assert src.rstrip().endswith("EOF")

SH.write_text(src, encoding="utf-8")
print("OK: make-archives.sh -> branding48 (ONEFILE + cp + commit + README)")
