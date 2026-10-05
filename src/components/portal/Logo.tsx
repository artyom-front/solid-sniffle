// ============================================================
// SCORESBOX · фирменный логотип v1.0.40 «scoresb□x».
//
// КОНЦЕПЦИЯ (фидбек владельца 2026-10-01, референс во вложении):
// знак ВЛОЖЕН в вордрмарк и заменяет букву «o» в слове «box» —
// «scores» + «b» + [знак-поле] + «x» одной строкой. Пропорции
// сверены с референсом: знак = высота строчных (x-height),
// ширина ≈ буква, стоит на базовой линии, зазоры как межбуквенные.
// АДАПТАЦИЯ под наш дизайн:
//   • знак = золотой квадрат с разметкой футбольного поля (вид
//     сверху) — фирменный знак scoresbox, а не крест референса;
//   • «scores» Light (300, ink) + «b…x» Black (900, золото);
//   • слоган «Футбол Чувашии онлайн» 12px серый — справа от
//     вордрмарка ТОЛЬКО при ширине ≥1024px (тонкий разделитель).
// LogoGlyph (32px, отдельный квадрат-поле) остаётся для favicon,
// apple-icon и лок-апа страницы входа — знак живёт и отдельно.
// Плоский цвет, без свечений и теней. Цвета через CSS-переменные
// --gold/--goldink: корректен и в тёмном сайте (#FFD700), и в
// светлой админке (#b45309). Для standalone (favicon) — литералы.
// Варианты: /brand/logo-variants.html
// ============================================================

import { cn } from "@/lib/utils";

/** Знак-поле: золотой квадрат (скругление 8px при size=32) +
 *  тёмная разметка футбольного поля (вид сверху): центральная
 *  линия, круг со штрафной точкой, штрафные и вратарские зоны
 *  у обеих «ворот», угловые дуги. Размер — в px. */
export function LogoGlyph({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      {/* фон-поле: rx 16/64 = 8px на знаке 32px (Р-01) */}
      <rect width="64" height="64" rx="16" fill="var(--gold, #FFD700)" />
      <g stroke="var(--goldink, #17130A)" fill="none" strokeLinecap="round">
        {/* центральная линия (половина поля) */}
        <line x1="32" y1="6" x2="32" y2="58" strokeWidth="4" />
        {/* центральный круг + точка */}
        <circle cx="32" cy="32" r="8.5" strokeWidth="4" />
        {/* штрафные площадки у обеих «ворот» */}
        <rect x="5" y="18" width="11" height="28" rx="1.5" strokeWidth="3.5" />
        <rect x="48" y="18" width="11" height="28" rx="1.5" strokeWidth="3.5" />
        {/* вратарские зоны (6 ярдов) */}
        <rect x="5" y="26" width="6" height="12" rx="1" strokeWidth="3" />
        <rect x="53" y="26" width="6" height="12" rx="1" strokeWidth="3" />
        {/* угловые дуги — поле «читается» даже в 16px */}
        <path d="M6 8 a3.5 3.5 0 0 0 3.5 -3.5" strokeWidth="3" />
        <path d="M58 8 a3.5 3.5 0 0 1 -3.5 -3.5" strokeWidth="3" />
        <path d="M6 56 a3.5 3.5 0 0 1 3.5 3.5" strokeWidth="3" />
        <path d="M58 56 a3.5 3.5 0 0 0 -3.5 3.5" strokeWidth="3" />
      </g>
      <circle cx="32" cy="32" r="2" fill="var(--goldink, #17130A)" />
    </svg>
  );
}

/** ВЛОЖЕННЫЙ знак-поле — заменяет букву «o» в «box» (v1.0.40).
 *  Размер привязан к кеглю вордрмарка (em): высота/ширина 0.62em —
 *  чуть выше x-height букв (как «o» с маленьким выносом), стоит на
 *  базовой линии, зазоры 0.07em как межбуквенные (пропорция
 *  референса: знак = рост строчной буквы). Разметка УПРОЩЕНА и
 *  УТОЛЩЕНА (центральная линия + круг + штрафные): на 9–15px
 *  тонкие вратарские зоны и угловые дуги не видны — только
 *  загущают знак. */
export function LogoGlyphInline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn("mx-[0.07em] inline-block h-[0.62em] w-[0.62em] shrink-0 align-baseline", className)}
    >
      <rect width="64" height="64" rx="13" fill="var(--gold, #FFD700)" />
      <g stroke="var(--goldink, #17130A)" fill="none" strokeLinecap="round">
        {/* центральная линия */}
        <line x1="32" y1="7" x2="32" y2="57" strokeWidth="7.5" />
        {/* центральный круг */}
        <circle cx="32" cy="32" r="10.5" strokeWidth="7.5" />
        {/* штрафные площадки у обеих «ворот» */}
        <rect x="4" y="17" width="12" height="30" rx="2" strokeWidth="7" />
        <rect x="48" y="17" width="12" height="30" rx="2" strokeWidth="7" />
      </g>
      <circle cx="32" cy="32" r="3.5" fill="var(--goldink, #17130A)" />
    </svg>
  );
}

/** Вордрмарк в ОДНУ строку (v1.0.40): scores (Light, ink) +
 *  b[знак-поле]x (Black, золото) — знак ВЛОЖЕН вместо «o»
 *  (референс владельца, адаптация под палитру scoresbox). */
export function LogoWordmark({ className, boxClassName, glyphClassName }: { className?: string; boxClassName?: string; glyphClassName?: string }) {
  return (
    <span className={cn("whitespace-nowrap font-light tracking-[-0.02em] text-ink", className)}>
      scores
      <span className={cn("font-black tracking-[-0.01em] text-gold", boxClassName)}>
        b<LogoGlyphInline className={glyphClassName} />x
      </span>
    </span>
  );
}

/** Полный lockup шапки (v1.0.40): вордрмарк «scoresb□x» со
 *  вложенным знаком + слоган 12px серый справа, ТОЛЬКО при
 *  ширине ≥1024px. glyph — параметр совместимости вызовов
 *  админки (размер знака теперь живёт в кегле вордрмарка). */
export function Logo({
  subtitle,
  subtitleClassName,
  className,
  glyph: _glyph,
  wordmarkClassName,
}: {
  glyph?: number;
  wordmarkClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 shrink-0 items-center gap-2.5", className)}>
      <LogoWordmark className={cn("text-[22px] leading-none", wordmarkClassName)} />
      {subtitle && (
        <span
          className={cn(
            "hidden whitespace-nowrap border-l border-sline pl-3 text-xs font-normal leading-tight text-ink3 min-[1024px]:block",
            subtitleClassName
          )}
        >
          {subtitle}
        </span>
      )}
    </span>
  );
}
