#!/usr/bin/env python3
"""logo47: подмена ONEFILE-имени, сообщения коммита сквоша и README
поставки в make-archives.sh (brand46 -> logo47). Отдельный файл — по
правилу из Task 47 (никаких python-heredoc внутри bash-heredoc),
после патча обязателен bash -n.
"""
from pathlib import Path

SH = Path("/home/z/my-project/scripts/make-archives.sh")
src = SH.read_text(encoding="utf-8")

# ---------- 0. ONEFILE-имя и публичная копия ----------
OLD_ONEFILE = "ONEFILE=download/scoresbox-2026-10-06-brand46.git-bundle"
NEW_ONEFILE = "ONEFILE=download/scoresbox-2026-10-06-logo47.git-bundle"
assert src.count(OLD_ONEFILE) == 1, "ONEFILE-строка brand46 не найдена/не одна"
src = src.replace(OLD_ONEFILE, NEW_ONEFILE)

OLD_CP = 'cp "$ONEFILE" public/scoresbox-2026-10-06-brand46.git-bundle'
NEW_CP = 'cp "$ONEFILE" public/scoresbox-2026-10-06-logo47.git-bundle'
assert src.count(OLD_CP) == 1, "cp-строка brand46 не найдена/не одна"
src = src.replace(OLD_CP, NEW_CP)

# ---------- 1. сообщение коммита сквоша ----------
COMMIT_START = 'git commit -q -m "SCORESBOX 2026-10-06 brand46:'
COMMIT_END = '" \\\n'
i = src.find(COMMIT_START)
assert i != -1, "commit start не найден"
j = src.find(COMMIT_END, i)
assert j != -1, "commit end не найден"

new_commit = 'git commit -q -m "SCORESBOX 2026-10-06 logo47: v1.0.47 — система логотипа по детальному брифу 2026-10-06 (смысл/композиция/типографика/пиктограмма/цвета/правила). ЛОГО = ЧИСТЫЕ SVG-ПУТИ: контуры Baloo 2 Medium/Bold/ExtraBold извлечены fontTools (scripts/make-logo47.py -> src/components/portal/logo-paths.ts, шрифты в scripts/assets/) — живого текста нет, webfont не нужен, ПЕРЕНОС НА ДВЕ СТРОКИ В ШАПКЕ НЕВОЗМОЖЕН ПО ПОСТРОЕНИЮ (дефект шапки v1.0.46 закрыт структурно; выключка влево, ширины строк выровнены решением уравнения 339.7=339.7, box/scores=1.78 при 2x-брифе). ПАРАДНАЯ ВЕРТИКАЛЬНАЯ: scores БЕЛЫМ #FFFFFF (был чернильный) над b[поле]x ExtraBold с МЯГКИМ ГРАДИЕНТОМ #FFD700->#F5C518 (градиент — ТОЛЬКО в этой версии; в интерфейсе плоский цвет), поле-«o» 108 при буквах 100 («равен или чуть крупнее — доминанта») с градиентом #F5C518->#EDBE00 («самый насыщенный акцент»), межстрочный зазор минимальный. ЗНАК-ПОЛЕ ПО ЦИФРАМ БРИФА: радиус углов 17.5% (бриф 15-20; было 31), ШТРИХ РАЗМЕТКИ 5.5% (бриф 5-6; было 11.7), круг d 32.8%, штрафные 16.4x32.8% (бриф 15-18 x 30-35), разметка ВЫРЕЗАМИ через SVG-маску (грабля evenodd из v1.0.46 обойдена); УПРОЩЁННАЯ версия <=24px — штрафные убраны, штрих 8.75% («штрихи упрощаются/утолщаются пропорционально») — это фавикон icon.svg; полная — apple-icon 240 и знак шапки 32px. ГОРИЗОНТАЛЬНАЯ ДЛЯ ШАПКИ: [знак-поле 32px] + scoresbox ОДНОЙ строкой (Baloo 2 Bold): scores БЕЛЫЙ, box золото #FFD700 ПЛОСКИМ, лока-ап 213x32, шапка 56px, знак 32px; футер 24px (мин. по брифу). ВЕРСИИ: светлая (scores -> #0A0D13), админ-тема светлая (золото #b45309 — канон темы), монохром бел/чёрн (currentColor). АССЕТЫ: канонические SVG в public/brand/logo47/; public/logo.svg = вертикальная основная; apple-icon.png 240 (вырезы прозрачные) и og-image.png 1200x630 (фон ОПАК — соцсети композят альфу на белый; текст og — ПУТЯМИ из Onest) растеризуются sharp из КАНОНИЧЕСКИХ SVG (scripts/make-brand-assets.mjs заменил make-brand-assets.py — PNG и React из ОДНОЙ геометрии). Витрина /brand/logo-variants.html переписана: все варианты + ПРАВИЛА (охранное поле >= высоты «b», мин. размеры 40/24px, 4 запрета, палитра токенов, градиент только в парадной). Вызовы: Logo.tsx v2 (LogoMark/LogoVertical/LogoHorizontal/Logo — текстовые LogoWordmark/LogoGlyphInline удалены); SiteShell (шапка dark 32 + футер 24), AdminShell (auto 30/26), AdminLogin (LogoMark 36, LogoVertical 88), SetPasswordCard (88); brand.ts — токены goldDeep/goldAccent. Верификация: tsc 0; eslint 0; unit 114/114; build OK; scripts/smoke-47.sh — зелёный (шапка 1280: 2 пути/0 текст-узлов/знак 32px/213px, сетка цел; 375: логорайт 229, скролла нет; admin: вертикальный svg 88x57; витрина 23 imgs/0 broken; icon БЕЗ штрафных; ассеты 200; матч-регресс цел); VLM (превью системы / PNG-ассеты / финальные скриншоты) — критических дефектов нет. МИГРАЦИЙ НЕТ." \\\n'

src = src[: i] + new_commit + src[j + len(COMMIT_END):]

# ---------- 2. README поставки ----------
START = "cat > download/README.md <<'EOF'\n"
END = "\nEOF"  # блок — хвост скрипта
i = src.find(START)
assert i != -1, "README start не найден"
j = src.find(END, i + len(START))
assert j != -1, "README end не найден"

new_readme = """cat > download/README.md <<'EOF'
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
git fetch "$HOME\\Downloads\\scoresbox-2026-10-06-logo47.git-bundle" main
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
assert "logo47" in src and 'ONEFILE=download/scoresbox-2026-10-06-logo47.git-bundle' in src
assert 'public/scoresbox-2026-10-06-logo47.git-bundle' in src
assert 'SCORESBOX 2026-10-06 brand46:' not in src, "старый коммит не заменён"
# brand46 легитимно остаётся в архивной таблице README поставки; запрещён
# только в РАБОЧИХ строках (ONEFILE=, cp, сообщение коммита)
assert 'ONEFILE=download/scoresbox-2026-10-06-brand46.git-bundle' not in src
assert 'cp "$ONEFILE" public/scoresbox-2026-10-06-brand46.git-bundle' not in src
assert src.rstrip().endswith("EOF")

SH.write_text(src, encoding="utf-8")
print("OK: make-archives.sh -> logo47 (ONEFILE + cp + commit + README)")
