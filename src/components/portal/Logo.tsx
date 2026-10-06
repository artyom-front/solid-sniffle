"use client";

// ============================================================
// SCORESBOX · система логотипа v1.0.46 (бриф 2026-10-06).
//
//   • LogoVertical — ОСНОВНАЯ (вертикальная) композиция: «scores»
//     (Medium, чернильный/белый, по центру) над «box» (Black,
//     золото, ~2× крупнее, плотный трекинг). Силуэт близок к квадрату.
//   • LogoWordmark — ГОРИЗОНТАЛЬНАЯ версия для шапки сайта:
//     «scores» Light (ink) + «b[знак]x» Black (золото) одной строкой
//     (v1.0.40, референс владельца) — знак ВЛОЖЕН вместо «o».
//   • LogoGlyph / LogoGlyphInline — ЗНАК-ПОЛЕ: золотой квадрат с
//     СИЛЬНО скруглёнными углами (rx 20/64) и разметкой стадиона
//     ВЫРЕЗАМИ — цвет фона просвечивает сквозь линии (бриф: «линии
//     выполнены в цвет фона»): центральная вертикальная линия,
//     центральный круг (кольцо, центр остаётся золотым), две
//     штрафные площадки у кромок. Толщина всех линий одинакова
//     (7.5/64) и соответствует насыщенности букв «b»/«x» — знак
//     читается как полноценная буква «o». Живёт и отдельно
//     (favicon / apple-icon / OG), и вложенным в «box».
//   • ЦВЕТА: канон сайта — золото #FFD700 на тёмном / #b45309 на
//     светлом (через var(--gold)); бриф-референс #EBC15D указан
//     «примерно», по оговорке «адаптировать под стили текущего
//     сайта» берём канон палитры. Монохром — fill=currentColor.
//   • Вырезы реализованы <mask> (а не составным путём): объединение
//     пересекающихся линий (центральная линия × круг) вычитается
//     корректно, без «золотых пятен» на пересечениях. id маски
//     уникален на каждый инстанс (useId, SSR-стабилен).
//   • Витрина всех вариантов: /brand/logo-variants.html.
// ============================================================

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Тело знака-поля: маска (белое = оставить, чёрное = вырезать) +
 *  золотой квадрат rx 20/64. Сетка 64×64, толщина линий 7.5. */
function GlyphBody({ maskId, fill }: { maskId: string; fill: string }) {
  return (
    <>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#fff" />
        <g fill="#000">
          {/* центральная линия (половина поля) — вся высота, уходит за кромки */}
          <rect x="28.25" y="-2" width="7.5" height="68" />
          {/* центральный круг: кольцо-вырез, центр остаётся золотым */}
          <circle cx="32" cy="32" r="14" />
          <circle cx="32" cy="32" r="6.5" fill="#fff" />
          {/* штрафные площадки: по три линии у каждой кромки */}
          <rect x="13" y="13.5" width="7" height="37" />
          <rect x="-2" y="13.5" width="22" height="7" />
          <rect x="-2" y="43.5" width="22" height="7" />
          <rect x="44" y="13.5" width="7" height="37" />
          <rect x="44" y="13.5" width="22" height="7" />
          <rect x="44" y="43.5" width="22" height="7" />
        </g>
      </mask>
      <rect width="64" height="64" rx="20" fill={fill} mask={`url(#${maskId})`} />
    </>
  );
}

/** Уникальный id маски: useId санитизирован до [A-Za-z0-9] — безопасно
 *  для url(#…) без экранирования в любых браузерах. */
function useMaskId(): string {
  return `sbx${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

/** Знак-поле — отдельный квадрат (favicon-масштаб и лок-апы).
 *  Размер в px; mono — заливка currentColor (чёрно-белая версия). */
export function LogoGlyph({ size = 32, className, mono = false }: { size?: number; className?: string; mono?: boolean }) {
  const mid = useMaskId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <GlyphBody maskId={mid} fill={mono ? "currentColor" : "var(--gold, #FFD700)"} />
    </svg>
  );
}

/** ВЛОЖЕННЫЙ знак-поле — заменяет букву «o» в «box». Размер привязан
 *  к кеглю (0.62em — рост строчной с запасом, как у «o»), стоит на
 *  базовой линии, межбуквенные зазоры 0.07em. */
export function LogoGlyphInline({ className, mono = false }: { className?: string; mono?: boolean }) {
  const mid = useMaskId();
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn("mx-[0.07em] inline-block h-[0.62em] w-[0.62em] shrink-0 align-baseline", className)}
    >
      <GlyphBody maskId={mid} fill={mono ? "currentColor" : "var(--gold, #FFD700)"} />
    </svg>
  );
}

/** ГОРИЗОНТАЛЬНЫЙ вордрмарк (шапка сайта, v1.0.40): scores (Light,
 *  ink) + b[знак-поле]x (Black, золото) одной строкой. */
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

/** ОСНОВНОЙ (вертикальный) логотип (бриф 2026-10-06): «scores» Medium
 *  по центру над «box» Black (~2× крупнее), плотный трекинг, знак-поле
 *  вместо «o». size — ширина блока в px, силуэт близок к квадрату.
 *  mono — вся композиция currentColor (монохромная версия). */
export function LogoVertical({
  size = 120,
  mono = false,
  scoresClassName,
  boxClassName,
  className,
}: {
  size?: number;
  mono?: boolean;
  scoresClassName?: string;
  boxClassName?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("flex flex-col items-center leading-none", className)}
      style={{ width: size, gap: size * 0.04 }}
      role="img"
      aria-label="SCORESBOX"
    >
      <span
        className={cn("font-medium tracking-[0.03em] text-ink", mono && "text-current", scoresClassName)}
        style={{ fontSize: size * 0.2 }}
      >
        scores
      </span>
      <span
        className={cn("font-black tracking-[-0.02em] text-gold", mono && "text-current", boxClassName)}
        style={{ fontSize: size * 0.42, lineHeight: 1.05 }}
      >
        b<LogoGlyphInline mono={mono} />x
      </span>
    </span>
  );
}

/** Lockup шапки: горизонтальный вордрмарк + слоган 12px серым справа,
 *  ТОЛЬКО при ширине ≥1024px. glyph — параметр совместимости вызовов
 *  админки (размер знака живёт в кегле вордрмарка). */
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
