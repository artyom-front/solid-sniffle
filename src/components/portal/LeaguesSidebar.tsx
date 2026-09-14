"use client";

// Левый сайдбар «Ночь под прожекторами»: «Избранное» + «Топ-лиги» (закреплены
// админом, раскрыты с мини-таблицей топ-5) + «Все лиги» по видам футбола.

import { useState } from "react";
import { ChevronDown, Star, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "./hooks";
import { navigate } from "./router";
import { useFavs, toggleFavLeague } from "./favs";
import type { LeagueDTO, OverviewDTO, StandingRowDTO } from "./types";
import { FORMAT_LABELS } from "@/lib/labels";

interface Props {
  overview: OverviewDTO | null;
  version: number;
  activeLeagueId: string | null;
}

export default function LeaguesSidebar({ overview, version, activeLeagueId }: Props) {
  const favs = useFavs();
  const onToggleFav = toggleFavLeague;
  const leagues = overview?.leagues ?? [];
  const pinned = leagues.filter((l) => l.isPinned).sort((a, b) => a.priority - b.priority);
  const favorite = leagues.filter((l) => favs.includes(l.id));
  const rest = leagues.filter((l) => !l.isPinned && !favs.includes(l.id));
  const [openLeagueId, setOpenLeagueId] = useState<string | null>(pinned[0]?.id ?? null);
  const [openFormats, setOpenFormats] = useState<Record<string, boolean>>({});

  if (!overview) {
    return <div className="rounded-xl border border-dashed border-sline p-4 text-sm text-ink3">Загрузка лиг...</div>;
  }

  const LeagueRow = ({ league, active, withChevron, expanded, onToggle, star }: { league: LeagueDTO; active: boolean; withChevron?: boolean; expanded?: boolean; onToggle?: () => void; star?: boolean }) => (
    <div>
      <div className={cn("flex items-center", active && "bg-gold/10")}>
        <button
          onClick={() => navigate(`/league/${league.id}`)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
            active ? "font-semibold text-gold" : "text-ink2 hover:bg-s2/60 hover:text-ink"
          )}
        >
          <span className="min-w-0 flex-1 truncate">{league.shortName ?? league.name}</span>
        </button>
        {star && (
          <button
            onClick={() => onToggleFav(league.id)}
            className={cn("shrink-0 px-1.5 py-2", favs.includes(league.id) ? "text-gold" : "text-ink3 hover:text-ink2")}
            aria-label={favs.includes(league.id) ? "Убрать из избранного" : "В избранное"}
          >
            <Star className={cn("h-3.5 w-3.5", favs.includes(league.id) && "fill-gold")} />
          </button>
        )}
        {withChevron && onToggle && (
          <button
            onClick={onToggle}
            className="shrink-0 px-2 py-2 text-ink3 hover:text-ink2"
            aria-label={expanded ? "Свернуть таблицу" : "Показать таблицу"}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      {withChevron && expanded && <MiniStandings league={league} version={version} />}
    </div>
  );

  return (
    <nav className="space-y-3" aria-label="Лиги">
      {/* ---------- Избранное пользователя ---------- */}
      {favorite.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gold/40 bg-gold/[0.04]">
          <div className="flex items-center gap-1.5 border-b border-gold/20 px-3 py-2.5">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" />
            <p className="text-xs font-bold uppercase tracking-wide text-gold">Избранное</p>
          </div>
          {favorite.map((l) => (
            <LeagueRow key={l.id} league={l} active={activeLeagueId === l.id} star />
          ))}
        </div>
      )}

      {/* ---------- Топ-лиги (закреплены админом) ---------- */}
      <div className="overflow-hidden rounded-xl border border-sline bg-s1">
        <div className="flex items-center gap-1.5 border-b border-sline/60 bg-s2/50 px-3 py-2.5">
          <Trophy className="h-3.5 w-3.5 text-gold" />
          <p className="text-xs font-bold uppercase tracking-wide text-ink2">Топ-лиги</p>
        </div>
        {pinned.map((l) => (
          <LeagueRow
            key={l.id}
            league={l}
            active={activeLeagueId === l.id}
            withChevron
            star
            expanded={openLeagueId === l.id}
            onToggle={() => setOpenLeagueId(openLeagueId === l.id ? null : l.id)}
          />
        ))}
        {pinned.length === 0 && <p className="px-3 py-3 text-xs text-ink3">Нет закреплённых лиг</p>}
      </div>

      {/* ---------- Все лиги (свёрнуты по видам) ---------- */}
      <div className="overflow-hidden rounded-xl border border-sline bg-s1">
        <div className="border-b border-sline/60 bg-s2/50 px-3 py-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-ink2">Все лиги</p>
        </div>
        {Object.entries(FORMAT_LABELS).map(([fmt, label]) => {
          const group = rest.filter((l) => l.format === fmt);
          if (group.length === 0) return null;
          const open = !!openFormats[fmt];
          return (
            <div key={fmt} className="border-b border-sline/40 last:border-b-0">
              <button
                onClick={() => setOpenFormats((s) => ({ ...s, [fmt]: !s[fmt] }))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink2 hover:bg-s2/60"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform text-ink3", open && "rotate-180")} />
                {label}
                <span className="ml-auto text-xs font-normal text-ink3">{group.length}</span>
              </button>
              {open && group.map((l) => <LeagueRow key={l.id} league={l} active={activeLeagueId === l.id} star />)}
            </div>
          );
        })}
        {rest.length === 0 && <p className="px-3 py-2 text-xs text-ink3">Все лиги — в топе и избранном</p>}
      </div>
    </nav>
  );
}

/** Мини-таблица топ-5 текущего сезона лиги */
function MiniStandings({ league, version }: { league: LeagueDTO; version: number }) {
  const season = league.seasons.find((s) => s.isCurrent) ?? league.seasons[0];
  const { data } = useFetch<{ standings: StandingRowDTO[] }>(
    season ? `/api/public/standings?seasonId=${season.id}` : null,
    version
  );
  const rows = (data?.standings ?? []).slice(0, 5);
  if (!season) return null;

  return (
    <div className="bg-s2/40 pb-1">
      {rows.map((r) => (
        <button
          key={r.teamId}
          onClick={() => navigate(`/team/${r.teamId}`)}
          className="flex w-full items-center gap-2 px-3 py-1.5 pl-7 text-xs text-ink2 hover:bg-s2/80 hover:text-ink"
        >
          <span className="w-4 text-center font-mono text-xs text-ink3">{r.position}</span>
          <span className="min-w-0 flex-1 truncate text-left font-medium">{r.teamName}</span>
          <span className="text-xs text-ink3">{r.games}</span>
          <span className="w-6 text-right font-mono font-bold text-ink">{r.points}</span>
        </button>
      ))}
      <button
        onClick={() => navigate(`/league/${league.id}/table`)}
        className="w-full px-3 py-1.5 text-right text-xs font-semibold text-gold hover:text-gold/80"
      >
        Полная таблица →
      </button>
    </div>
  );
}
