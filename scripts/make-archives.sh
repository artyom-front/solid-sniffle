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
ONEFILE=download/scoresbox-2026-10-06-logo47.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-10-06 logo47: v1.0.47 — система логотипа по детальному брифу 2026-10-06 (смысл/композиция/типографика/пиктограмма/цвета/правила). ЛОГО = ЧИСТЫЕ SVG-ПУТИ: контуры Baloo 2 Medium/Bold/ExtraBold извлечены fontTools (scripts/make-logo47.py -> src/components/portal/logo-paths.ts, шрифты в scripts/assets/) — живого текста нет, webfont не нужен, ПЕРЕНОС НА ДВЕ СТРОКИ В ШАПКЕ НЕВОЗМОЖЕН ПО ПОСТРОЕНИЮ (дефект шапки v1.0.46 закрыт структурно; выключка влево, ширины строк выровнены решением уравнения 339.7=339.7, box/scores=1.78 при 2x-брифе). ПАРАДНАЯ ВЕРТИКАЛЬНАЯ: scores БЕЛЫМ #FFFFFF (был чернильный) над b[поле]x ExtraBold с МЯГКИМ ГРАДИЕНТОМ #FFD700->#F5C518 (градиент — ТОЛЬКО в этой версии; в интерфейсе плоский цвет), поле-«o» 108 при буквах 100 («равен или чуть крупнее — доминанта») с градиентом #F5C518->#EDBE00 («самый насыщенный акцент»), межстрочный зазор минимальный. ЗНАК-ПОЛЕ ПО ЦИФРАМ БРИФА: радиус углов 17.5% (бриф 15-20; было 31), ШТРИХ РАЗМЕТКИ 5.5% (бриф 5-6; было 11.7), круг d 32.8%, штрафные 16.4x32.8% (бриф 15-18 x 30-35), разметка ВЫРЕЗАМИ через SVG-маску (грабля evenodd из v1.0.46 обойдена); УПРОЩЁННАЯ версия <=24px — штрафные убраны, штрих 8.75% («штрихи упрощаются/утолщаются пропорционально») — это фавикон icon.svg; полная — apple-icon 240 и знак шапки 32px. ГОРИЗОНТАЛЬНАЯ ДЛЯ ШАПКИ: [знак-поле 32px] + scoresbox ОДНОЙ строкой (Baloo 2 Bold): scores БЕЛЫЙ, box золото #FFD700 ПЛОСКИМ, лока-ап 213x32, шапка 56px, знак 32px; футер 24px (мин. по брифу). ВЕРСИИ: светлая (scores -> #0A0D13), админ-тема светлая (золото #b45309 — канон темы), монохром бел/чёрн (currentColor). АССЕТЫ: канонические SVG в public/brand/logo47/; public/logo.svg = вертикальная основная; apple-icon.png 240 (вырезы прозрачные) и og-image.png 1200x630 (фон ОПАК — соцсети композят альфу на белый; текст og — ПУТЯМИ из Onest) растеризуются sharp из КАНОНИЧЕСКИХ SVG (scripts/make-brand-assets.mjs заменил make-brand-assets.py — PNG и React из ОДНОЙ геометрии). Витрина /brand/logo-variants.html переписана: все варианты + ПРАВИЛА (охранное поле >= высоты «b», мин. размеры 40/24px, 4 запрета, палитра токенов, градиент только в парадной). Вызовы: Logo.tsx v2 (LogoMark/LogoVertical/LogoHorizontal/Logo — текстовые LogoWordmark/LogoGlyphInline удалены); SiteShell (шапка dark 32 + футер 24), AdminShell (auto 30/26), AdminLogin (LogoMark 36, LogoVertical 88), SetPasswordCard (88); brand.ts — токены goldDeep/goldAccent. Верификация: tsc 0; eslint 0; unit 114/114; build OK; scripts/smoke-47.sh — зелёный (шапка 1280: 2 пути/0 текст-узлов/знак 32px/213px, сетка цел; 375: логорайт 229, скролла нет; admin: вертикальный svg 88x57; витрина 23 imgs/0 broken; icon БЕЗ штрафных; ассеты 200; матч-регресс цел); VLM (превью системы / PNG-ассеты / финальные скриншоты) — критических дефектов нет. МИГРАЦИЙ НЕТ." \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-10-06-logo47.git-bundle
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
# Поставка SCORESBOX — v1.0.47 «logo47: система логотипа» (06.10.2026)

**Что это:** детальный бриф логотипа 2026-10-06 — парадная вертикаль
(белый «scores» + градиентный «box», поле-«o» по цифрам брифа),
горизонтальная версия «знак 32px + scoresbox» одной строкой,
упрощённый фавикон, монохромы, правила использования.
**Миграций БД нет.**

## 1. Ключевое изменение: лого = чистые SVG-пути

Контуры букв извлечены из Baloo 2 (fontTools) и запечены в
`logo-paths.ts` — генератор `scripts/make-logo47.py` (шрифты
закоммичены). Живого текста в лого больше НЕТ:

- **перенос на две строки в шапке физически невозможен** (дефект
  v1.0.46 закрыт по построению, а не `white-space`);
- лого не зависит от загрузки webfont-ов;
- ширины строк вертикали выровнены математически (339.7 = 339.7).

| Вариант | Спецификация брифа |
|---|---|
| **Парадная вертикальная** | «scores» Baloo 2 Medium, БЕЛЫЙ, ~½ высоты; «b[поле]x» ExtraBold, градиент #FFD700→#F5C518; поле-«o» чуть крупнее букв, градиент #F5C518→#EDBE00 («самый насыщенный акцент»); выключка влево, строки равной ширины, зазор минимальный |
| Горизонтальная (шапка 56px) | [знак-поле 32px] + «scoresbox» одной строкой: scores белый, box золото **плоским** цветом |
| Знак-поле | rx 17.5%, штрих разметки 5.5%, круг d 33%, штрафные 16×33%, разметка — вырезы (цвет фона) |
| Фавикон ≤24px | упрощённый знак: без штрафных, штрих 8.75% — центральная линия + круг |
| Монохром | полностью белый / полностью чёрный (currentColor) |
| Светлый фон | «scores» → #0A0D13; в админ-теме золото #b45309 |

Все варианты и ПРАВИЛА (охранное поле ≥ высоты «b», мин. размеры
40/24px, запреты, палитра): **/brand/logo-variants.html**

## 2. Ассеты

- `icon.svg` — упрощённый знак (читаемость 16–32px);
- `apple-icon.png` 240×240 — полная разметка, вырезы прозрачные;
- `og-image.png` 1200×630 — фон ОПАК (соцсети композят альфу на
  белый — грабля v1.0.46 учтена), текст — путями;
- `public/brand/logo47/*.svg` — канонические исходники;
  растеризация — `scripts/make-brand-assets.mjs` (sharp): PNG и
  React-компоненты теперь из ОДНОЙ геометрии.

## 3. Проверено

tsc 0; eslint 0; unit **114/114**; build OK; **smoke-47** — зелёный
(шапка 1280: svg 2 пути / 0 текст-узлов / знак 32px; 375px: лого
влезает, горизонтального скролла нет; /admin: вертикальный лого;
витрина: 23 img / 0 broken; матч и сетка — регресс цел); VLM-контроль
в 3 прохода — критических дефектов нет.

## 4. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-10-06-logo47.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-10-06 logo47: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.47 && git push origin v1.0.47
```

После: health → "version":"1.0.47". **Миграций нет.**

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 5. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.47** (текущая) | `scoresbox-2026-10-06-logo47.git-bundle` | лого по детальному брифу: пути Baloo 2, градиенты, знак по цифрам, упрощённый фавикон, витрина с правилами |
| v1.0.46 | `scoresbox-2026-10-06-brand46.git-bundle` | фирстиль v1 + UI-бриф (превью/статистика/составы/профили/планшет, og-image) |
| v1.0.45 | `scoresbox-2026-10-06-dbfix45.git-bundle` | фикс деплоя: бэкап и проверка внутри контейнера db, rollback на current |
| v1.0.44 | `scoresbox-2026-10-05-fs44.git-bundle` | UI-фидбек (фильтр дат, протокол «И. Иванов», профили, колонки матча) + аудит №10–19 |
| v1.0.43 | `scoresbox-2026-10-05-cifix43.git-bundle` | фикс CI: VLM-скрипты снесены, check-deps честный, @types/qrcode в devDeps |
| v1.0.42 | `scoresbox-2026-10-05-sec42.git-bundle` | security: анти-BOLA скоупы, контент strictly SUPER_ADMIN, дашборд по ролям, media DELETE, Next 16.3.8 |
| v1.0.41 | `scoresbox-2026-10-05-fs41.git-bundle` | Протокол/Составы по futbol24 (колонки матча вернулись в v1.0.44) |
| v1.0.40 | `scoresbox-2026-10-01-fs40.git-bundle` | хронология FlashScore, имена без «№N», лого scoresb□x |
| v1.0.39 | `scoresbox-2026-09-30-fs39.git-bundle` | лента 52px/кнопка даты, аккордеон лиг, AD-INFEED |
| v1.0.38 | `scoresbox-2026-09-30-fs38.git-bundle` | страница матча по FlashScore (герой/таймлайн/табы) |
| v1.0.37 | `scoresbox-2026-09-29-minute37.git-bundle` | минута у счёта, Onest, лента по скетчу |
| v1.0.35–36 | `…-mobile35 / -brand36` | мобильный адаптив, фирстиль |
| v1.0.32–34 | `…-logic32 / -invite33 / -logic34` | скоуп лиги, приглашения, судейский корпус |
| v1.0.21–31 | `…-security … -lineup28 …` | RBAC, XSS/BOLA-фиксы, деплой-фиксы (см. старые README) |

**Прямые ссылки (панель /download/):**

- v1.0.47: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-logo47.git-bundle
- v1.0.46: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-brand46.git-bundle
- v1.0.45: https://preview-chat-d2608ef6-93f5-4d0d-bfb4-6435f0304186.space-z.ai/download/scoresbox-2026-10-06-dbfix45.git-bundle
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
`\b` в eval-строках превращается в backspace — регэкспы без `\b`.
Видимость элементов — через offsetParent (textContent врёт: скрытый
DOM тоже отдаёт текст). Тонкость SMTP-мока: nodemailer кодирует письма
(text — base64, html — quoted-printable, тема — RFC 2047) — токен
ссылки ищется только после декодирования (см. parseMail в
test-invites.ts).
EOF

