#!/usr/bin/env python3
"""SCORESBOX v1.0.46 — растеризация бренд-ассетов из геометрии знака-поля.

Генерирует (суперсэмплинг 4x + LANCZOS):
  1. src/app/apple-icon.png   240×240 — знак-поле, вырезы прозрачные;
  2. public/og-image.png     1200×630 — тёмный фон + вертикальный лого
     («scores» Medium белый / «box» Black золотом, знак вместо «o»)
     + домен и слоган.

Геометрия знака ЗЕРКАЛИТ Logo.tsx / icon.svg (сетка 64, толщина линий
7.5, rx 20): ImageDraw пишет пиксели напрямую (без композитинга), поэтому
прозрачная заливка = честные ВЫРЕЗЫ (RGBA). Шрифты: Onest из Google
Fonts (CSS API со старым UA отдаёт прямые TTF); офлайн-фолбэк — DejaVu.
"""

import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "scripts", "assets")
GOLD = (255, 215, 0, 255)  # #FFD700 — канон сайта
BG = (10, 13, 19, 255)  # #0A0D13
INK = (238, 238, 238, 255)  # #EEEEEE
INK3 = (94, 108, 125, 255)  # #5E6C7D
TRANSPARENT = (0, 0, 0, 0)

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow не установлен")


# ---------------------------------------------------------------- шрифты
def fetch_onest() -> dict[str, str] | None:
    """Onest Medium(500)/Black(900) TTF через CSS API (старый UA → ttf)."""
    os.makedirs(ASSETS, exist_ok=True)
    css_url = "https://fonts.googleapis.com/css2?family=Onest:wght@500;900"
    try:
        req = urllib.request.Request(css_url, headers={"User-Agent": "Wget/1.0"})
        css = urllib.request.urlopen(req, timeout=20).read().decode("utf-8")
        urls = re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+\.ttf)\)", css)
        if len(urls) < 2:
            return None
        out = {}
        for weight, url in zip(("500", "900"), urls[:2]):
            path = os.path.join(ASSETS, f"Onest-{weight}.ttf")
            if not os.path.exists(path):
                req = urllib.request.Request(url, headers={"User-Agent": "Wget/1.0"})
                data = urllib.request.urlopen(req, timeout=30).read()
                with open(path, "wb") as f:
                    f.write(data)
            out[weight] = path
        return out
    except Exception as e:  # noqa: BLE001 — офлайн просто уходим в фолбэк
        print(f"  Onest недоступен ({e}) — фолбэк DejaVu")
        return None


def fonts_for(scores_px: int, box_px: int) -> tuple:
    """(шрифт scores, шрифт box) с максимально близкими гарнитурами."""
    got = fetch_onest()
    if got:
        return (
            ImageFont.truetype(got["500"], scores_px),
            ImageFont.truetype(got["900"], box_px),
        )
    return (
        ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", scores_px),
        ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", box_px),
    )


# ---------------------------------------------------------------- знак-поле
def draw_glyph(d: ImageDraw.ImageDraw, x0: float, y0: float, S: float, fill, cut=None) -> None:
    """Знак-поле в координатах сетки 64×64 (S — px на единицу).
    Вырезы (cut): None → прозрачные (RGBA-«дырки», для favicon/apple-icon —
    цвет любого фона просвечивает); цвет → заливка вырезов этим цветом
    (для og-image: SOLID-фон #0A0D13 — иначе соцсети композят прозрачность
    на белый, и разметка выглядит белой). Порядок важен: центр-диск
    восстанавливается ПОСЛЕ центральной линии — линия прерывается на
    золотом центре)."""
    if cut is None:
        cut = (0, 0, 0, 0)
    d.rounded_rectangle([x0, y0, x0 + 64 * S, y0 + 64 * S], radius=20 * S, fill=fill)
    # центральная линия — вся высота, уходит за кромки
    d.rectangle([x0 + 28.25 * S, y0 - 2 * S, x0 + 35.75 * S, y0 + 66 * S], fill=cut)
    # центральный круг: кольцо-вырез + восстановление центра
    d.ellipse([x0 + 18 * S, y0 + 18 * S, x0 + 46 * S, y0 + 46 * S], fill=cut)
    d.ellipse([x0 + 25.5 * S, y0 + 25.5 * S, x0 + 38.5 * S, y0 + 38.5 * S], fill=fill)
    # штрафные: 3 линии у каждой кромки
    d.rectangle([x0 + 13 * S, y0 + 13.5 * S, x0 + 20 * S, y0 + 50.5 * S], fill=cut)
    d.rectangle([x0 - 2 * S, y0 + 13.5 * S, x0 + 20 * S, y0 + 20.5 * S], fill=cut)
    d.rectangle([x0 - 2 * S, y0 + 43.5 * S, x0 + 20 * S, y0 + 50.5 * S], fill=cut)
    d.rectangle([x0 + 44 * S, y0 + 13.5 * S, x0 + 51 * S, y0 + 50.5 * S], fill=cut)
    d.rectangle([x0 + 44 * S, y0 + 13.5 * S, x0 + 66 * S, y0 + 20.5 * S], fill=cut)
    d.rectangle([x0 + 44 * S, y0 + 43.5 * S, x0 + 66 * S, y0 + 50.5 * S], fill=cut)


# ---------------------------------------------------------------- apple-icon
def make_apple_icon() -> None:
    SS = 4
    N = 240 * SS
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_glyph(d, 0, 0, N / 64, GOLD)
    img = img.resize((240, 240), Image.LANCZOS)
    out = os.path.join(ROOT, "src", "app", "apple-icon.png")
    img.save(out)
    print(f"OK  {out} 240x240 (вырезы прозрачные)")


# ---------------------------------------------------------------- og-image
def make_og_image() -> None:
    W, H = 1200, 630
    SS = 2
    img = Image.new("RGBA", (W * SS, H * SS), BG)
    d = ImageDraw.Draw(img)

    f_scores, f_box = fonts_for(int(64 * SS), int(136 * SS))

    # --- «box»: b [знак] x — золотом, знак на базовой линии
    box_fs = 136 * SS
    glyph_w = int(box_fs * 0.62)
    gap = int(box_fs * 0.07)
    b_w = d.textlength("b", font=f_box)
    x_w = d.textlength("x", font=f_box)
    total = b_w + gap + glyph_w + gap + x_w
    box_x0 = (W * SS - total) / 2
    box_baseline = 385 * SS  # базовая линия «box»

    d.text((box_x0, box_baseline), "b", font=f_box, fill=GOLD, anchor="ls")
    glyph_x = box_x0 + b_w + gap
    draw_glyph(d, glyph_x, box_baseline - glyph_w, glyph_w / 64, GOLD, cut=BG)
    d.text((glyph_x + glyph_w + gap, box_baseline), "x", font=f_box, fill=GOLD, anchor="ls")

    # --- «scores»: белый Medium, по центру над «box»
    scores_w = d.textlength("scores", font=f_scores)
    cap_h = box_fs * 0.74  # высота «b» над базовой линией
    scores_y = box_baseline - cap_h - 14 * SS - 64 * SS  # над box + зазор
    # отслеживаем трекинг: рисуем посимвольно с +3% ширины
    adv = scores_w / len("scores") * 1.0
    cx = (W * SS - (scores_w + adv * 0.06 * len("scores"))) / 2
    for ch in "scores":
        d.text((cx, scores_y + 64 * SS), ch, font=f_scores, fill=INK, anchor="ls")
        cx += d.textlength(ch, font=f_scores) + adv * 0.06

    # --- подпись снизу: домен золотом + слоган приглушённым
    f_dom, _ = fonts_for(30 * SS, 30 * SS)
    dom = "scoresbox.ru"
    tag = "Футбол Чувашии онлайн"
    dom_w = d.textlength(dom, font=f_dom)
    tag_w = d.textlength(tag, font=f_dom)
    dot = d.textlength("  ·  ", font=f_dom)
    line_w = dom_w + dot + tag_w
    lx = (W * SS - line_w) / 2
    ly = 545 * SS
    d.text((lx, ly), dom, font=f_dom, fill=GOLD, anchor="ls")
    d.text((lx + dom_w, ly), "  ·  ", font=f_dom, fill=INK3, anchor="ls")
    d.text((lx + dom_w + dot, ly), tag, font=f_dom, fill=INK3, anchor="ls")

    img = img.resize((W, H), Image.LANCZOS)
    out = os.path.join(ROOT, "public", "og-image.png")
    img.save(out)
    print(f"OK  {out} 1200x630")


if __name__ == "__main__":
    print("Генерация бренд-ассетов SCORESBOX v1.0.46…")
    make_apple_icon()
    make_og_image()
    print("Готово.")
