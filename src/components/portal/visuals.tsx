"use client";

// Визуальные примитивы SCORESBOX: гербы команд и аватары персон генерируются
// детерминированно из id (без картинок) — стабильная узнаваемость в светлом и тёмном.

import { cn } from "@/lib/utils";
import { ChevronRight, User } from "lucide-react";
import { FORMAT_LABELS } from "@/lib/labels";
import type { BannerDTO } from "./types";

/** Детерминированный hue из строки (id) */
export function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** Инициалы: первые буквы до 2 слов */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Герб команды: загруженная эмблема (logoUrl из медиатеки) или квадрат с инициалами */
export function Crest({ name, id, size = "md", logoUrl, className }: { name: string; id: string; size?: "xxs" | "xs" | "sm" | "md" | "lg" | "xl"; logoUrl?: string | null; className?: string }) {
  const dims = { xxs: "h-5 w-5 text-[10px] rounded", xs: "h-6 w-6 text-xs rounded-md", sm: "h-8 w-8 text-xs rounded-lg", md: "h-10 w-10 text-xs rounded-xl", lg: "h-14 w-14 text-base rounded-xl", xl: "h-16 w-16 text-lg rounded-2xl" }[size];
  if (logoUrl) {
    return (
       
      <img src={logoUrl} alt={`${name} — эмблема`} className={cn("shrink-0 border border-sline bg-s1 object-cover", dims, className)} />
    );
  }
  const h = hashHue(id);
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 select-none items-center justify-center font-bold tracking-tight text-white", dims, className)}
      style={{ background: `linear-gradient(135deg, hsl(${h} 48% 34%), hsl(${(h + 40) % 360} 55% 22%))`, boxShadow: "inset 0 -2px 6px rgba(0,0,0,0.25)" }}
    >
      {initials(name)}
    </span>
  );
}

/** Аватар персоны: загруженное фото (photoUrl) или круг с инициалами */
export function Avatar({ name, id, size = "md", photoUrl, className }: { name: string; id: string; size?: "xs" | "sm" | "md" | "lg" | "xl"; photoUrl?: string | null; className?: string }) {
  const dims = { xs: "h-6 w-6 text-xs", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-xs", lg: "h-12 w-12 text-sm", xl: "h-14 w-14 text-base" }[size];
  if (photoUrl) {
    return (
       
      <img src={photoUrl} alt={`${name} — фото`} className={cn("shrink-0 border border-sline bg-s1 object-cover rounded-full", dims, className)} />
    );
  }
  const h = hashHue(id);
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white", dims, className)}
      style={{ background: `hsl(${h} 32% 42%)` }}
    >
      {initials(name)}
    </span>
  );
}

/** Цветовая кодировка видов футбола */
export const FORMAT_COLORS: Record<string, string> = {
  F11: "#34d399",
  F8: "#2dd4bf",
  F6: "#fb923c",
  FUTSAL: "#c4b5fd",
};

/** Чип формата (Футбол=11×11, 8×8, 6×6, мини-футбол) с цветовой
 *  кодировкой. Бейдж вида спорта: 11px/600, радиус 6px (FS-метрики). */
export function FormatChip({ format, className }: { format: string; className?: string }) {
  const color = FORMAT_COLORS[format] ?? "#8899aa";
  const title =
    format === "F11"
      ? "Большой футбол · 11 игроков × 11 игроков"
      : format === "FUTSAL"
        ? "Мини-футбол (футзал) · 5×5 в зале"
        : `Формат ${FORMAT_LABELS[format] ?? format}`;
  return (
    <span
      title={title}
      className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", className)}
      style={{ color, backgroundColor: `${color}1f` }}
    >
      {FORMAT_LABELS[format] ?? format}
    </span>
  );
}

/** Хлебные крошки: Главная › Лига › Матч — 12px/400 серый, разделитель
 *  «›» рендерится ВНУТРИ элемента ПОСЛЕ него (Р-08): при переносе
 *  строки разделитель остаётся в конце предыдущей строки, а не висит
 *  в начале следующей. flex-wrap + row-gap 4px. Последний элемент —
 *  не ссылка и НЕ усекается (break-words). */
export function Breadcrumbs({ items, className }: { items: { label: string; onClick?: () => void }[]; className?: string }) {
  return (
    <nav aria-label="Навигация" className={cn("flex flex-wrap items-center gap-x-1.5 row-gap-1 text-xs font-normal text-ink3", className)}>
      {items.map((it, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {it.onClick ? (
            <button onClick={it.onClick} className="min-w-0 hover:text-gold">
              {it.label}
            </button>
          ) : (
            <span className="min-w-0 break-words text-ink2">{it.label}</span>
          )}
          {/* разделитель живёт после ПРЕДЫДУЩЕГО элемента — перенос
              строки оставляет его в конце строки (Р-08) */}
          {i < items.length - 1 && <span className="shrink-0 opacity-60" aria-hidden>›</span>}
        </span>
      ))}
    </nav>
  );
}

/** Кнопка «Назад» */
export function BackButton({ onClick, label = "Назад" }: { onClick?: () => void; label?: string }) {
  return (
    <button
      onClick={() => (onClick ? onClick() : history.back())}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-s2 text-ink2 transition-colors hover:bg-gold hover:text-goldink"
      aria-label={label}
    >
      <ChevronRight className="h-4 w-4 rotate-180" />
    </button>
  );
}

/** Плитка-показатель для профилей (FS-метрики, Р-24): цифра 18px/700,
 *  подпись 10px UPPERCASE серый — перенос ТОЛЬКО по словам (без
 *  разрыва «АССИС/ТЫ»), карточки — auto-fit minmax(96px, 1fr),
 *  переносятся на следующий ряд, а не скроллятся. */
export function StatTile({ value, label, accent, title }: { value: React.ReactNode; label: string; accent?: boolean; title?: string }) {
  return (
    <div title={title} className="min-w-0 rounded-md bg-s2 px-2 py-2 text-center">
      <p className={cn("tabular text-lg font-bold leading-tight", accent ? "text-gold" : "text-ink")}>{value}</p>
      <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.6px] text-ink3">{label}</p>
    </div>
  );
}

/** Заголовок карточки-секции: 13px/700 (FS-метрики) */
export function SectionHeader({ icon, title, hint, right }: { icon?: React.ReactNode; title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-sline px-3 py-2.5">
      {icon}
      <p className="text-[13px] font-bold text-ink">{title}</p>
      {hint && <span className="break-words text-[11px] text-ink3">{hint}</span>}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

/** Иконка-заглушка персон */
export function PersonIcon({ className }: { className?: string }) {
  return <User className={className} />;
}

/** Маркировка рекламы «Реклама» — обязательна по закону, но деликатна:
 *  маленький кегль, полупрозрачная пилюля, не перетягивает внимание
 *  (стиль adfox на крупных площадках). Размер шрифта и прозрачность
 *  настраиваются в баннере (markSize px / markOpacity %). */
export function AdMark({ size = 9, opacity = 70, className }: {
  size?: number | null;
  opacity?: number | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none select-none whitespace-nowrap rounded-full bg-white/85 px-1.5 py-0.5 font-semibold uppercase leading-none tracking-[0.14em] text-zinc-500 backdrop-blur-sm",
        className
      )}
      style={{ fontSize: `${size ?? 9}px`, opacity: (opacity ?? 70) / 100 }}
    >
      Реклама
    </span>
  );
}

/** Рекламный слот единого стандарта (Р-10 + Р-29):
 *  • контейнер: bg #141922 (s1), radius 8px, border 1px #2A3040,
 *    overflow: hidden;
 *  • ВНЕШНИЙ креатив (imageUrl) — фиксированная высота по слоту
 *    (fixedHeight) — нулевой сдвиг макета (анти-CLS);
 *  • собственный промо (текст) — высота auto (min-height 64px),
 *    padding 12px 16px, заголовок 13px/700, текст 12px серый без
 *    ограничения строк — текст не режется НИКОГДА;
 *  • compact (v1.0.41, ряд из 3 над матчем): промо-текст
 *    умещается в 2 строки (line-clamp), полный текст — в тултипе
 *    ссылки (title); в узкой ячейке ряда 6-строчный промо —
 *    это развал вёрстки. На полнош-ширинных слотах режим НЕ включается.
 *  • метка «РЕКЛАМА» — угловой бейдж 10px, рисуется СИСТЕМОЙ СЛОТА
 *    (не настройками баннера), полупрозрачная подложка;
 *  • нет креатива — слот скрыт полностью (вызов не рендерит его).
 *  Серые прогресс-полосы и заглушки внутри слота запрещены. */
export function AdSlot({ banner, fixedHeight, compact, className }: { banner: BannerDTO | null | undefined; fixedHeight?: number; compact?: boolean; className?: string }) {
  if (!banner) return null;
  if (banner.imageUrl) {
    return (
      <a
        href={banner.linkUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={cn("relative block w-full overflow-hidden rounded-lg border border-sline bg-s1", className)}
        style={fixedHeight ? { height: `${fixedHeight}px` } : undefined}
        aria-label={`Реклама: ${banner.title}`}
      >
        <img
          src={banner.imageUrl}
          alt={banner.title}
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit: banner.imageFit === "contain" ? "contain" : "cover",
            objectPosition: banner.imagePos ?? "center",
          }}
        />
        <span className="absolute right-2 top-2 z-10">
          <AdMark size={10} />
        </span>
      </a>
    );
  }
  return (
    <a
      href={banner.linkUrl ?? "#"}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={compact ? [banner.title, banner.text].filter(Boolean).join(" — ") : undefined}
      className={cn(
        "relative flex min-h-[64px] w-full flex-col justify-center gap-1 rounded-lg border border-sline bg-s1 px-4 py-3 pr-16",
        compact && "min-h-[90px] px-3 py-2 pr-12",
        className
      )}
      aria-label={`Реклама: ${banner.title}`}
    >
      <p className={cn("text-[13px] font-bold text-ink", compact && "line-clamp-1")}>{banner.title}</p>
      {banner.text && <p className={cn("text-xs text-ink2", compact && "line-clamp-2")}>{banner.text}</p>}
      <span className="absolute right-2 top-2 z-10">
        <AdMark size={10} />
      </span>
    </a>
  );
}
