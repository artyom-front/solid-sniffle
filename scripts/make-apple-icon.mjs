// Генерация apple-touch-icon (180×180) из знака-поля SCORESBOX (Р-01).
// Apple сам маскирует иконку в сквиркл → отдаём ПОЛНЫЙ квадрат:
// тёмный фон «Ночь под прожекторами» + золотый знак-поле с разметкой
// (та же геометрия, что в src/app/icon.svg и Logo.tsx).
import sharp from "sharp";

const GOLD = "#FFD700";
const INK = "#17130A";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="#0A0D13"/>
  <rect x="27" y="27" width="126" height="126" rx="31.5" fill="${GOLD}"/>
  <g stroke="${INK}" fill="none" stroke-linecap="round" transform="translate(27 27) scale(1.96875)">
    <line x1="32" y1="6" x2="32" y2="58" stroke-width="4"/>
    <circle cx="32" cy="32" r="8.5" stroke-width="4"/>
    <rect x="5" y="18" width="11" height="28" rx="1.5" stroke-width="3.5"/>
    <rect x="48" y="18" width="11" height="28" rx="1.5" stroke-width="3.5"/>
    <rect x="5" y="26" width="6" height="12" rx="1" stroke-width="3"/>
    <rect x="53" y="26" width="6" height="12" rx="1" stroke-width="3"/>
    <path d="M6 8 a3.5 3.5 0 0 0 3.5 -3.5" stroke-width="3"/>
    <path d="M58 8 a3.5 3.5 0 0 1 -3.5 -3.5" stroke-width="3"/>
    <path d="M6 56 a3.5 3.5 0 0 1 3.5 3.5" stroke-width="3"/>
    <path d="M58 56 a3.5 3.5 0 0 0 -3.5 3.5" stroke-width="3"/>
  </g>
  <circle cx="90" cy="90" r="3.9" fill="${INK}"/>
</svg>`;

const out = "src/app/apple-icon.png";
await sharp(Buffer.from(svg), { density: 96 }).png().toFile(out);
console.log("OK:", out);
