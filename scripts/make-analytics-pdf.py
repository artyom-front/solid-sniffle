#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ============================================================
# SCORESBOX · make-analytics-pdf.py — тело отчёта (ReportLab)
# + слияние с обложкой (scripts/pdf-cover.pdf, от html2poster.js)
# План нумерации (Step 3.5):
#   cover — без номера | TOC — римские i, ii | главы 1..8 — арабские с 1
# Шрифты: FreeSerif (кириллица, осн. текст), DejaVuSans (моно, схемы)
# Палитра: palette.cascade --mode minimal (золото/олива, бренд SCORESBOX)
# ============================================================
import os, sys, hashlib

PDF_SKILL_DIR = '/home/z/my-project/skills/pdf'
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, 'scripts'))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (Paragraph, Spacer, Table, TableStyle, PageBreak,
                                CondPageBreak, KeepTogether, HRFlowable,
                                XPreformatted, Flowable, NextPageTemplate)
from reportlab.platypus.doctemplate import BaseDocTemplate, PageTemplate
from reportlab.platypus.frames import Frame
from reportlab.platypus.tableofcontents import TableOfContents

# ---------- шрифты (только разрешённые брифом) ----------
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

from pdf import install_font_fallback
install_font_fallback()

# ---------- палитра (palette.cascade, копия вывода команды) ----------
PAGE_BG       = colors.HexColor('#f4f3f3')
SECTION_BG    = colors.HexColor('#f2f1f0')
CARD_BG       = colors.HexColor('#eeedeb')
TABLE_STRIPE  = colors.HexColor('#eeedeb')
HEADER_FILL   = colors.HexColor('#7c704b')
COVER_BLOCK   = colors.HexColor('#67614f')
BORDER        = colors.HexColor('#c8c3b4')
ICON          = colors.HexColor('#7e6c37')
ACCENT        = colors.HexColor('#866f2b')
ACCENT_2      = colors.HexColor('#6148ab')
TEXT_PRIMARY  = colors.HexColor('#262522')
TEXT_MUTED    = colors.HexColor('#8e8c85')

# ---------- геометрия ----------
MARGIN = 2 * cm                       # симметрично слева/справа
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN         # ~482pt
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25

# ---------- стили ----------
S = {}
S['body'] = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5, leading=16,
                           alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY,
                           spaceBefore=0, spaceAfter=8)
S['bullet'] = ParagraphStyle('Bullet', parent=S['body'], leftIndent=14,
                             bulletIndent=2, spaceAfter=5, alignment=TA_LEFT)
S['h1'] = ParagraphStyle('H1', fontName='FreeSerif', fontSize=20, leading=25,
                         textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=4)
S['h2'] = ParagraphStyle('H2', fontName='FreeSerif', fontSize=14.5, leading=19,
                         textColor=HEADER_FILL, spaceBefore=14, spaceAfter=6)
S['h3'] = ParagraphStyle('H3', fontName='FreeSerif', fontSize=11.5, leading=15,
                         textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=4)
S['caption'] = ParagraphStyle('Caption', fontName='FreeSerif', fontSize=8.5,
                              leading=11, textColor=TEXT_MUTED, alignment=TA_CENTER,
                              spaceBefore=3, spaceAfter=6)
S['th'] = ParagraphStyle('TH', fontName='FreeSerif', fontSize=9, leading=12,
                         textColor=colors.white, alignment=TA_LEFT)
S['td'] = ParagraphStyle('TD', fontName='FreeSerif', fontSize=8.8, leading=11.5,
                         textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S['code'] = ParagraphStyle('Code', fontName='DejaVuSans', fontSize=7.2, leading=9.2,
                           textColor=TEXT_PRIMARY, backColor=SECTION_BG)
S['quote'] = ParagraphStyle('Quote', parent=S['body'], fontName='FreeSerif-Italic',
                            leftIndent=24, textColor=HEADER_FILL, spaceBefore=6)
S['stat'] = ParagraphStyle('Stat', fontName='FreeSerif', fontSize=19, leading=23,
                           textColor=ACCENT, alignment=TA_CENTER)
S['statlabel'] = ParagraphStyle('StatLabel', fontName='FreeSerif', fontSize=8.5,
                                leading=11, textColor=TEXT_MUTED, alignment=TA_CENTER)
S['toc0'] = ParagraphStyle('TOC0', fontName='FreeSerif', fontSize=11.5, leading=17,
                           textColor=TEXT_PRIMARY, leftIndent=6)
S['toc1'] = ParagraphStyle('TOC1', fontName='FreeSerif', fontSize=9.5, leading=14,
                           textColor=TEXT_MUTED, leftIndent=26)

# ---------- шаблон документа: TOC (римские) + body (арабские с 1) ----------
def _draw_footer(c, doc, num):
    c.saveState()
    c.setFont('FreeSerif', 8)
    c.setFillColor(TEXT_MUTED)
    c.drawString(doc.leftMargin, 0.52 * inch, 'SCORESBOX · Глубокая аналитика проекта')
    c.drawRightString(PAGE_W - doc.rightMargin, 0.52 * inch, num)
    c.setStrokeColor(BORDER); c.setLineWidth(0.4)
    c.line(doc.leftMargin, 0.62 * inch, PAGE_W - doc.rightMargin, 0.62 * inch)
    # шапка
    c.setFont('FreeSerif', 7.5)
    c.drawString(doc.leftMargin, PAGE_H - 0.52 * inch, 'SCORESBOX · Футбол Чувашии · footballday.ru')
    c.setStrokeColor(ACCENT); c.setLineWidth(1.0)
    c.line(doc.leftMargin, PAGE_H - 0.60 * inch, PAGE_W - doc.rightMargin, PAGE_H - 0.60 * inch)
    c.restoreState()

def _footer_toc(c, doc):
    roman = {1: 'i', 2: 'ii', 3: 'iii', 4: 'iv'}.get(doc.page, str(doc.page))
    _draw_footer(c, doc, roman)

def _footer_body(c, doc):
    start = getattr(doc, 'body_start', 2)
    _draw_footer(c, doc, str(doc.page - start + 1))

class ReportDoc(BaseDocTemplate):
    def __init__(self, fn, **kw):
        super().__init__(fn, **kw)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id='main')
        self.addPageTemplates([
            PageTemplate(id='toc', frames=[frame], onPage=_footer_toc),
            PageTemplate(id='body', frames=[frame], onPage=_footer_body),
        ])
        self.body_start = 2
    def afterFlowable(self, flowable):
        if getattr(flowable, 'is_body_start', False):
            self.body_start = self.page
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            # номер в TOC = видимый номер в футере (сброс на 1 с начала основного текста)
            page_no = self.page
            if self.page >= self.body_start:
                page_no = self.page - self.body_start + 1
            self.notify('TOCEntry', (level, text, page_no, key))

class BodyStart(Flowable):
    """Маркер первой страницы основного текста (для сброса нумерации)."""
    is_body_start = True
    def wrap(self, w, h): return (0, 0)
    def draw(self): pass

# ---------- помощники ----------
def _nb(text):
    """Тире не должно начинать строку: привязываем к предыдущему слову."""
    return text.replace(' — ', '\u00A0— ')

def P(text, style='body'):
    return Paragraph(_nb(text), S[style])

def add_heading(text, level=0):
    key = 'h_' + hashlib.md5(text.encode()).hexdigest()[:8]
    st = S['h1'] if level == 0 else S['h2']
    p = Paragraph(f'<a name="{key}"/><b>{text}</b>', st)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def h1_block(text, first_els):
    """Глава: условный разрыв + заголовок + золотая линия + первый элемент."""
    rule = HRFlowable(width='100%', thickness=1.2, color=ACCENT,
                      spaceBefore=0, spaceAfter=10)
    head = add_heading(text, 0)
    els = [CondPageBreak(H1_ORPHAN), Spacer(1, 18), KeepTogether([head, rule] + first_els[:1])]
    els += first_els[1:]
    return els

def h2_block(text, first_els):
    head = add_heading(text, 1)
    return [KeepTogether([head] + first_els[:1])] + first_els[1:]

def make_table(header, rows, ratios, font=8.8, caption=None):
    """Таблица: все ячейки Paragraph, ширины ≤ AVAIL_W, зебра, repeatRows=1."""
    th = ParagraphStyle('th_t', parent=S['th'], fontSize=font + 0.2)
    td = ParagraphStyle('td_t', parent=S['td'], fontSize=font, leading=font + 2.7)
    data = [[Paragraph(f'<b>{h}</b>', th) for h in header]]
    for r in rows:
        data.append([Paragraph(_nb(str(c)), td) for c in r])
    widths = [r * AVAIL_W * 0.985 for r in ratios]
    assert sum(widths) <= AVAIL_W + 0.5, 'таблица шире доступной области'
    t = Table(data, colWidths=widths, hAlign='CENTER', repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        if i % 2 == 1:
            style.append(('BACKGROUND', (0, i), (-1, i), TABLE_STRIPE))
    t.setStyle(TableStyle(style))
    out = [Spacer(1, 10), t]
    if caption:
        out += [Paragraph(caption, S['caption'])]
    out += [Spacer(1, 10)]
    return out

def callout(stat, label, width=170):
    t = Table([[Paragraph(f'<b>{stat}</b>', S['stat'])],
               [Paragraph(label, S['statlabel'])]], colWidths=[width], hAlign='CENTER')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('BOX', (0, 0), (-1, -1), 1, ACCENT),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return KeepTogether([Spacer(1, 8), t, Spacer(1, 8)])

def callout_row(items):
    """Несколько цифр в ряд — таблица из callout-ячеек."""
    cells = []
    for stat, label in items:
        inner = Table([[Paragraph(f'<b>{stat}</b>', S['stat'])],
                       [Paragraph(_nb(label), S['statlabel'])]], colWidths=[AVAIL_W / len(items) - 24],
                      hAlign='CENTER')
        inner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
            ('BOX', (0, 0), (-1, -1), 1, ACCENT),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
        ]))
        cells.append(inner)
    outer = Table([cells], colWidths=[AVAIL_W / len(items)] * len(items), hAlign='CENTER')
    outer.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    return [Spacer(1, 8), KeepTogether(outer), Spacer(1, 8)]

def bullets(items):
    return [Paragraph('• ' + _nb(t), S['bullet']) for t in items]

# ============================================================
# СБОРКА СОДЕРЖИМАЯ
# ============================================================
story = []

# --- Содержание (римская нумерация) ---
story.append(Paragraph('<b>Содержание</b>', S['h1']))
story.append(HRFlowable(width='100%', thickness=1.2, color=ACCENT, spaceAfter=14))
toc = TableOfContents()
toc.levelStyles = [S['toc0'], S['toc1']]
story.append(toc)
story.append(NextPageTemplate('body'))
story.append(PageBreak())
story.append(BodyStart())

# ---------------- Глава 1 ----------------
story += h1_block('1. Резюме: общая оценка', [P(
    'Предмет анализа — спортивно-аналитический портал «Футбол Чувашии» (SCORESBOX): '
    'livescore матчей нескольких форматов, турнирные таблицы, статистика игроков и судей, '
    'дисквалификации, панель управления с ролевым доступом. Поставка — Docker-образ из CI, '
    'работа — PostgreSQL 16 и Next.js в контейнерах за nginx. Ниже — сжатый вердикт по восьми '
    'направлениям и три вывода, которые стоит запомнить.')])

story += make_table(
    ['Направление', 'Оценка', 'Комментарий'],
    [
        ['Архитектура кода', '9/10', 'Чистое разделение слоёв; бизнес-движки изолированы от UI и покрываются unit-тестами'],
        ['Безопасность приложения', '9/10', '2FA (TOTP), RBAC, rate-limit, scrypt, аудит действий — редкая глубина для проекта одного автора'],
        ['Безопасность инфраструктуры', '7/10', 'HTTPS и секреты вне git; нет ufw/fail2ban (в DEPLOY.md v3 добавлены), деплой от root'],
        ['Тестирование', '8/10', '70 тестов, 36 инвариантов PRD, четыре CI-гейта на каждый push'],
        ['Масштабируемость', '6/10', 'Сейчас вертикальная; заделы (upstream, stateless-сессии, ISR) заложены, но не включены'],
        ['Отказоустойчивость', '5/10', 'Один VPS — одна точка отказа; бэкапы лежат на том же диске'],
        ['Документация', '9/10', 'DEPLOY.md с проверками шагов, аналитика, комментарии в коде'],
        ['SEO', '8/10', 'SSR, schema.org, sitemap, ISR — уровень зрелых медиа-порталов'],
    ],
    [0.26, 0.12, 0.62], caption='Таблица 1. Сводная оценка проекта по восьми направлениям')

story.append(P('<b>Вывод первый.</b> Проект зрелый для запуска: связка SSR + PostgreSQL + '
               'Docker + CI/CD с автотестами и авто-откатом обычно встречается у команд из '
               'десятков человек. Для региональной аудитории в тысячи визитов в день запас '
               'ёмкости кратный.'))
story.append(P('<b>Вывод второй.</b> Главный риск — не код, а инфраструктура: единственный '
               'сервер и бэкапы на его диске означают, что отказ диска одновременно уничтожает '
               'и сайт, и копии. Это закрывается в первую же неделю (P0 дорожной карты, '
               'стоимость — ноль рублей).'))
story.append(P('<b>Вывод третий.</b> Домен — параметр, а не константа: SITE_URL в .env, '
               'скрипт setup-nginx.sh с аргументом-доменом, секрет DEPLOY_PUBLIC_URL. '
               'Переезд с footballday.ru на scoresbox.ru — штатная операция на 15 минут.'))

story += callout_row([
    ('x20', 'запас ёмкости текущего VPS при обычной нагрузке сезона'),
    ('15 мин', 'займёт смена домена без потери данных'),
    ('270 руб./мес', 'полная стоимость владения после запуска'),
])

# ---------------- Глава 2 ----------------
story += h1_block('2. Технологический стек и карта кода', [P(
    'Стек подобран консервативно: каждая позиция — либо отраслевой стандарт, либо '
    'осознанный компромисс с записанной причиной. Экзотики нет, поэтому любая проблема '
    'решается поиском за минуты, а новый разработчик вливается в проект быстро. '
    'Ключевые решения и отвергнутые альтернативы — в таблице.')])

story += make_table(
    ['Слой', 'Технология', 'Почему выбрано'],
    [
        ['Фреймворк', 'Next.js 16, App Router', 'SSR для SEO и React для интерактива — один фреймворк вместо «сайт + отдельный API»'],
        ['Язык', 'TypeScript (strict)', 'Ошибки ловятся компилятором; типы работают как документация'],
        ['UI', 'Tailwind CSS 4 + shadcn/ui', 'Готовые доступные компоненты, единый дизайн-язык без месяцев вёрстки'],
        ['БД', 'PostgreSQL 16', 'Транзакции для турнирных агрегатов, надёжность, штатный pg_dump для бэкапов'],
        ['ORM', 'Prisma 6', 'Типизированные запросы: ошибки SQL видны до запуска'],
        ['Рантайм', 'Bun', 'Быстрый старт контейнера, ниже потребление памяти, быстрый тест-раннер'],
        ['Контейнеры', 'Docker (multi-stage, standalone)', '«Работает у меня — работает на сервере»; образ собирает CI, сервер только скачивает'],
        ['CI/CD', 'GitHub Actions + GHCR', 'Бесплатно для публичного репозитория, нулевое обслуживание'],
        ['Прокси', 'Nginx на хосте + certbot', 'TLS и продление сертификатов вне контейнеров — нет циклической зависимости при старте'],
    ],
    [0.15, 0.27, 0.58], caption='Таблица 2. Стек и обоснование выбора')

story += h2_block('2.1 Карта директорий', [P(
    'Кодовая база: 201 файл в репозитории, из них 161 — исходники объёмом около '
    '18 800 строк. Вся бизнес-логика сосредоточена в lib/engine чистыми функциями '
    '(вход → выход, без обращений к базе), а роуты и страницы лишь склеивают движки '
    'с выборками Prisma. Это делает ядро тестируемым изолированно и позволяет менять '
    'интерфейс, не трогая правила турниров.')])

story.append(XPreformatted(
"""src/
  app/(site)/      публичный портал: /, /match/[id], /league/[id],
                   /team/[id], /player/[id], /stadium/[id] — все SSR
  app/admin/       панель управления (RBAC, 2FA)
  app/api/         46 REST-роутов: public (12), admin (24), auth (4), health
  components/      SiteShell, AdminShell, брендинг (brand.ts), UI-примитивы
  lib/engine/      БИЗНЕС-ЯДРО: schedule, standings, discipline,
                   lifecycle, signals, stats — ~1 170 строк
  lib/auth.ts      сессии: scrypt + HMAC-cookie
  lib/totp.ts      2FA: RFC 6238, анти-replay, резервные коды
  lib/queries.ts   выборки Prisma (include — без N+1)
prisma/schema      16 моделей домена (308 строк)
tests/             54 unit + 16 integration
scripts/           deploy.sh, rollback.sh, backup-db.sh, setup-nginx.sh""",
    S['code']))

# ---------------- Глава 3 ----------------
story += h1_block('3. Архитектура и поток данных', [P(
    'Запрос от браузера проходит четыре уровня: TLS-терминацию в nginx, рендер в '
    'Next.js, бизнес-движки и выборки, хранение в PostgreSQL. Схема ниже показывает '
    'путь страницы матча — от запроса до готового HTML с микроразметкой.')])

story.append(Spacer(1, 4))
story.append(XPreformatted(
"""    БРАУЗЕР / ПОИСКОВИК
          | HTTPS
    +-----v------+   TLS, gzip, кэш /_next/static (30 дней, immutable)
    |   NGINX    |
    +-----+------+
    +-----v------+   SSR-HTML + REST API, рантайм Bun
    |  NEXT.JS   |   ISR: матч 30 c, лига 60 c,
    |            |   команда/игрок 120 c, стадион 300 c
    +--+------+--+
       |      +-- lib/queries.ts (Prisma, include)
       |      +-- lib/engine/* (чистые правила турниров)
    +--v---v---+
    | POSTGRES |   16 таблиц, том scoresbox-pgdata
    +----------+""",
    S['code']))
story.append(Paragraph('Рис. 1. Поток данных публичного портала', S['caption']))

story += h2_block('3.1 Стратегия рендеринга', [P(
    'ISR (инкрементальная регенерация) — главный механизм экономии: страницу матча '
    'могут открыть десять тысяч человек, но база опрашивается не чаще двух раз в '
    'минуту; остальные запросы обслуживаются из кэша за миллисекунды. Главная '
    'страница — единственная динамическая: live-счёт обязан быть свежим всегда.')])

story += make_table(
    ['Страница', 'Режим', 'Обновление', 'Причина'],
    [
        ['Главная (livescore)', 'force-dynamic', 'каждый запрос', 'live-счёт должен быть свежим всегда'],
        ['Матч', 'ISR', '30 секунд', 'во время игры счёт «почти live» без нагрузки на БД'],
        ['Лига', 'ISR', '60 секунд', 'таблицы меняются по ходу тура'],
        ['Команда / Игрок', 'ISR', '120 секунд', 'составы и статистика меняются редко'],
        ['Стадион', 'ISR', '300 секунд', 'справочная страница'],
    ],
    [0.30, 0.20, 0.20, 0.30], caption='Таблица 3. Политика кэширования страниц')

story += h2_block('3.2 Модель данных и сессии', [P(
    'Шестнадцать таблиц покрывают полный цикл турнира: лига → сезон → команда/клуб → '
    'физлицо (игрок, судья, тренер в одной сущности) → матч → события (голы, карточки) → '
    'дисквалификации → строка таблицы. Правила домена («после N жёлтых — пропуск», '
    '«техпоражение 0:3») закодированы в движках и зафиксированы тестами. Сессии — '
    'stateless: cookie подписана HMAC-ключом AUTH_SECRET, проверка не требует запроса '
    'к базе, что дёшево при росте трафика. Пароли — scrypt; 2FA — TOTP по RFC 6238 '
    'с защитой от повторного кода и восемью резервными кодами.')])

# ---------------- Глава 4 ----------------
story += h1_block('4. Безопасность', [P(
    'Покрытие на уровне приложения необычно полное: обычно двухфакторная аутентификация '
    'и аудит действий появляются сильно позже. Инвентаризация механизмов и их оценка — '
    'в таблице; ниже — что стоит усилить на уровне сервера.')])

story += make_table(
    ['Механизм', 'Реализация', 'Оценка'],
    [
        ['Хэш паролей', 'scrypt (memory-hard) — устойчив к GPU-брутфорсу', 'современно'],
        ['Cookie-сессии', 'httpOnly + подпись HMAC (AUTH_SECRET): не крадётся JS, не подделывается', 'полно'],
        ['2FA', 'TOTP RFC 6238, окно ±1 шаг, анти-replay, 8 резервных кодов', 'полно'],
        ['Брутфорс', 'rate-limit на login/otp (HTTP 429); счётчики в памяти процесса', 'ок; P2 — Redis'],
        ['Роли', 'RBAC: супер-админ, админ лиги, админ клуба, судья', 'разделены'],
        ['Аудит', 'журнал действий администраторов', 'есть'],
        ['Секреты', '.env вне git, права 600, отдельный SSH-ключ деплоя', 'штатно'],
        ['TLS', 'Let\'s Encrypt + автопродление certbot', 'штатно'],
        ['Зависимости', 'bun.lock (фиксация версий) + job audit в CI', 'штатно'],
        ['Заголовки', 'nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy в nginx', 'штатно'],
    ],
    [0.22, 0.63, 0.15], caption='Таблица 4. Инвентаризация защитных механизмов')

story += h2_block('4.1 Что усилить', bullets([
    '<b>Файрвол UFW</b> — «deny by default»: наружу смотрят только SSH/HTTP/HTTPS. Три команды добавлены в DEPLOY.md v3 (шаг Б4), 5 минут работы.',
    '<b>Деплой от root</b> — CI-ключ может всё; правильнее ограниченный пользователь deploy (P1 дорожной карты).',
    '<b>Fail2ban</b> — лимит неудачных SSH-попыток по журналу аутентификации (P1).',
    '<b>Приватность образа GHCR</b> — если репозиторий закрытый, откат на сервере потребует токена с правом чтения пакетов.',
]))

# ---------------- Глава 5 ----------------
story += h1_block('5. Масштабируемость', [P(
    'Оценки ёмкости консервативные и опираются на долю запросов, обслуживаемых из '
    'ISR-кэша. Для регионального футбольного портала пик приходится на игровые дни; '
    'именно они и приняты за расчётный сценарий.')])

story += make_table(
    ['Сценарий', 'Нагрузка', 'Вердикт'],
    [
        ['Обычные будни сезона', '~1–5 req/s, 90%+ из кэша', 'запас двадцатикратный и выше'],
        ['Турнирный день (пик)', '~10–30 req/s, страницы матча', 'запас трёх-пятикратный; БД почти не ощущает'],
        ['Матч-сенсация + СМИ', '100+ req/s', 'упор в CPU рендера — пора на этап 2 плана роста'],
    ],
    [0.30, 0.34, 0.36], caption='Таблица 5. Ёмкость текущей конфигурации (VPS 2 ГБ / 1 vCPU)')

story.append(P('Ориентир в визитах: 10 000 уникальных посетителей в день — это в среднем '
               '0,3 запроса в секунду со всплесками до 5–10 в часы игр. Вывод: примерно до '
               '30–50 тысяч визитов в день сервер справляется без изменений — это с запасом '
               'перекрывает реалистичные прогнозы аудитории чемпионата республики.'))

story += h2_block('5.1 Узкие места (по убыванию опасности)', bullets([
    '<b>Единственный VPS</b> — отказ диска, процессора или сети означает полный простой портала и админки. Вопрос не «если», а «когда»: у железа конечная надёжность.',
    '<b>Бэкапы на том же диске</b> — усиливает первый пункт: простой превращается в потерю данных. Единственный риск с необратимыми последствиями.',
    '<b>Нет мониторинга</b> — о падении узнают пользователи, а не владелец; простои длятся дольше необходимого.',
    '<b>БД и приложение делят один хост</b> — тяжёлые отчёты админки могут «подлагивать» live-страницы (спорадично, не критично на текущих объёмах).',
    '<b>Rate-limit в памяти</b> — блокирует горизонтальное масштабирование: при втором инстансе лимиты считались бы независимо (решение — Redis, этап 2).',
    '<b>prisma db push вместо миграций</b> — схема обновляется без истории изменений; с появлением второго разработчика конфликты схем станут рутиной (P1).',
]))

story += h2_block('5.2 План роста: три этапа с триггерами', [P(
    '<b>Этап 0 — сейчас.</b> Ничего не масштабировать. Сделать P0 дорожной карты: '
    'внешние бэкапы, мониторинг, файрвол. Это не масштаб, а страховка; смета не меняется.')])
story.append(P('<b>Этап 1 — рост (30–100 тыс. визитов или жалобы на скорость).</b> CDN '
               'перед nginx (Cloudflare, бесплатный тариф) снимает 60–80% трафика — '
               'статика и ISR-страницы отдаются с узла рядом с пользователем; VPS '
               'расширяется до 4 ГБ / 2 vCPU (~500 руб./мес). Триггер: p95 больше '
               '800 мс или CPU выше 70% две недели подряд по данным мониторинга.'))
story.append(P('<b>Этап 2 — зрелость (100 тыс.+ или регулярные пики СМИ).</b> Managed '
               'PostgreSQL (база переживает падение сервера, бэкапы на провайдере); '
               'второй инстанс приложения — в nginx уже есть блок upstream с keepalive, '
               'достаточно добавить строку server 127.0.0.1:3001 и балансировка '
               'заработает (приложение без состояния, переписывать нечего); Redis для '
               'общих лимитов и кэша. Сильная сторона: «кнопки» роста вшиты в '
               'архитектуру заранее и включаются по одной, без рефакторинга.'))

# ---------------- Глава 6 ----------------
story += h1_block('6. Производительность и надёжность', [P(
    'Оптимизации, работающие «из коробки»: ISR с периодами 30–300 секунд, gzip в '
    'nginx, 30-дневный immutable-кэш статики Next.js, keepalive-пул из 32 соединений '
    'между nginx и приложением, standalone-сборка на Bun (контейнер меньше и стартует '
    'за секунды), дешёвый health-check на /api/health, который проверяет и приложение, '
    'и базу одним запросом.')])

story += h2_block('6.1 Отказоустойчивость в цифрах', [P(
    '<b>RPO</b> (теряем при аварии) — до 24 часов: ночной pg_dump в 03:15. Перенос '
    'копии в объектное хранилище сразу после снятия сокращает окно примерно до часа (P0). '
    '<b>RTO</b> (восстанавливаемся) — 10–15 минут по инструкции из DEPLOY.md: '
    'pg_restore и подъём контейнеров. Сценарий отрепетирован командами гайда. '
    'Авто-откат деплоя: если новая версия не проходит health-check за 90 секунд, '
    'deploy.sh сам возвращает предыдущую рабочую — релиз не «кладёт» прод в ожидании '
    'администратора. Сертификаты продлеваются таймером certbot без участия человека.')])

story += callout_row([
    ('RPO 24 ч', 'окно потери данных сегодня; ~1 ч после P0'),
    ('RTO 15 мин', 'восстановление из дампа по инструкции'),
    ('90 с', 'порог авто-отката версии при провале health-check'),
])

story.append(P('Чего не хватает для «настоящего SLA» — внешнего мониторинга с '
               'оповещениями: сейчас о проблеме узнаёт либо владелец, зайдя на сайт, '
               'либо пользователи. Пороги и бесплатные инструменты — в главе 8.'))

# ---------------- Глава 7 ----------------
story += h1_block('7. Качество, тестирование и риски', [P(
    'Контроль качества устроен в четыре ступени, и прод получает только артефакт, '
    'прошедший их все: красный CI не пускает Pull Request в main, а тег версии с '
    'падающими тестами в принципе не доходит до сборки образа.')])

story += make_table(
    ['Слой', 'Что проверяется', 'Инструмент'],
    [
        ['Бизнес-ядро', 'расписание, таблицы, дисквалификации, сигналы — 54 unit-теста', 'bun test tests/unit'],
        ['HTTP-контракт', '16 integration-тестов против живого сервера и чистой БД', 'tests/integration'],
        ['Инварианты PRD', '36 правил: техпоражение 0:3, лимиты карточек, анти-replay OTP', 'внутри тех же тестов'],
        ['Стиль и типы', 'ESLint и tsc на каждый push', 'job quality'],
        ['Сборка и CVE', 'Docker-образ собирается; зависимости без известных уязвимостей', 'job docker + audit'],
    ],
    [0.20, 0.52, 0.28], caption='Таблица 6. Ступени контроля качества')

story.append(P('Интеграционные тесты гоняются против контейнерного PostgreSQL — класс '
               'ошибок «работает в dev-базе, падает в проде» исключён по построению: '
               'движок базы один и тот же во всех окружениях.'))

story += make_table(
    ['№', 'Риск', 'Вер-ть', 'Урон', 'Митигация'],
    [
        ['1', 'Отказ диска VPS (сайт + бэкапы на нём)', 'средняя', 'катастрофа', 'P0: offsite-бэкапы в объектное хранилище'],
        ['2', 'Тихая смерть cron-бэкапа', 'средняя', 'RPO растёт до бесконечности', 'P0: healthchecks.io следит за запуском задания'],
        ['3', 'SSH-перебор', 'средняя', 'компромисс сервера', 'ufw (P0) + fail2ban (P1), вход по ключам'],
        ['4', 'Утечка AUTH_SECRET / пароля БД', 'низкая', 'подделка сессий', 'права 600, вне git, ротация при инциденте'],
        ['5', 'Плохой релиз прошёл CI', 'низкая', 'простой до отката', 'закрыто: health-check + авто-откат'],
        ['6', 'DNS-сбой регистратора', 'низкая', 'сайт недоступен', 'TTL 3600; мониторинг заметит'],
        ['7', 'Сертификат не продлился', 'низкая', 'браузеры блокируют сайт', 'certbot-timer + dry-run в чек-листе'],
        ['8', 'Рост объёма БД от сезонов', 'низкая', 'замедление выборок', 'индексы в схеме; контроль размера (гл. 8)'],
        ['9', 'Подмена образа в реестре', 'низкая', 'подмена софта', 'секрет только в Actions; политика PAT'],
        ['10', 'Bus-factor: один разработчик', 'н/д', 'знания теряются', 'документация: DEPLOY.md + этот отчёт + комментарии'],
    ],
    [0.05, 0.31, 0.11, 0.15, 0.38], font=8.3, caption='Таблица 7. Реестр рисков')

story.append(P('Риски 1 и 2 усиливают друг друга: без внешней копии отказ бэкап-задания '
               'незаметен до момента, когда копия нужна. Поэтому P0 закрывает их в первую '
               'очередь — настройка занимает минуты, а страхует от потери всей истории '
               'турниров.'))

# ---------------- Глава 8 ----------------
story += h1_block('8. Дорожная карта и шпаргалка', [P(
    'Приоритеты расставлены по формуле «цена ошибки × стоимость исправления»: сначала '
    'бесплатные страховки, затем гигиена роста, и лишь потом — масштабирование, '
    'которое сейчас не требуется.')])

story += h2_block('8.1 P0 — первая неделя (страховки, ноль рублей)', bullets([
    '<b>Бэкапы вне сервера</b> — после pg_dump копировать дамп в объектное хранилище (Timeweb Cloud / Yandex Object Storage, 1–3 руб./мес за гигабайт): одна строка rclone copy в backup-db.sh.',
    '<b>Мониторинг доступности</b> — UptimeRobot (бесплатно) пингует /api/health каждые 5 минут и шлёт e-mail при падении; healthchecks.io следит, что ночное задание бэкапа вообще исполнилось.',
    '<b>Файрвол</b> — ufw allow 22,80,443 и ufw enable: сетевая дверь закрыта для всего прочего (команды в DEPLOY.md v3).',
]))
story += h2_block('8.2 P1 — первый месяц (гигиена роста)', bullets([
    '<b>Prisma Migrate</b> вместо db push: история миграций в git, безопасные откат-скрипты схемы.',
    '<b>Пользователь deploy</b> вместо root: blast radius CI-ключа сужается с «весь сервер» до «каталог проекта».',
    '<b>Fail2ban</b> и выгрузка docker logs в файл с ротацией.',
]))
story += h2_block('8.3 P2 — по триггерам роста', bullets([
    'CDN (Cloudflare free) — по метрикам p95/CPU; managed PostgreSQL — когда отказы «терпеть нельзя».',
    'Второй инстанс приложения (строка в upstream) + Redis для общих лимитов.',
    'Еженедельный smoke-тест восстановления: бэкап, который не проверяли восстановлением, — не бэкап.',
]))

story += make_table(
    ['Метрика', 'Где смотреть', 'Порог тревоги'],
    [
        ['Доступность /api/health', 'UptimeRobot', 'любой простой'],
        ['Время ответа p95', 'UptimeRobot / CDN', 'больше 800 мс'],
        ['CPU контейнеров', 'docker stats', 'выше 70% постоянно'],
        ['Место на диске', 'df -h', 'меньше 20% свободно'],
        ['Размер БД', 'pg_database_size', 'рост больше 30% за месяц'],
        ['Свежесть бэкапа', 'ls -l backups/', 'нет дампа за сегодня'],
        ['Срок сертификата', 'certbot certificates', 'меньше 14 дней'],
    ],
    [0.38, 0.32, 0.30], caption='Таблица 8. Метрики мониторинга (инструменты бесплатны)')

story += h2_block('8.4 Где живёт домен (для будущей смены)', [P(
    'Домен вынесен из кода в параметры. При переезде (например, footballday.ru → '
    'scoresbox.ru) меняются шесть мест, перечисленных ниже; база данных, аккаунт '
    'администратора, ключи деплоя и репозиторий при этом не затрагиваются.')])

story += make_table(
    ['Место', 'Как меняется'],
    [
        ['DNS у регистратора', 'A-запись @ на IP сервера; CNAME www на домен'],
        ['nginx', 'sudo ./scripts/setup-nginx.sh <новый-домен> — скрипт перепишет конфиг сам'],
        ['SSL-сертификат', 'certbot --nginx -d <новый> -d www.<новый> (2 минуты)'],
        ['.env → SITE_URL', 'sed -i s|^SITE_URL=.*|SITE_URL=https://<новый>| и перезапуск compose'],
        ['GitHub Secret', 'DEPLOY_PUBLIC_URL → https://<новый-домен>'],
        ['Подвал сайта', 'brand.ts → DOMAIN (одна строка, уезжает на сервер с очередным тегом релиза)'],
    ],
    [0.30, 0.70], caption='Таблица 9. Шесть мест конфигурации домена')

story.append(P('Сводный порядок действий, проверки каждого шага и диагностика '
               'неисправностей — в DEPLOY.md v3 (два пути: продолжить с текущего '
               'состояния или начать с нуля). Документы обновляются вместе с проектом.'))

# ============================================================
# СБОРКА
# ============================================================
BODY = '/home/z/my-project/scripts/analytics-body.pdf'
COVER = '/home/z/my-project/scripts/pdf-cover.pdf'
FINAL = '/home/z/my-project/download/scoresbox-analytics.pdf'

doc = ReportDoc(BODY, pagesize=A4,
                leftMargin=MARGIN, rightMargin=MARGIN,
                topMargin=MARGIN, bottomMargin=MARGIN,
                title='SCORESBOX — глубокая аналитика проекта',
                author='Z.ai', creator='Z.ai',
                subject='Архитектура, безопасность, масштабируемость и план роста портала «Футбол Чувашии»')
doc.multiBuild(story)
print('Тело отчёта собрано:', BODY)

# ---------- слияние обложки и тела ----------
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.2 or abs(h - A4_H) > 0.2:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
writer.add_page(normalize(PdfReader(COVER).pages[0]))
for pg in PdfReader(BODY).pages:
    writer.add_page(normalize(pg))
writer.add_metadata({
    '/Title': 'SCORESBOX — глубокая аналитика проекта',
    '/Author': 'Z.ai', '/Creator': 'Z.ai',
    '/Subject': 'Архитектура, безопасность, масштабируемость и план роста портала «Футбол Чувашии»',
})
os.makedirs(os.path.dirname(FINAL), exist_ok=True)
with open(FINAL, 'wb') as f:
    writer.write(f)
print('Итоговый PDF:', FINAL, '| страниц:', len(writer.pages))
