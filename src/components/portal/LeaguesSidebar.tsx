"use client";

// Сайдбар лиг «Ночь под прожекторами» (v1.0.29: ЛЕВАЯ колонка — список лиг;
// турнирные таблицы уехали в правую колонку статистики): «Избранное» +
// «Топ-лиги» (закреплены админом, выше по приоритету) + «Все лиги»,
// сгруппированные по видам футбола из админки (FormatLink). Форматы,
// которых нет в списке видимых, собираются в группу «Другие форматы» —
// ни одна лига не пропадает из навигации.

import { useState } from "react";
import { ChevronDown, Star, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigate } from "./router";
import { useFavs, toggleFavLeague } from "./favs";
import type { LeagueDTO, OverviewDTO } from "./types";
import { FORMAT_LABELS, DEFAULT_FORMAT_LINKS } from "@/lib/labels";

interface Props {
  overview: OverviewDTO | null;
  version: number;
  activeLeagueId: string | null;
}

export default function LeaguesSidebar({ overview, version: _version, activeLeagueId }: Props) {
  const favs = useFavs();
  const onToggleFav = toggleFavLeague;
  const leagues = overview?.leagues ?? [];
  const pinned = leagues.filter((l) => l.isPinned).sort((a, b) => a.priority - b.priority);
  const favorite = leagues.filter((l) => favs.includes(l.id));
  const rest = leagues.filter((l) => !l.isPinned && !favs.includes(l.id));
  const [openFormats, setOpenFormats] = useState<Record<string, boolean>>({});

  if (!overview) {
    return <div className="rounded-lg border border-dashed border-sline p-4 text-sm text-ink3">Загрузка лиг...</div>;
  }

  // группировка «Все лиги» по видам футбола:
  // сначала видимые форматы из админки (в их порядке), затем
  // все прочие форматы (скрытые/незнакомые) — одной группой
  const knownFormats = (overview.formats?.length ? overview.formats : DEFAULT_FORMAT_LINKS);
  const restFormats = [...new Set(rest.map((l) => l.format))];
  const otherFormats = restFormats.filter((f) => !knownFormats.some((k) => k.code === f));
  const groupOf = (fmt: string) => knownFormats.find((k) => k.code === fmt) ?? null;

  const LeagueRow = ({ league, active, star }: { league: LeagueDTO; active: boolean; star?: boolean }) => (
    <div className={cn("flex min-h-[40px] items-center", active && "bg-gold/10")}>
      <button
        onClick={() => navigate(`/league/${league.id}`)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 px-3 text-left text-[13px] transition-colors",
          active ? "font-semibold text-gold" : "text-ink2 hover:bg-shover hover:text-ink"
        )}
      >
        <span className="min-w-0 flex-1 break-words">{league.shortName ?? league.name}</span>
      </button>
      {star && (
        <button
          onClick={() => onToggleFav(league.id)}
          className={cn("flex h-[40px] w-8 shrink-0 items-center justify-center", favs.includes(league.id) ? "text-gold" : "text-ink3 hover:text-ink2")}
          aria-label={favs.includes(league.id) ? "Убрать из избранного" : "В избранное"}
        >
          <Star className={cn("h-4 w-4", favs.includes(league.id) && "fill-gold")} />
        </button>
      )}
    </div>
  );

  const FormatGroup = ({ fmt, label }: { fmt: string; label: string }) => {
    const group = rest.filter((l) => l.format === fmt);
    if (group.length === 0) return null;
    const open = !!openFormats[fmt];
    return (
      <div className="border-b border-sline/40 last:border-b-0">
        {/* заголовок группы (Р-15): 11px UPPERCASE серый + счётчик справа */}
        <button
          onClick={() => setOpenFormats((s) => ({ ...s, [fmt]: !s[fmt] }))}
          className="flex min-h-[36px] w-full items-center gap-2 px-3 text-left text-[11px] font-bold uppercase tracking-[0.6px] text-ink2 hover:bg-shover"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform text-ink3", open && "rotate-180")} />
          <span className="min-w-0 flex-1 break-words">{label}</span>
          <span className="shrink-0 text-xs font-normal tabular text-ink3">{group.length}</span>
        </button>
        {open && group.map((l) => <LeagueRow key={l.id} league={l} active={activeLeagueId === l.id} star />)}
      </div>
    );
  };

  return (
    <nav className="space-y-3" aria-label="Лиги">
      {/* ---------- Избранное пользователя ---------- */}
      {favorite.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gold/40 bg-gold/[0.04]">
          <div className="flex items-center gap-1.5 border-b border-gold/20 px-3 py-2.5">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" />
            <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-gold">Избранное</p>
          </div>
          {favorite.map((l) => (
            <LeagueRow key={l.id} league={l} active={activeLeagueId === l.id} star />
          ))}
        </div>
      )}

      {/* ---------- Топ-лиги (закреплены админом, выше по приоритету) ---------- */}
      <div className="overflow-hidden rounded-lg border border-sline bg-s1">
        <div className="flex items-center gap-1.5 border-b border-sline/60 bg-s2/40 px-3 py-2.5">
          <Trophy className="h-3.5 w-3.5 text-gold" />
          <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-ink2">Топ-лиги</p>
        </div>
        {pinned.map((l) => (
          <LeagueRow key={l.id} league={l} active={activeLeagueId === l.id} star />
        ))}
        {pinned.length === 0 && <p className="px-3 py-3 text-xs text-ink3">Нет закреплённых лиг</p>}
      </div>

      {/* ---------- Все лиги (свёрнуты по видам футбола из админки) ---------- */}
      <div className="overflow-hidden rounded-lg border border-sline bg-s1">
        <div className="border-b border-sline/60 bg-s2/40 px-3 py-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-ink2">Все лиги</p>
        </div>
        {knownFormats.map((k) => (
          <FormatGroup key={k.code} fmt={k.code} label={k.label} />
        ))}
        {otherFormats.map((fmt) => (
          <FormatGroup key={fmt} fmt={fmt} label={FORMAT_LABELS[fmt] ?? `Формат ${fmt}`} />
        ))}
        {rest.length === 0 && <p className="px-3 py-2 text-xs text-ink3">Все лиги — в топе и избранном</p>}
      </div>
    </nav>
  );
}
