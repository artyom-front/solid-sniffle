// SCORESBOX v1.0.47 — растеризация бренд-ассетов из КАНОНИЧЕСКИХ SVG
// (public/brand/logo47/*.svg, генерируются scripts/make-logo47.py).
// Заменяет v1.0.46-генератор make-brand-assets.py (Pillow): теперь
// PNG-ассеты и React-компоненты строятся из ОДНОЙ геометрии.
//
//   1. src/app/apple-icon.png  240×240 — знак-поле (полная разметка,
//      вырезы прозрачные — «честные дырки», v1.0.46-паттерн);
//   2. public/og-image.png   1200×630 — og.svg: опак-фон #0A0D13 +
//      парадный вертикальный лого + домен/слоган (текст — путями).
//      Вырезы показывают ОПАК-фон: соцсети композят альфу на белый
//      (грабля v1.0.46 — разметка «бледнела»).
//
// Суперсэмплинг: корневые width/height SVG подменяются на ×4/×2 и
// рендерятся 1:1 (viewBox не меняется), затем LANCZOS-даунскейл.
// Запуск: bun scripts/make-brand-assets.mjs
import sharp from "sharp";
import { readFile, mkdir } from "node:fs/promises";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = `${ROOT}public/brand/logo47`;
const TMP = "/tmp/logo47-ss";

/** Растеризация SVG в target×target: подмена width/height на ×ss,
 *  рендер 1:1, LANCZOS-даунскейл. Возвращает sharp-пайплайн результата. */
async function renderAt(svgPath, ss, targetW, targetH) {
  const svg = await readFile(svgPath, "utf8");
  const scaled = svg.replace(
    /^<svg([^>]*?)width="[\d.]+" height="[\d.]+"/,
    (_m, attrs) => `<svg${attrs}width="${targetW * ss}" height="${targetH * ss}"`
  );
  const buf = Buffer.from(scaled, "utf8");
  await sharp(buf).png().toFile(`${TMP}.png`);
  return sharp(`${TMP}.png`).resize(targetW, targetH, { kernel: "lanczos3" });
}

async function main() {
  await mkdir(`${ROOT}src/app`, { recursive: true });
  await mkdir(`${ROOT}public`, { recursive: true });

  // apple-icon: знак-поле, полная разметка, вырезы прозрачные
  const apple = await renderAt(`${SRC}/mark-full.svg`, 4, 240, 240);
  await apple.png().toFile(`${ROOT}src/app/apple-icon.png`);
  console.log(`OK  ${ROOT}src/app/apple-icon.png 240x240 (вырезы прозрачные)`);

  // og-image: 1200×630, фон ОПАК (flatten — страховка альфы)
  const og = await renderAt(`${SRC}/og.svg`, 2, 1200, 630);
  await og
    .flatten({ background: "#0A0D13" })
    .png()
    .toFile(`${ROOT}public/og-image.png`);
  console.log(`OK  ${ROOT}public/og-image.png 1200x630`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
