"use client";

// Визуальные примитивы SCORESBOX: гербы команд и аватары персон генерируются
// детерминированно из id (без картинок) — стабильная узнаваемость в светлом и тёмном.

import { cn } from "@/lib/utils";
import { ChevronRight, User } from "lucide-react";
import { FORMAT_LABELS } from "@/lib/labels";

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

/** Герб команды: квадрат с инициалами, градиент по hue из id */
export function Crest({ name, id, size = "md", className }: { name: string; id: string; size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }) {
  const h = hashHue(id);
  const dims = { xs: "h-6 w-6 text-xs rounded-md", sm: "h-8 w-8 text-xs rounded-lg", md: "h-10 w-10 text-xs rounded-xl", lg: "h-14 w-14 text-base rounded-xl", xl: "h-16 w-16 text-lg rounded-2xl" }[size];
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

/** Аватар персоны: круг с инициалами */
export function Avatar({ name, id, size = "md", className }: { name: string; id: string; size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }) {
  const h = hashHue(id);
  const dims = { xs: "h-6 w-6 text-xs", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-xs", lg: "h-12 w-12 text-sm", xl: "h-14 w-14 text-base" }[size];
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

/** Чип формата (Футбол=11×11, 8×8, 6×6, мини-футбол) с цветовой кодировкой */
export function FormatChip({ format, className }: { format: string; className?: string }) {
  const color = FORMAT_COLORS[format] ?? "#98a2b3";
  const title =
    format === "F11"
      ? "Большой футбол · 11 игроков × 11 игроков"
      : format === "FUTSAL"
        ? "Мини-футбол (футзал) · 5×5 в зале"
        : `Формат ${FORMAT_LABELS[format] ?? format}`;
  return (
    <span
      title={title}
      className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs font-bold", className)}
      style={{ color, backgroundColor: `${color}1f` }}
    >
      {FORMAT_LABELS[format] ?? format}
    </span>
  );
}

/** Хлебные крошки: Главная / Лига / Матч. Последний элемент — не ссылка. */
export function Breadcrumbs({ items, className }: { items: { label: string; onClick?: () => void }[]; className?: string }) {
  return (
    <nav aria-label="Навигация" className={cn("flex flex-wrap items-center gap-1 text-xs text-ink3", className)}>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 opacity-60" />}
          {it.onClick ? (
            <button onClick={it.onClick} className="hover:text-gold">
              {it.label}
            </button>
          ) : (
            <span className="max-w-[180px] truncate text-ink2">{it.label}</span>
          )}
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

/** Плитка-показатель для профилей: значение + подпись */
export function StatTile({ value, label, accent, title }: { value: React.ReactNode; label: string; accent?: boolean; title?: string }) {
  return (
    <div title={title} className="rounded-xl bg-s2 px-3 py-2.5 text-center">
      <p className={cn("font-mono text-xl font-bold tabular", accent ? "text-gold" : "text-ink")}>{value}</p>
      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ink3">{label}</p>
    </div>
  );
}

/** Заголовок карточки-секции */
export function SectionHeader({ icon, title, hint, right }: { icon?: React.ReactNode; title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-sline px-4 py-3">
      {icon}
      <p className="text-sm font-bold text-ink">{title}</p>
      {hint && <span className="truncate text-xs text-ink3">{hint}</span>}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

/** Иконка-заглушка персон */
export function PersonIcon({ className }: { className?: string }) {
  return <User className={className} />;
}
