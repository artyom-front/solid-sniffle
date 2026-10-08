// ============================================================
// Брендинг (v1.0.48): чистые функции валидации загрузок лого и
// фавикона + санитайз SVG. Без серверных импортов — тестируется
// юнит-тестами (tests/unit/branding.test.ts) и используется
// API-роутом /api/admin/brand.
//
// ПОЛИТИКА ФАЙЛОВ БРЕНДИНГА:
//   • логотипы — PNG/JPG/WebP/AVIF/SVG до 2 МБ;
//   • фавикон — то же + ICO (image/x-icon) до 1 МБ;
//   • файлы хранятся КАК ЕСТЬ (без конвертации в WebP как в
//     /api/admin/media): фавикон WebP не читает Safari, а лого
//     в SVG обязан остаться вектором. Каждый аплоад = НОВЫЙ Media
//     id = новый URL → immutable-кэш медиа не мешает обновлению;
//   • SVG прогоняется через sanitizeSvg (см. ниже) и ДОПолнительно
//     раздаётся с CSP-sandbox (src/app/api/media/[id]).
// ============================================================

import type { BrandingDTO } from "@/components/portal/types";

export type { BrandingDTO };

/** Виды загружаемых ассетов брендинга (поля POST /api/admin/brand) */
export const BRAND_KINDS = ["logoDark", "logoLight", "icon"] as const;
export type BrandKind = (typeof BRAND_KINDS)[number];

const MB = 1024 * 1024;

const LOGO_MIMES = ["image/png", "image/jpeg", "image/webp", "image/avif", "image/svg+xml"];
const ICON_MIMES = [...LOGO_MIMES, "image/x-icon", "image/vnd.microsoft.icon"];

/** Лимиты на файл по виду ассета */
export const BRAND_LIMITS: Record<BrandKind, { mimes: string[]; maxBytes: number }> = {
  logoDark: { mimes: LOGO_MIMES, maxBytes: 2 * MB },
  logoLight: { mimes: LOGO_MIMES, maxBytes: 2 * MB },
  icon: { mimes: ICON_MIMES, maxBytes: 1 * MB },
};

/** Человекочитаемые названия для ошибок/UI */
export const BRAND_KIND_LABELS: Record<BrandKind, string> = {
  logoDark: "Логотип (тёмный фон)",
  logoLight: "Логотип (светлый фон)",
  icon: "Иконка браузера",
};

/** Валидация файла брендинга: null = всё хорошо, строка = текст ошибки. */
export function validateBrandFile(kind: BrandKind, mime: string, size: number): string | null {
  const limit = BRAND_LIMITS[kind];
  if (!limit.mimes.includes(mime)) {
    const pretty = limit.mimes
      .map((m) => m.replace("image/", "").replace("svg+xml", "svg").replace("x-icon", "ico").replace("vnd.microsoft.icon", "ico").toUpperCase())
      .join(", ");
    return `тип ${mime || "неизвестен"} не поддерживается — разрешены ${pretty}`;
  }
  if (size <= 0) return "файл пустой";
  if (size > limit.maxBytes) return `файл больше ${Math.round(limit.maxBytes / MB)} МБ`;
  return null;
}

// ------------------------------------------------------------
// Санитайз SVG. Рискованный вектор: SVG — это документ, при
// ПРЯМОМ открытии ссылки /api/media/<id> скрипты внутри выполнились
// бы в origin сайта (stored-XSS). В <img>/<link rel=icon> скрипты
// не исполняются, но опираться только на это нельзя. Три эшелона:
//   1) sanitizeSvg здесь — отклонить script/обработчики событий/
//      javascript:/foreignObject/ENTITY/внешние href;
//   2) CSP-sandbox на раздаче (src/app/api/media/[id]);
//   3) фавикон/лого рендерятся только через <img>/<link>.
// ------------------------------------------------------------

const SVG_DENY: { re: RegExp; why: string }[] = [
  { re: /<script[\s>]/i, why: "тег <script>" },
  { re: /<foreignobject[\s>]/i, why: "тег <foreignObject> (встраивает HTML)" },
  { re: /\bon[a-z]+\s*=/i, why: "обработчик событий (on…=)" },
  { re: /javascript\s*:/i, why: "протокол javascript:" },
  { re: /<!entity/i, why: "ENTITY-декларация (XXE)" },
  { re: /<\s*(!\[CDATA|!--)/i, why: "CDATA/комментарии (обфускация)" },
];

const HREF_RE = /(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi;

/** Разрешённые цели ссылок внутри SVG: внутренние фрагменты (#…) и
 *  инлайн-растры data:image/* (экспорт из редакторов). Сеть запрещена. */
function hrefAllowed(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (u.startsWith("#")) return true;
  if (u.startsWith("data:image/")) return true;
  return false;
}

/** Проверка SVG-текста: { ok: true } или { ok: false, error } */
export function sanitizeSvg(text: string): { ok: boolean; error?: string } {
  for (const { re, why } of SVG_DENY) {
    if (re.test(text)) return { ok: false, error: `SVG отклонён: ${why}` };
  }
  HREF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HREF_RE.exec(text)) !== null) {
    if (!hrefAllowed(m[1])) {
      return { ok: false, error: `SVG отклонён: внешняя ссылка «${m[1].slice(0, 60)}» — разрешены только #фрагменты и data:image` };
    }
  }
  return { ok: true };
}

/** Дефолтные значения брендинга = встроенные лого v1.0.47 */
export const DEFAULT_BRANDING: BrandingDTO = {
  logoDarkUrl: null,
  logoLightUrl: null,
  iconUrl: null,
};

/** Дефолтные иконки браузера (файлы из public/brand/logo47/):
 *  mark-simple — упрощённый знак ≤24px (без штрафных, штрих толще),
 *  apple-icon 240 — полная разметка. На них сайт откатывается, пока
 *  админ не загрузил свои (root layout → generateMetadata.icons). */
export const DEFAULT_ICON_URL = "/brand/logo47/mark-simple.svg";
export const DEFAULT_APPLE_ICON_URL = "/brand/logo47/apple-icon.png";
