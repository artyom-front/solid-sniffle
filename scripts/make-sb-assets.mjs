// SCORESBOX v1.0.53 (feedback53) — растеризация SB-монограммы в PNG.
// Источник — канонические SVG scripts/make-sb-mark.py (public/brand/logo53).
// Паттерн v1.0.47 (make-brand-assets.mjs): суперсэмплинг (width/height
// подменяются на ×ss, рендер 1:1, LANCZOS-даунскейл).
//   1. public/brand/logo53/apple-icon.png 180×180 — apple-touch по
//      умолчанию (скруглённый бейдж + SB, углы прозрачные);
//   2. public/brand/og-default.png 1200×630 — og:image по умолчанию
//      (фон ОПАК #0A0D13 — соцсети композят альфу на белый).
// PNG обязателен: скрейперы соцсетей/поисковиков SVG не читают.
// Запуск: bun scripts/make-sb-assets.mjs (после make-sb-mark.py)
import sharp from "sharp";
import { readFile, mkdir } from "node:fs/promises";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = `${ROOT}public/brand/logo53`;
const TMP = "/tmp/logo53-ss";

/** Растеризация SVG в target×target: подмена width/height на ×ss,
 *  рендер 1:1, LANCZOS-даунскейл. */
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
  await mkdir(`${ROOT}public/brand/logo53`, { recursive: true });

  // apple-touch 180×180 (бриф feedback53: «rounded-square badge + SB»)
  const apple = await renderAt(`${SRC}/mark-180.svg`, 4, 180, 180);
  await apple.png().toFile(`${SRC}/apple-icon.png`);
  console.log(`OK  ${SRC}/apple-icon.png 180x180 (SB-монограмма)`);

  // og:image 1200×630, фон ОПАК (flatten — страховка альфы)
  const og = await renderAt(`${SRC}/og.svg`, 2, 1200, 630);
  await og
    .flatten({ background: "#0A0D13" })
    .png()
    .toFile(`${ROOT}public/brand/og-default.png`);
  console.log(`OK  ${ROOT}public/brand/og-default.png 1200x630`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
