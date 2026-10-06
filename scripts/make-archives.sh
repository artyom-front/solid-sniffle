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
ONEFILE=download/scoresbox-2026-10-06-brand46.git-bundle
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
  && git commit -q -m "SCORESBOX 2026-10-06 brand46: v1.0.46 — фирменный стиль и UI по брифу 2026-10-06. ЛОГОТИП: знак-поле перерисован по брифу — золотой квадрат с СИЛЬНО скруглёнными углами (rx 20/64) и разметкой стадиона ВЫРЕЗАМИ (линии прозрачны, цвет фона просвечивает): центральная вертикальная линия, круг-кольцо (центр золотой), штрафные у обеих кромок; толщина линий 7.5/64 = жирность букв b/x — знак читается как буква o; вырезы реализованы SVG-маской (id от useId). НОВАЯ основная ВЕРТИКАЛЬНАЯ композиция LogoVertical: scores (Medium, чернильный, по центру) над box (Black, золото, ~2x крупнее, плотный трекинг) — на страницах входа и установки пароля; горизонтальная scoresb[x (знак вместо o) — в шапке/подвале как раньше; золото — канон сайта #FFD700 (бриф-референс #EBC15D «примерно», адаптировано под палитру сайта), монохром = currentColor. АССЕТЫ: favicon icon.svg + public/logo.svg; apple-icon.png 240 (вырезы прозрачные) и og-image.png 1200x630 (вырезы ЦВЕТОМ ФОНА — соцсети композят альфу на белый и разметка бледнела) — генератор scripts/make-brand-assets.py (Pillow, Onest из Google Fonts, шрифты в scripts/assets/); openGraph.images + twitter.images в layout.tsx (раньше twitter-карточка была без картинки); витрина всех вариантов /brand/logo-variants.html. ПРЕВЬЮ МАТЧА: полоса Начало/Стадион/Турнир — ТРИ строки на секцию: Начало / 06.10.26 / 10:42 МСК — дата ЦИФРАМИ, месяц словами убран; стадион = имя + город; турнир = лига крупно + тур/сезон подстрокой. СТАТИСТИКА: единый стиль StatLine (метка темнее ink3, значение светлым ink/700): «за 5 матчей: 4,4 гола» (коротко и нейтрально), пропущено — только при среднем 3+ (не показываем «в норме»); «забивала/пропускала» заменены на нейтральные «макс. забито: 10:1 — …» / «макс. пропущено»; НОВЫЕ серии «забивает: 12 матчей подряд» / «пропускает: …» с порогом 10+ (GOAL_STREAK_MIN, labels.ts; бэкенд profiles.ts teamInsights считает streaks от свежего матча назад); бомбардир — тем же двухтонным стилем (страницы матча и команды). СОСТАВЫ: бейджи событий (гол/карточка/замена + минута) теперь ВПЛОТНУЮ к имени игрока — у хозяев сразу после имени, у гостей непосредственно перед (было прижато к центру таблицы — не было ясно, чей гол); мобильные подтабы составов <768px сохранены (v1.0.41). СЕТКА: правый столбец ужимается СТУПЕНЧАТО (планшет: было 300px = почти пол-экрана): 768-1023 -> 240px, 1024-1199 -> 280px, >=1200 -> 300px; профильные страницы (игрок/команда/стадион) СНОВА с колонками статистики по краям (фидбек: «колонки слева и справа оставить» — v1.0.44 снял не то); мобильная витрина статистики на профилях не рендерится. КОМАНДА: состав — первым, матчи — ПОД ним друг под другом (не рядом в 2 колонки). SEO: og:image добавлен; название/лого проверены везде (шапка, футер, письма, метаданные); JSON-LD/canonical/sitemap/robots — на месте. Верификация: tsc 0; eslint 0; unit 114/114; check-deps 0/0; build OK; scripts/smoke-46.sh — все проверки зелёные (сетка 1280/900/1100, дата цифрами, «за N матч», без «забивала/пропускала», бейджи 7/7 вплотную к именам, профили с колонками, витрины на мобиле профиля нет, OG/FAVICON 200, streaks в API); VLM-контроль логотипа и og-карточки — без дефектов. МИГРАЦИЙ НЕТ." \
  && git branch -M main \
  && git bundle create "$ROOT/$ONEFILE" main ) >/dev/null
cp "$ONEFILE" public/scoresbox-2026-10-06-brand46.git-bundle
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
# Поставка SCORESBOX — v1.0.46 «brand46: фирменный стиль + UI» (06.10.2026)

**Что это:** большой бриф 2026-10-06 — новая система логотипа «scores box»,
доработки страницы матча, составов, профилей и планшетной сетки + SEO.
**Миграций БД нет.**

## 1. Логотип (все варианты: /brand/logo-variants.html)

| Вариант | Где живёт |
|---|---|
| **Основной вертикальный**: «scores» мелко над «box» крупно, знак-поле вместо «o» | страницы входа / установки пароля |
| Горизонтальный «scoresb□x» | шапка и подвал сайта |
| Знак-поле (квадрат с разметкой-вырезами) | favicon, apple-icon, og-image, 2FA-страница |

Знак: золотой квадрат, сильно скруглённые углы, разметка стадиона
**вырезана** (линии = цвет фона). Золото — #FFD700 (канон сайта).
Версии для светлого фона (золото #b45309) и монохром — на витрине.

## 2. UI по брифу

| # | Что изменилось |
|---|---|
| 1 | Превью матча: «Начало / 06.10.26 / 10:42 МСК» — три строки, дата цифрами |
| 2 | Статистика: единый стиль «метка темнее — значение светлым»; «за 5 матчей: 4,4 гола»; пропущено — только при среднем 3+ |
| 3 | «забивала/пропускала» → «макс. забито/макс. пропущено»; новые серии «забивает/пропускает 10+ матчей подряд» |
| 4 | Составы: бейджи событий вплотную к имени игрока (были по центру) |
| 5 | Профили: колонки статистики по краям возвращены |
| 6 | Планшет: правый столбец 240px (768–1023) / 280px (1024–1199) вместо 300px |
| 7 | Команда: состав первым, матчи под ним (не рядом) |
| 8 | SEO: og-image 1200×630 в OG/Twitter-карточках; лого/название проверены везде |

## 3. Проверено

tsc 0; eslint 0; unit **114/114**; build OK; **smoke-46** — все проверки
зелёные (сетки 1280/900/1100, бейджи 7/7 у имён, профили с колонками,
подтабы составов на мобиле, streaks в API); VLM-контроль логотипа и
og-карточки — без дефектов.

## 4. Применить и задеплоить (PowerShell, папка вашего клона)

```bash
git fetch "$HOME\Downloads\scoresbox-2026-10-06-brand46.git-bundle" main
git log --oneline -1 FETCH_HEAD   # «SCORESBOX 2026-10-06 brand46: …»
git reset --hard FETCH_HEAD && git push --force origin main
git tag v1.0.46 && git push origin v1.0.46
```

После: health → "version":"1.0.46". **Миграций нет.** Напоминание:
ран CI v1.0.45 (сбой раннеров GitHub) можно закрыть этим деплоем —
v1.0.46 включает всё из v1.0.45.

**Важно:** бандл содержит ветку `main` — при клоне с нуля делайте
`git clone -b main <bundle>` (без `-b` чекаут будет пустым).

## 5. Архив поставок (ссылки действуют всегда)

| Версия | Бандл | Что внутри |
|---|---|---|
| **v1.0.46** (текущая) | `scoresbox-2026-10-06-brand46.git-bundle` | лого «scores box» (вертикальный + вырезы + ассеты), превью/статистика/составы/профили/планшет, SEO og-image |
| v1.0.45 | `scoresbox-2026-10-06-dbfix45.git-bundle` | фикс деплоя: бэкап и проверка внутри контейнера db, диагностика провала в логе CI, rollback на current |
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
`` в eval-строках превращается в backspace — регэкспы без ``.
Видимость элементов — через offsetParent (textContent врёт: скрытый
DOM тоже отдаёт текст). Тонкость SMTP-мока: nodemailer кодирует письма
(text — base64, html — quoted-printable, тема — RFC 2047) — токен
ссылки ищется только после декодирования (см. parseMail в
test-invites.ts).
EOF

