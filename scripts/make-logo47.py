#!/usr/bin/env python3
"""SCORESBOX v1.0.47 (logo47) — генератор системы логотипа по детальному
брифу 2026-10-06 («смысл и идея… задача дизайнеру»).

ЧТО ДЕЛАЕТ
  1. Извлекает КОНТУРЫ БУКВ из Baloo 2 (500/700/800) через fontTools
     и печёт их в SVG-пути (лого = чистые пути, без живого текста и
     без webfont-зависимости → перенос в шапке физически невозможен).
  2. Строит ЗНАК-ПОЛЕ по цифрам брифа (сетка 64):
       • радиус углов 17.5% (бриф 15–20%), штрих разметки 5.5%
         (бриф 5–6%), центральный круг d 32.8% (бриф 30–35%),
         штрафные 16.4% глубина × 32.8% высота (бриф 15–18 × 30–35%);
       • разметка — ВЫРЕЗАМИ (негативное пространство, цвет фона),
         реализация — SVG-маска (не evenodd: пересечение линии×круга
         давало бы «золотое пятно» — грабля v1.0.46);
       • упрощённая версия ≤24px: штрафные убраны, штрих утолщён
         до 8.75% (бриф: «штрихи упрощаются/утолщаются пропорционально»).
  3. КОМПОЗИЦИИ:
       • ВЕРТИКАЛЬНАЯ (парадная): «scores» (Baloo 2 Medium, БЕЛЫЙ,
         ~½ высоты box) над «b[поле]x» (Baloo 2 ExtraBold, градиент
         #FFD700→#F5C518; поле — насыщенный акцент #F5C518→#EDBE00);
         выключка ВЛЕВО, ширины строк выравниваются подбором кегля
         scores (широкое поле компенсирует короткую нижнюю строку),
         межстрочный зазор минимальный.
       • ГОРИЗОНТАЛЬНАЯ (шапка): [знак-поле] + «scoresbox» ОДНОЙ
         строкой (Baloo 2 Bold; scores белый, box золотой ПЛОСКИЙ —
         «в интерфейсе — плоский цвет»), nowrap по построению.
  4. Пишет: src/components/portal/logo-paths.ts (модуль путей для
     Logo.tsx), канонические SVG в public/brand/logo47/, public/logo.svg,
     src/app/icon.svg, og.svg (1200×630, текст — путями из Onest,
     вырезы показывают ОПАК-фон — соцсети композят альфу на белый).

ЗАПУСК: python3 scripts/make-logo47.py
Шрифты коммитятся в scripts/assets/ (Baloo2-*.ttf, Onest-500.ttf).
"""

from __future__ import annotations

import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "scripts", "assets")
OUTDIR = os.path.join(ROOT, "public", "brand", "logo47")

# ── палитра (бриф: «привести к бренд-токенам #FFD700 / #F5C518») ────────
GOLD = "#FFD700"        # плоское золото интерфейса (канон сайта)
GOLD_DEEP = "#F5C518"   # нижняя остановка градиента букв / верх поля
GOLD_ACCENT = "#EDBE00" # «самый насыщенный акцент» — низ поля
WHITE = "#FFFFFF"       # «scores» на тёмном
INK = "#0A0D13"         # фон сайта; «scores» на светлом
INK3 = "#5E6C7D"        # приглушённый текст og-подписи

# ── знак-поле: геометрия на сетке 64 (проценты — от стороны) ────────────
MARK = {
    "grid": 64,
    "rx": 11.2,        # 17.5%  (бриф 15–20%)
    "stroke": 3.52,    # 5.5%   (бриф 5–6%)
    "circleR": 10.5,   # d 21 = 32.8% (бриф 30–35%)
    "penD": 10.5,      # глубина штрафной 16.4% (бриф 15–18%)
    "penH": 21.0,      # высота штрафной 32.8% (бриф 30–35%)
    "simple": False,
}
MARK_SIMPLE = {
    "grid": 64,
    "rx": 11.2,
    "stroke": 5.6,     # 8.75% — утолщён для ≤24px
    "circleR": 11.5,   # d 23 = 36%
    "penD": 0, "penH": 0,
    "simple": True,
}

# ── вертикальная композиция: тюнинг ─────────────────────────────────────
BOX_X = 100.0          # x-height букв «box»
FIELD_SIZE = 108.0     # сторона поля (бриф: «равен буквам или чуть крупнее»)
FIELD_GAP = 9.0        # зазор b—поле и поле—x
LINE_GAP = 12.0        # «межстрочный зазор минимальный» (ink scores → ink box)
SCORES_TRACK = 0.0     # плотный трекинг

# ── горизонтальная композиция: тюнинг ───────────────────────────────────
HW_MARK = 64.0         # знак-поле (в сетке лока-апа; 32px в шапке 56px)
HW_GAP = 13.0          # знак → слово
HW_WORD_X = 33.0       # x-height слова «scoresbox» (Baloo 2 Bold)
HW_TRACK = 2.2         # лёгкий трекинг слова


def num(v: float) -> str:
    """Компактное число для SVG/TS."""
    s = f"{float(v):.2f}".rstrip("0").rstrip(".")
    return s if s else "0"


# ══════════════════════════════════════════════ извлечение глифов ════════
class Face:
    """Шрифт + извлечение контуров в финальных координатах (ось y вниз)."""

    def __init__(self, path: str):
        self.font = TTFont(path)
        self.gs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.upm = self.font["head"].unitsPerEm
        self.sxh = self.font["OS/2"].sxHeight or 460

    def glyph(self, ch: str) -> str:
        return self.cmap[ord(ch)]

    def adv(self, ch: str) -> float:
        return self.font["hmtx"][self.glyph(ch)][0]

    def path(self, ch: str, scale: float, dx: float, dy: float) -> dict:
        """Контур глифа: (dx+scale·x, dy−scale·y). bbox — в тех же координатах."""
        gname = self.glyph(ch)
        pen = SVGPathPen(self.gs, ntos=lambda v: num(v))
        t = Transform(scale, 0, 0, -scale, dx, dy)
        self.gs[gname].draw(TransformPen(pen, t))

        bp = BoundsPen(self.gs)
        self.gs[gname].draw(TransformPen(bp, t))
        b = bp.bounds or (0, 0, 0, 0)
        return {"d": pen.getCommands(), "bbox": b, "adv": self.adv(ch) * scale}


B500 = Face(os.path.join(ASSETS, "Baloo2-500.ttf"))
B700 = Face(os.path.join(ASSETS, "Baloo2-700.ttf"))
B800 = Face(os.path.join(ASSETS, "Baloo2-800.ttf"))
ON500 = Face(os.path.join(ASSETS, "Onest-500.ttf"))


def ink_bbox(parts: list[dict]) -> tuple[float, float, float, float]:
    xs1 = [p["bbox"][0] for p in parts]
    ys1 = [p["bbox"][1] for p in parts]
    xs2 = [p["bbox"][2] for p in parts]
    ys2 = [p["bbox"][3] for p in parts]
    return (min(xs1), min(ys1), max(xs2), max(ys2))


def merged(parts: list[dict]) -> str:
    return " ".join(p["d"] for p in parts if p["d"])


# ══════════════════════════════════════════════ знак-поле (фрагмент) ════
def field_cut_shapes(g: dict) -> str:
    """Чёрные (вырезаемые) формы маски в координатах сетки 64."""
    m = g["stroke"]
    S = g["grid"]
    cx = S / 2
    r_out = g["circleR"]
    r_in = r_out - m
    sh = [
        # центральная линия — вся высота, уходит за кромки
        f'<rect x="{num(cx - m / 2)}" y="-2" width="{num(m)}" height="68"/>',
        # центральный круг: кольцо-вырез (центр остаётся золотым)
        f'<circle cx="{num(cx)}" cy="{num(cx)}" r="{num(r_out)}"/>',
        f'<circle cx="{num(cx)}" cy="{num(cx)}" r="{num(r_in)}" fill="#fff"/>',
    ]
    if not g["simple"]:
        D, H = g["penD"], g["penH"]
        y0 = (S - H) / 2
        for left in (True, False):
            x0 = -1 if left else S - D
            w = D + 1
            vx = D - m if left else S - D
            # внутренняя вертикальная линия площади
            sh.append(f'<rect x="{num(vx)}" y="{num(y0)}" width="{num(m)}" height="{num(H)}"/>')
            # верхняя и нижняя линии (до кромки поля)
            sh.append(f'<rect x="{num(x0)}" y="{num(y0)}" width="{num(w)}" height="{num(m)}"/>')
            sh.append(f'<rect x="{num(x0)}" y="{num(y0 + H - m)}" width="{num(w)}" height="{num(m)}"/>')
    return "".join(sh)


def field_fragment(
    g: dict, x: float, y: float, size: float, mid: str,
    fill: str = GOLD, grad: tuple[str, str] | None = None, gid: str | None = None,
) -> str:
    """Знак-поле в точке (x,y) со стороной size. fill — плоский цвет или
    url(#gid); grad=(top,bottom) — локальный вертикальный градиент."""
    k = size / g["grid"]
    fill_attr = f'fill="{fill}"'
    grad_def = ""
    if grad and gid:
        grad_def = (
            f'<linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="{num(g["grid"])}" '
            f'gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{grad[0]}"/><stop offset="1" stop-color="{grad[1]}"/>'
            f"</linearGradient>"
        )
        fill_attr = f'fill="url(#{gid})"'
    return (
        f'<g transform="translate({num(x)},{num(y)}) scale({num(k)})">'
        f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="0" y="0" '
        f'width="{num(g["grid"])}" height="{num(g["grid"])}">'
        f'<rect width="{num(g["grid"])}" height="{num(g["grid"])}" fill="#fff"/>'
        f'<g fill="#000">{field_cut_shapes(g)}</g>'
        f"</mask>"
        f"{grad_def}"
        f'<rect width="{num(g["grid"])}" height="{num(g["grid"])}" rx="{num(g["rx"])}" '
        f'{fill_attr} mask="url(#{mid})"/>'
        f"</g>"
    )


# ══════════════════════════════════════════════ ВЕРТИКАЛЬНАЯ ═══════════
def build_vertical():
    """«scores» (белый) над «b[поле]x»: ink-выключка влево, ширины строк
    равны (кегль scores решается уравнением), зазор LINE_GAP."""
    sb = BOX_X / B800.sxh
    b = B800.path("b", sb, 0, 0)
    xg = B800.path("x", sb, 0, 0)
    b_asc = -b["bbox"][1]  # высота «b» над базовой линией

    # нижняя строка: b [поле] x
    bx = -b["bbox"][0]                                    # b ink-left → 0
    fx = (b["bbox"][2] - b["bbox"][0]) + FIELD_GAP        # x поля
    xox = fx + FIELD_SIZE + FIELD_GAP - xg["bbox"][0]     # origin «x»
    line_w = fx + FIELD_SIZE + FIELD_GAP + (xg["bbox"][2] - xg["bbox"][0])

    # верхняя строка: кегль scores под ширину нижней строки
    tr = SCORES_TRACK
    sum_adv = sum(B500.adv(c) for c in "scores")
    s_bbox = B500.path("s", 1.0, 0, 0)["bbox"]
    natural = sum_adv - s_bbox[0] - (B500.adv("s") - s_bbox[2])
    ss = (line_w - 5 * tr) / natural

    # раскладка scores на базовой 0 → сдвиг ink-left в 0
    parts, xx = [], 0.0
    for ch in "scores":
        g = B500.path(ch, ss, xx, 0)
        parts.append(g)
        xx += g["adv"] + tr
    ink = ink_bbox(parts)
    dx = -ink[0]
    parts, xx = [], dx
    for ch in "scores":
        g = B500.path(ch, ss, xx, 0)
        parts.append(g)
        xx += g["adv"] + tr
    ink = ink_bbox(parts)
    sc_ink_h = ink[3] - ink[1]

    # финальные координаты: ink-top scores = 0
    sc_base = -ink[1]
    parts, xx = [], dx
    for ch in "scores":
        g = B500.path(ch, ss, xx, sc_base)
        parts.append(g)
        xx += g["adv"] + tr

    # baseline «box»: ink-bottom scores + LINE_GAP + asc «b»
    box_base = sc_base + ink[3] + LINE_GAP + b_asc
    bf = B800.path("b", sb, bx, box_base)
    xf = B800.path("x", sb, xox, box_base)
    field = (fx, box_base - FIELD_SIZE, FIELD_SIZE)

    ib = ink_bbox([*parts, bf, xf])
    vb = [ib[0], ib[1], ib[2] - ib[0], ib[3] - ib[1]]
    metrics = {
        "vb": vb,
        "scores_scale": ss,
        "scores_xh": ss * B500.sxh,
        "ratio": BOX_X / (ss * B500.sxh),
        "line_w": line_w,
        "b_asc": b_asc,
        "field": list(field),
        "grad_y": [box_base - b_asc, box_base],
    }
    return metrics, merged(parts), merged([bf, xf])


def vertical_svg(mode: str, m: dict, sc_path: str, box_path: str) -> str:
    """mode: dark | light | mono-white | mono-black."""
    vb = m["vb"]
    fx, fy, fs = m["field"]
    mono = mode.startswith("mono")
    if mono:
        color = "#FFFFFF" if mode == "mono-white" else "#000000"
        sc_fill, box_fill, field_fill = color, color, color
        grad = None
    else:
        sc_fill = WHITE if mode == "dark" else INK
        box_fill = "url(#lg47bx)"
        field_fill = "url(#lg47fl)"
        grad = (GOLD_DEEP, GOLD_ACCENT)
    grad_letters = (
        f'<linearGradient id="lg47bx" x1="0" y1="{num(m["grad_y"][0])}" x2="0" '
        f'y2="{num(m["grad_y"][1])}" gradientUnits="userSpaceOnUse">'
        f'<stop offset="0" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_DEEP}"/>'
        f"</linearGradient>"
        if not mono else ""
    )
    field = field_fragment(MARK, fx, fy, fs, "mk47v", fill=field_fill, grad=grad, gid="lg47fl")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{num(vb[0])} {num(vb[1])} '
        f'{num(vb[2])} {num(vb[3])}">'
        f"{grad_letters}"
        f'<path d="{sc_path}" fill="{sc_fill}"/>'
        f'<path d="{box_path}" fill="{box_fill}"/>'
        f"{field}"
        f"</svg>"
    )


# ══════════════════════════════════════════════ ГОРИЗОНТАЛЬНАЯ ══════════
def build_horizontal():
    sw = HW_WORD_X / B700.sxh
    x0 = HW_MARK + HW_GAP
    parts, xx = [], x0
    for ch in "scoresbox":
        g = B700.path(ch, sw, xx, 0)
        parts.append(g)
        xx += g["adv"] + HW_TRACK
    ink = ink_bbox(parts)
    # вертикальное центрирование ink слова относительно знака (0..HW_MARK)
    dy = (HW_MARK - (ink[3] - ink[1])) / 2 - ink[1]
    parts, xx = [], x0
    for ch in "scoresbox":
        g = B700.path(ch, sw, xx, dy)
        parts.append(g)
        xx += g["adv"] + HW_TRACK
    ink = ink_bbox(parts)
    sc_path, bx_path = merged(parts[:6]), merged(parts[6:])
    W = ink[2]  # ink-right слова — правая граница (знак в 0)
    return {
        "vb": [0, 0, W, HW_MARK],
        "word_xh": HW_WORD_X,
        "b_asc": -ink[1],
        "ink": list(ink),
    }, sc_path, bx_path


def horizontal_svg(mode: str, m: dict, sc_path: str, bx_path: str) -> str:
    vb = m["vb"]
    if mode == "light":
        sc_fill, bx_fill, fl_fill = INK, GOLD_DEEP, GOLD_DEEP
    else:
        sc_fill, bx_fill, fl_fill = WHITE, GOLD, GOLD
    field = field_fragment(MARK, 0, 0, HW_MARK, "mk47h", fill=fl_fill)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {num(vb[2])} {num(vb[3])}">'
        f"{field}"
        f'<path d="{sc_path}" fill="{sc_fill}"/>'
        f'<path d="{bx_path}" fill="{bx_fill}"/>'
        f"</svg>"
    )


# ══════════════════════════════════════════════ OG 1200×630 ════════════
def build_og(vm, sc_path, box_path) -> str:
    """og-карточка: опак-фон #0A0D13, вертикальный лого по центру,
    домен + слоган (текст — ПУТЯМИ из Onest). Вырезы поля показывают
    опак-фон — соцсети композят альфу на белый, разметка не «бледнеет»."""
    W, H = 1200, 630
    lw = 348.0
    vh = lw * vm["vb"][3] / vm["vb"][2]
    lx, ly = (W - lw) / 2, 156

    # вложенный лого: пересобираем тело без корневого тега
    body = vertical_svg_body(vm, sc_path, box_path)
    logo_nested = (
        f'<svg x="{num(lx)}" y="{num(ly)}" width="{num(lw)}" height="{num(vh)}" '
        f'viewBox="{num(vm["vb"][0])} {num(vm["vb"][1])} {num(vm["vb"][2])} {num(vm["vb"][3])}">'
        f"{body}</svg>"
    )

    fs = 34.0
    sc = fs / ON500.sxh
    dom, tag = "scoresbox.ru", "Футбол Чувашии онлайн"

    def text_path(s: str, x: float, y: float):
        ps, xx = [], x
        for ch in s:
            if ch == " ":
                xx += ON500.adv(" ") * sc
                continue
            g = ON500.path(ch, sc, xx, y)
            ps.append(g)
            xx += g["adv"]
        return merged(ps), ink_bbox(ps)

    # ширины: замер через временную раскладку
    _, d_ink = text_path(dom, 0, 0)
    _, t_ink = text_path(tag, 0, 0)
    dot_w = 44.0
    total = (d_ink[2] - d_ink[0]) + dot_w + (t_ink[2] - t_ink[0])
    x_start = (W - total) / 2
    ybase = 540
    # origin смещаем на −lsb, чтобы ink-край встал точно в x_start
    dom_d, _ = text_path(dom, x_start - d_ink[0], ybase)
    tag_d, _ = text_path(tag, x_start + (d_ink[2] - d_ink[0]) + dot_w - t_ink[0], ybase)
    dot_x = x_start + (d_ink[2] - d_ink[0]) + dot_w / 2

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
        f'<rect width="{W}" height="{H}" fill="{INK}"/>'
        f"{logo_nested}"
        f'<path d="{dom_d}" fill="{GOLD}"/>'
        f'<circle cx="{num(dot_x)}" cy="{num(ybase - 12)}" r="3.2" fill="{INK3}"/>'
        f'<path d="{tag_d}" fill="{INK3}"/>'
        f"</svg>"
    )


def vertical_svg_body(m, sc_path, box_path) -> str:
    """Тело vertical dark без корневого <svg> (для вложения в og)."""
    fx, fy, fs = m["field"]
    grad_letters = (
        f'<linearGradient id="lg47bx" x1="0" y1="{num(m["grad_y"][0])}" x2="0" '
        f'y2="{num(m["grad_y"][1])}" gradientUnits="userSpaceOnUse">'
        f'<stop offset="0" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_DEEP}"/>'
        f"</linearGradient>"
    )
    field = field_fragment(MARK, fx, fy, fs, "mk47v", fill="url(#lg47fl)",
                           grad=(GOLD_DEEP, GOLD_ACCENT), gid="lg47fl")
    return (
        f"{grad_letters}"
        f'<path d="{sc_path}" fill="{WHITE}"/>'
        f'<path d="{box_path}" fill="url(#lg47bx)"/>'
        f"{field}"
    )


# ══════════════════════════════════════════════ logo-paths.ts ══════════
def build_ts(vm, sc_v, bx_v, hm, sc_h, bx_h) -> str:
    def arr(v):
        return "[" + ", ".join(num(x) for x in v) + "]"

    def geom(g):
        return (
            "{{ grid: {}, rx: {}, stroke: {}, circleR: {}, penD: {}, penH: {}, simple: {} }}"
            .format(num(g["grid"]), num(g["rx"]), num(g["stroke"]), num(g["circleR"]),
                    num(g["penD"]), num(g["penH"]), "true" if g["simple"] else "false")
        )

    return f"""// ============================================================
// GENERATED FILE — scripts/make-logo47.py (v1.0.47, бриф 2026-10-06).
// НЕ ПРАВИТЬ ВРУЧНУЮ: правки — в генераторе, затем перегенерация.
//
// Чистые SVG-пути логотипа (контуры Baloo 2 Medium/Bold/ExtraBold,
// извлечённые fontTools): лого не зависит от шрифтов и НЕ МОЖЕТ
// переноситься на две строки (живого текста нет). Знак-поле —
// параметрическая геометрия на сетке 64 (FIELD_FULL / FIELD_SIMPLE).
// ============================================================

export type FieldGeom = {{
  grid: number; rx: number; stroke: number; circleR: number;
  penD: number; penH: number; simple: boolean;
}};

/** Знак-поле, ПОЛНАЯ разметка (штрих 5.5%, круг d 32.8%, штрафные). */
export const FIELD_FULL: FieldGeom = {geom(MARK)};

/** Знак-поле, УПРОЩЁННАЯ разметка ≤24px (штрафные убраны, штрих 8.75%). */
export const FIELD_SIMPLE: FieldGeom = {geom(MARK_SIMPLE)};

/** ВЕРТИКАЛЬНАЯ (парадная) композиция: «scores» белый над «b[поле]x»
 *  (градиент), выключка влево, ширины строк выровнены. */
export const VERTICAL = {{
  vb: {arr(vm["vb"])},
  scores: "{sc_v}",
  box: "{bx_v}",
  field: {{ x: {num(vm["field"][0])}, y: {num(vm["field"][1])}, size: {num(vm["field"][2])} }},
  gradY: [{num(vm["grad_y"][0])}, {num(vm["grad_y"][1])}],
}};

/** ГОРИЗОНТАЛЬНАЯ композиция (шапка): [знак-поле] + «scoresbox»
 *  одной строкой, плоские цвета. */
export const HORIZONTAL = {{
  vb: {arr(hm["vb"])},
  scores: "{sc_h}",
  box: "{bx_h}",
  field: {{ x: 0, y: 0, size: {num(HW_MARK)} }},
}};

/** Цвета бренда (токены брифа v1.0.47). */
export const LOGO47_COLORS = {{
  gold: "{GOLD}",
  goldDeep: "{GOLD_DEEP}",
  goldAccent: "{GOLD_ACCENT}",
  white: "{WHITE}",
  ink: "{INK}",
  /** золото на светлом фоне в админ-теме (канон globals.css) */
  goldOnLight: "#b45309",
}} as const;
"""


# ══════════════════════════════════════════════ main ═══════════════════
def main() -> None:
    os.makedirs(OUTDIR, exist_ok=True)

    vm, sc_v, bx_v = build_vertical()
    hm, sc_h, bx_h = build_horizontal()

    print("VERTICAL vb:", [round(v, 1) for v in vm["vb"]],
          "| scores x-height:", round(vm["scores_xh"], 1),
          "| ratio box/scores:", round(vm["ratio"], 2),
          "| line_w:", round(vm["line_w"], 1),
          "| b_asc:", round(vm["b_asc"], 1))
    print("HORIZONTAL vb:", [round(v, 1) for v in hm["vb"]],
          "| word x-height:", round(hm["word_xh"], 1),
          "| b_asc(word):", round(hm["b_asc"], 1))

    outs = {
        "vertical-dark.svg": vertical_svg("dark", vm, sc_v, bx_v),
        "vertical-light.svg": vertical_svg("light", vm, sc_v, bx_v),
        "vertical-mono-white.svg": vertical_svg("mono-white", vm, sc_v, bx_v),
        "vertical-mono-black.svg": vertical_svg("mono-black", vm, sc_v, bx_v),
        "horizontal-dark.svg": horizontal_svg("dark", hm, sc_h, bx_h),
        "horizontal-light.svg": horizontal_svg("light", hm, sc_h, bx_h),
        "mark-full.svg": (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
            + field_fragment(MARK, 0, 0, 64, "mk47f", fill=GOLD) + "</svg>"
        ),
        "mark-simple.svg": (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
            + field_fragment(MARK_SIMPLE, 0, 0, 64, "mk47s", fill=GOLD) + "</svg>"
        ),
    }
    for name, svg in outs.items():
        p = os.path.join(OUTDIR, name)
        with open(p, "w", encoding="utf-8") as f:
            f.write(svg)
        print("OK ", p, len(svg), "bytes")

    with open(os.path.join(OUTDIR, "og.svg"), "w", encoding="utf-8") as f:
        f.write(build_og(vm, sc_v, bx_v))
    print("OK ", os.path.join(OUTDIR, "og.svg"))

    with open(os.path.join(ROOT, "public", "logo.svg"), "w", encoding="utf-8") as f:
        f.write(outs["vertical-dark.svg"])
    with open(os.path.join(ROOT, "src", "app", "icon.svg"), "w", encoding="utf-8") as f:
        f.write(outs["mark-simple.svg"])

    ts = build_ts(vm, sc_v, bx_v, hm, sc_h, bx_h)
    p = os.path.join(ROOT, "src", "components", "portal", "logo-paths.ts")
    with open(p, "w", encoding="utf-8") as f:
        f.write(ts)
    print("OK ", p, len(ts), "bytes")


if __name__ == "__main__":
    main()
