#!/usr/bin/env python3
"""SCORESBOX v1.0.53 (feedback53) — генератор SB-монограммы (малый знак).

ЮЗЕР-ФИДБЕК 2026-10-08: «Маленьких лого, фавиконы и прочие надо
упростить до SB в нашем стиле» — малый знак портала становится
монограммой SB: ЗАГЛАВНЫЕ S+B (Baloo 2 ExtraBold — вес букв «box» в
лого v1.0.47) на золотом скруглённом квадрате (геометрия знака-поля
logo47: rx 17.5%). Литеры — ЧИСТЫЕ SVG-ПУТИ (fontTools), <text> нет —
фавикон не зависит от шрифтов и читается в 16px.

Пишет:
  1. src/components/portal/sb-paths.ts — модуль путей (LogoMark в
     Logo.tsx рендерит монограмму с v1.0.53);
  2. public/brand/logo53/mark.svg — фавикон по умолчанию (сетка 64);
  3. public/brand/logo53/mark-180.svg — болванка apple-touch 180×180;
  4. public/brand/logo53/og.svg — og-заготовка 1200×630: монограмма +
     парадный вертикальный лого (канон logo47) + домен (пути Onest).
PNG (apple-icon.png 180×180, og-default.png 1200×630) растеризует
scripts/make-sb-assets.mjs (sharp, суперсэмплинг): скрейперы соцсетей
PNG читают, SVG — нет.

ЗАПУСК: python3 scripts/make-sb-mark.py && bun scripts/make-sb-assets.mjs
Шрифты: scripts/assets/ (Baloo2-800.ttf, Onest-500.ttf — те же, что
logo47; генератор НЕ трогает чужие выходы make-logo47.py).
"""

from __future__ import annotations

import os
import re

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.misc.transform import Transform

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "scripts", "assets")
OUTDIR = os.path.join(ROOT, "public", "brand", "logo53")

# ── палитра = бренд-токены logo47 (единый стиль) ────────────────────────
GOLD = "#FFD700"        # поле знака (канон сайта)
INK = "#0A0D13"         # литеры (как разметка знака-поля: тёмные на золоте)
INK3 = "#5E6C7D"        # приглушённый текст og-подписи

# ── монограмма: геометрия на сетке 64 (как знак-поле logo47) ────────────
GRID = 64.0
RX = 11.2               # 17.5% — бренд-канон скругления (FIELD_FULL)
LETTER_H = 36.0         # высота литер (ink): 56% стороны — крупно и читаемо
KERN = -1.6             # плотная пара S-B (Baloo 2 скруглённый, лёгкий подхват)

# ── og-карточка 1200×630 ────────────────────────────────────────────────
OG_W, OG_H = 1200, 630
OG_MARK = 240.0         # монограмма в og
OG_GAP = 72.0           # монограмма → вертикальный лого
OG_LW = 348.0           # ширина вертикального лого (как в logo47/og.svg)
DOMAIN = "scoresbox.ru"
TAGLINE = "Футбол Чувашии онлайн"


def num(v: float) -> str:
    """Компактное число для SVG/TS."""
    s = f"{float(v):.2f}".rstrip("0").rstrip(".")
    return s if s else "0"


# ══════════════════════════════════════════════ извлечение глифов ═══════
class Face:
    """Шрифт + контуры в финальных координатах (ось y вниз)."""

    def __init__(self, path: str):
        self.font = TTFont(path)
        self.gs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()

    def glyph(self, ch: str) -> str:
        return self.cmap[ord(ch)]

    def adv(self, ch: str) -> float:
        return self.font["hmtx"][self.glyph(ch)][0]

    def path(self, ch: str, scale: float, dx: float, dy: float) -> dict:
        gname = self.glyph(ch)
        pen = SVGPathPen(self.gs, ntos=lambda v: num(v))
        t = Transform(scale, 0, 0, -scale, dx, dy)
        self.gs[gname].draw(TransformPen(pen, t))
        bp = BoundsPen(self.gs)
        self.gs[gname].draw(TransformPen(bp, t))
        b = bp.bounds or (0, 0, 0, 0)
        return {"d": pen.getCommands(), "bbox": b, "adv": self.adv(ch) * scale}


B800 = Face(os.path.join(ASSETS, "Baloo2-800.ttf"))
ON500 = Face(os.path.join(ASSETS, "Onest-500.ttf"))


# ══════════════════════════════════════════════ монограмма SB ═══════════
def build_mark() -> dict:
    """S+B на сетке 64: ink-выключка по центру, общая базовая линия,
    кернинг KERN. Возвращает пути + метрики (для выключки в UI)."""
    # масштаб: единицы шрифта → сетка 64 (по ink-высоте «S», она выше)
    s0 = B800.path("S", 1.0, 0, 0)
    ink_h = s0["bbox"][3] - s0["bbox"][1]
    scale = LETTER_H / ink_h

    # вертикаль: ink-верх литер на (GRID−LETTER_H)/2 (общая базовая)
    top = (GRID - LETTER_H) / 2
    s_probe = B800.path("S", scale, 0, 0)
    b_probe = B800.path("B", scale, 0, 0)

    # ink-верх литер на `top`: bbox[1] (dy=0) — это ink-верх со знаком −
    dy_s = top - s_probe["bbox"][1]
    dy_b = top - b_probe["bbox"][1]

    # горизонталь: S слева, B ink-впритык (кернинг), пара по центру
    s_w = s_probe["bbox"][2] - s_probe["bbox"][0]
    b_w = b_probe["bbox"][2] - b_probe["bbox"][0]
    total = s_w + KERN + b_w
    pad = (GRID - total) / 2

    dx_s = pad - s_probe["bbox"][0]
    s = B800.path("S", scale, dx_s, dy_s)
    s_right = s["bbox"][2]
    dx_b = s_right + KERN - b_probe["bbox"][0]
    b = B800.path("B", scale, dx_b, dy_b)

    ink = (
        min(s["bbox"][0], b["bbox"][0]), min(s["bbox"][1], b["bbox"][1]),
        max(s["bbox"][2], b["bbox"][2]), max(s["bbox"][3], b["bbox"][3]),
    )
    return {
        "s": s["d"], "b": b["d"],
        "ink": {"x": ink[0], "y": ink[1], "w": ink[2] - ink[0], "h": ink[3] - ink[1]},
    }


def mark_svg(m: dict, width: int = 64, height: int = 64, with_size: bool = True) -> str:
    """Автономный SVG монограммы (фавикон/apple-touch болванка)."""
    size_attrs = f'width="{width}" height="{height}"' if with_size else ""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {num(GRID)} {num(GRID)}" {size_attrs}>'
        f'<rect width="{num(GRID)}" height="{num(GRID)}" rx="{num(RX)}" fill="{GOLD}"/>'
        f'<path d="{m["s"]}" fill="{INK}"/>'
        f'<path d="{m["b"]}" fill="{INK}"/>'
        f"</svg>"
    )


def sb_paths_ts(m: dict) -> str:
    """src/components/portal/sb-paths.ts — модуль путей для Logo.tsx."""
    return f"""// ============================================================
// GENERATED FILE — scripts/make-sb-mark.py (v1.0.53, feedback53).
// НЕ ПРАВИТЬ ВРУЧНУЮ: правки — в генераторе, затем перегенерация.
//
// SB-монограмма — малый знак портала (юзер-фидбек 2026-10-08:
// «маленьких лого, фавиконы и прочие — упростить до SB в нашем
// стиле»). ЗАГЛАВНЫЕ S+B — контуры Baloo 2 ExtraBold (fontTools),
// литеры — ЧИСТЫЕ SVG-ПУТИ: <text> нет, webfont не нужен, фавикон
// читается в 16px. Стиль logo47: золотой скруглённый квадрат
// (rx 17.5% — как знак-поле), литеры INK (как разметка поля).
// Файлы-близнецы: public/brand/logo53/mark.svg, mark-180.svg, og.svg.
// ============================================================

/** Монограмма SB на сетке 64 (как FIELD_* в logo-paths.ts). */
export const SB_MARK = {{
  vb: [0, 0, 64, 64],
  /** скругление бейджа: 17.5% — бренд-канон знака-поля logo47 */
  rx: {num(RX)},
  /** контур литеры S (Baloo 2 ExtraBold) */
  s: "{m["s"]}",
  /** контур литеры B */
  b: "{m["b"]}",
  /** ink-bbox пары S+B в сетке 64 — для точной выключки/масштабов */
  ink: {{ x: {num(m["ink"]["x"])}, y: {num(m["ink"]["y"])}, w: {num(m["ink"]["w"])}, h: {num(m["ink"]["h"])} }},
}} as const;
"""


# ══════════════════════════════════════════════ og-карточка ═════════════
def onest_text(s: str, x: float, y: float, fs: float) -> tuple[str, tuple]:
    """Строка путями Onest-500 (как make-logo47). Возвращает (d, ink-bbox)."""
    sc = fs / (ON500.font["OS/2"].sxHeight or 460)
    parts, xx = [], x
    for ch in s:
        if ch == " ":
            xx += ON500.adv(" ") * sc
            continue
        g = ON500.path(ch, sc, xx, y)
        parts.append(g)
        xx += g["adv"]
    d = " ".join(p["d"] for p in parts if p["d"])
    xs1 = min(p["bbox"][0] for p in parts); ys1 = min(p["bbox"][1] for p in parts)
    xs2 = max(p["bbox"][2] for p in parts); ys2 = max(p["bbox"][3] for p in parts)
    return d, (xs1, ys1, xs2, ys2)


def build_og(m: dict) -> str:
    """og-заготовка 1200×630: опак-фон INK, слева SB-монограмма, справа
    парадный вертикальный лого (канон logo47 — вложенный как есть),
    внизу домен · слоган (пути Onest, золото/серый как в logo47/og.svg)."""
    # вертикальный лого: канонический SVG logo47, корневой тег → вложенный
    with open(os.path.join(ROOT, "public", "brand", "logo47", "vertical-dark.svg"), encoding="utf-8") as f:
        v_src = f.read()
    v_body = re.sub(r"^<svg[^>]*>", "", v_src).strip()
    v_body = re.sub(r"</svg>\s*$", "", v_body)
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', v_src).group(1).split()]
    vh = OG_LW * vb[3] / vb[2]

    # групповая выключка: [монограмма 240] [зазор 72] [вертикальный лого]
    group_w = OG_MARK + OG_GAP + OG_LW
    x0 = (OG_W - group_w) / 2
    y_mark = (OG_H - OG_MARK) / 2 - 30          # домен снизу забирает ~90px
    y_logo = y_mark + (OG_MARK - vh) / 2

    dom_d, dom_ink = onest_text(DOMAIN, 0, 0, 34)
    tag_d, tag_ink = onest_text(TAGLINE, 0, 0, 34)
    dot_w = 44.0
    dom_w = dom_ink[2] - dom_ink[0]
    tag_w = tag_ink[2] - tag_ink[0]
    total = dom_w + dot_w + tag_w
    x_start = (OG_W - total) / 2
    ybase = 540
    # origin −lsb: ink-край точно в x_start
    dom_d, _ = onest_text(DOMAIN, x_start - dom_ink[0], ybase, 34)
    tag_d, _ = onest_text(TAGLINE, x_start + dom_w + dot_w - tag_ink[0], ybase, 34)
    dot_x = x_start + dom_w + dot_w / 2

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{OG_W}" height="{OG_H}" '
        f'viewBox="0 0 {OG_W} {OG_H}">'
        f'<rect width="{OG_W}" height="{OG_H}" fill="{INK}"/>'
        # SB-монограмма (вложенная, сетка 64 → 240)
        f'<svg x="{num(x0)}" y="{num(y_mark)}" width="{num(OG_MARK)}" height="{num(OG_MARK)}" '
        f'viewBox="0 0 {num(GRID)} {num(GRID)}">'
        f'<rect width="{num(GRID)}" height="{num(GRID)}" rx="{num(RX)}" fill="{GOLD}"/>'
        f'<path d="{m["s"]}" fill="{INK}"/><path d="{m["b"]}" fill="{INK}"/>'
        f"</svg>"
        # парадный вертикальный лого (канон logo47)
        f'<svg x="{num(x0 + OG_MARK + OG_GAP)}" y="{num(y_logo)}" width="{num(OG_LW)}" '
        f'height="{num(vh)}" viewBox="{num(vb[0])} {num(vb[1])} {num(vb[2])} {num(vb[3])}">'
        f"{v_body}</svg>"
        # домен · слоган
        f'<path d="{dom_d}" fill="{GOLD}"/>'
        f'<circle cx="{num(dot_x)}" cy="{num(ybase - 12)}" r="3.2" fill="{INK3}"/>'
        f'<path d="{tag_d}" fill="{INK3}"/>'
        f"</svg>"
    )


def main() -> None:
    os.makedirs(OUTDIR, exist_ok=True)
    m = build_mark()

    ts_path = os.path.join(ROOT, "src", "components", "portal", "sb-paths.ts")
    with open(ts_path, "w", encoding="utf-8") as f:
        f.write(sb_paths_ts(m))
    print("OK ", ts_path)

    p = os.path.join(OUTDIR, "mark.svg")
    with open(p, "w", encoding="utf-8") as f:
        f.write(mark_svg(m))
    print("OK ", p)

    p = os.path.join(OUTDIR, "mark-180.svg")
    with open(p, "w", encoding="utf-8") as f:
        f.write(mark_svg(m, 180, 180))
    print("OK ", p)

    p = os.path.join(OUTDIR, "og.svg")
    with open(p, "w", encoding="utf-8") as f:
        f.write(build_og(m))
    print("OK ", p)

    print("ink-выключка пары:", {k: round(v, 2) for k, v in m["ink"].items()})


if __name__ == "__main__":
    main()
