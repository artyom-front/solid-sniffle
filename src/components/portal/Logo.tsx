"use client";

// ============================================================
// SCORESBOX · система логотипа v1.0.47 (детальный бриф 2026-10-06).
//
// ЛОГО = ЧИСТЫЕ SVG-ПУТИ (контуры Baloo 2, извлечены fontTools в
// logo-paths.ts — генерируется scripts/make-logo47.py, руками не
// править). Живого текста нет → перенос на две строки и зависимость
// от webfont-ов ФИЗИЧЕСКИ НЕВОЗМОЖНЫ (дефект шапки v1.0.46 закрыт
// по построению).
//
//   • LogoVertical — ПАРАДНАЯ двухстрочная: «scores» (Baloo 2 Medium,
//     БЕЛЫЙ, ~½ высоты) над «b[поле]x» (ExtraBold, градиент
//     #FFD700→#F5C518), выключка влево, ширины строк выровнены,
//     поле-«o» — чуть крупнее букв, градиент #F5C518→#EDBE00
//     («самый насыщенный акцент»). Градиент — ТОЛЬКО здесь (бриф:
//     «в интерфейсе — плоский цвет»).
//   • LogoHorizontal — шапка: [знак-поле] + «scoresbox» ОДНОЙ
//     строкой (Baloo 2 Bold): scores белый, box золотой ПЛОСКИЙ.
//     height = сторона знака (32px в шапке 56px — бриф).
//   • LogoMark — знак-поле отдельно (2FA, favicon). simple=true —
//     упрощённая разметка ≤24px (штрафные убраны, штрих утолщён).
//   • Logo — лок-ап шапки: LogoHorizontal + слоган (≥1024px).
//
// Знак-поле: скруглённый квадрат (rx 17.5%), разметка ВЫРЕЗАМИ
// (негативное пространство, цвет фона) через SVG-<mask>: пересечение
// линии×круга при evenodd давало бы «золотое пятно» (грабля v1.0.46),
// маска вычитает корректно. id маски уникален на инстанс (useId,
// SSR-стабилен). Витрина всех вариантов: /brand/logo-variants.html.
// ============================================================

import { useId } from "react";
import { cn } from "@/lib/utils";
import type { BrandingDTO } from "./types";
import {
  FIELD_FULL,
  FIELD_SIMPLE,
  HORIZONTAL,
  LOGO47_COLORS,
  VERTICAL,
  type FieldGeom,
} from "./logo-paths";

const { gold, goldDeep, goldAccent, white, ink, goldOnLight } = LOGO47_COLORS;

/** Уникальный префикс id (маски/градиенты): useId санитизирован. */
function useIds(): string {
  return `sbx${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

/** Внутренности знака-поля: маска (белое = оставить, чёрное = вырезать)
 *  + золотой квадрат. Рисуется в локальной сетке 64 внутри <g transform>.
 *  fill применяется, если grad не задан; иначе — градиент с id. */
function FieldBody({
  geom,
  id,
  fill,
  grad,
}: {
  geom: FieldGeom;
  id: string;
  fill: string;
  grad?: { top: string; bottom: string };
}) {
  const S = geom.grid;
  const m = geom.stroke;
  const c = S / 2;
  const y0 = (S - geom.penH) / 2;
  const hasPen = !geom.simple;
  const gradId = `${id}fl`;
  return (
    <>
      <mask id={`${id}mk`} maskUnits="userSpaceOnUse" x={0} y={0} width={S} height={S}>
        <rect width={S} height={S} fill="#fff" />
        <g fill="#000">
          {/* центральная линия — вся высота, уходит за кромки */}
          <rect x={c - m / 2} y={-2} width={m} height={68} />
          {/* центральный круг: кольцо-вырез, центр остаётся золотым */}
          <circle cx={c} cy={c} r={geom.circleR} />
          <circle cx={c} cy={c} r={geom.circleR - m} fill="#fff" />
          {/* штрафные площадки: по три линии у каждой кромки (только полная версия) */}
          {hasPen && (
            <>
              <rect x={geom.penD - m} y={y0} width={m} height={geom.penH} />
              <rect x={-1} y={y0} width={geom.penD + 1} height={m} />
              <rect x={-1} y={y0 + geom.penH - m} width={geom.penD + 1} height={m} />
              <rect x={S - geom.penD} y={y0} width={m} height={geom.penH} />
              <rect x={S - geom.penD} y={y0} width={geom.penD + 1} height={m} />
              <rect x={S - geom.penD} y={y0 + geom.penH - m} width={geom.penD + 1} height={m} />
            </>
          )}
        </g>
      </mask>
      {grad && (
        <linearGradient id={gradId} x1={0} y1={0} x2={0} y2={S} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor={grad.top} />
          <stop offset={1} stopColor={grad.bottom} />
        </linearGradient>
      )}
      <rect
        width={S}
        height={S}
        rx={geom.rx}
        fill={grad ? `url(#${gradId})` : fill}
        mask={`url(#${id}mk)`}
      />
    </>
  );
}

/** Знак-поле: отдельный квадрат (favicon-масштаб, 2FA-страница).
 *  size — px; simple — упрощённая разметка ≤24px; mono — currentColor. */
export function LogoMark({
  size = 32,
  simple = false,
  mono = false,
  className,
}: {
  size?: number;
  simple?: boolean;
  mono?: boolean;
  className?: string;
}) {
  const id = useIds();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      <FieldBody
        geom={simple ? FIELD_SIMPLE : FIELD_FULL}
        id={id}
        fill={mono ? "currentColor" : gold}
      />
    </svg>
  );
}

/** ПАРАДНАЯ (вертикальная) композиция: «scores» белый над «b[поле]x»
 *  с градиентом. size — ШИРИНА блока в px (высота ~0.65×width, мин. 40px
 *  по высоте — бриф). variant: dark (по умолчанию) | light | mono;
 *  mono (легаси-параметр) = variant "mono". */
export function LogoVertical({
  size = 120,
  variant = "dark",
  mono = false,
  className,
}: {
  size?: number;
  variant?: "dark" | "light" | "mono";
  mono?: boolean;
  className?: string;
}) {
  const id = useIds();
  const isMono = mono || variant === "mono";
  const [x, y, w, h] = VERTICAL.vb;
  const scoresFill = isMono
    ? "currentColor"
    : variant === "light"
      ? ink
      : white;
  return (
    <svg
      viewBox={`${x} ${y} ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="SCORESBOX"
      focusable="false"
    >
      {!isMono && (
        <linearGradient id={`${id}bx`} x1={0} y1={VERTICAL.gradY[0]} x2={0} y2={VERTICAL.gradY[1]} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor={gold} />
          <stop offset={1} stopColor={goldDeep} />
        </linearGradient>
      )}
      <path d={VERTICAL.scores} fill={scoresFill} />
      <path d={VERTICAL.box} fill={isMono ? "currentColor" : `url(#${id}bx)`} />
      <g transform={`translate(${VERTICAL.field.x},${VERTICAL.field.y}) scale(${VERTICAL.field.size / 64})`}>
        <FieldBody
          geom={FIELD_FULL}
          id={id}
          fill="currentColor"
          grad={isMono ? undefined : { top: goldDeep, bottom: goldAccent }}
        />
      </g>
    </svg>
  );
}

/** ГОРИЗОНТАЛЬНАЯ версия (шапка/подвал): [знак-поле] + «scoresbox»
 *  ОДНОЙ строкой, плоские цвета. height — сторона знака в px (32px в
 *  шапке 56px, мин. 24px — бриф). variant: dark — scores #FFFFFF, box
 *  #FFD700 (публичный сайт); light — scores #0A0D13, box #b45309
 *  (админ-тема); auto — CSS-переменные темы (по умолчанию). */
export function LogoHorizontal({
  height = 32,
  variant = "auto",
  mono = false,
  className,
}: {
  height?: number;
  variant?: "dark" | "light" | "auto";
  mono?: boolean;
  className?: string;
}) {
  const id = useIds();
  const [x, y, w, h] = HORIZONTAL.vb;
  const auto = variant === "auto";
  const scFill = mono
    ? "currentColor"
    : variant === "dark"
      ? white
      : variant === "light"
        ? ink
        : "var(--ink, #eeeeee)";
  const goldFill = mono ? "currentColor" : variant === "light" ? goldOnLight : auto ? "var(--gold, #ffd700)" : gold;
  return (
    <svg
      viewBox={`${x} ${y} ${w} ${h}`}
      height={height}
      width={(height * w) / h}
      className={cn("shrink-0", mono && "text-current", className)}
      role="img"
      aria-label="SCORESBOX"
      focusable="false"
    >
      <FieldBody geom={FIELD_FULL} id={id} fill={goldFill} />
      <path d={HORIZONTAL.scores} fill={scFill} />
      <path d={HORIZONTAL.box} fill={goldFill} />
    </svg>
  );
}

/** Лок-ап шапки: горизонтальный лого + слоган 12px серым справа,
 *  ТОЛЬКО при ширине ≥1024px (граница/отступ как в v1.0.46).
 *  glyph/wordmarkClassName — параметры совместимости вызовов админки
 *  (размер знака теперь задаётся height). */
export function Logo({
  subtitle,
  subtitleClassName,
  className,
  glyph: _glyph,
  wordmarkClassName: _wm,
  height = 32,
  variant = "auto",
}: {
  glyph?: number;
  wordmarkClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
  className?: string;
  height?: number;
  variant?: "dark" | "light" | "auto";
}) {
  return (
    <span className={cn("flex min-w-0 shrink-0 items-center gap-2.5", className)}>
      <LogoHorizontal height={height} variant={variant} />
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

// ============================================================
// v1.0.48 · BRANDLOGO — лого сайта с приоритетом АДМИНКИ.
// Загружен кастомный логотип (Branding.logoDarkUrl / logoLightUrl из
// «Сайт → Брендинг») → <img> из Media (кэш сбрасывается сам: каждая
// загрузка = новый URL). Не загружен → ВСТРОЕННАЯ двухъярусная
// вертикаль LogoVertical («scores» сверху, «b[поле]x» снизу —
// SVG-пути, переносы невозможны). Светлый фон без отдельного лого
// использует тёмный вариант (решение панели «Брендинг»).
// height — высота блока в px (вертикаль от 40px по брифу v1.0.47).
// ============================================================

/** Пропорции вертикали — из геометрии путей, без магических чисел */
const VERTICAL_ASPECT = VERTICAL.vb[2] / VERTICAL.vb[3];

export function BrandLogo({
  branding,
  height = 48,
  variant = "dark",
  subtitle,
  subtitleClassName,
  className,
}: {
  branding?: BrandingDTO | null;
  height?: number;
  variant?: "dark" | "light";
  subtitle?: string;
  subtitleClassName?: string;
  className?: string;
}) {
  const url =
    variant === "light"
      ? (branding?.logoLightUrl ?? branding?.logoDarkUrl ?? null)
      : (branding?.logoDarkUrl ?? null);
  return (
    <span className={cn("flex min-w-0 shrink-0 items-center gap-2.5", className)}>
      {url ? (
        // КАСТОМНОЕ лого: фикс. высота, ширина по пропорции (запас для
        // широких лого — max-w, object-contain не искажает)
        <img
          src={url}
          alt="SCORESBOX"
          height={height}
          style={{ height }}
          className="w-auto max-w-[200px] object-contain sm:max-w-[260px]"
        />
      ) : (
        <LogoVertical size={Math.round(height * VERTICAL_ASPECT)} variant={variant} />
      )}
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
