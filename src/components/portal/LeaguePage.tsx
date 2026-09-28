"use client";

// Страница лиги «Ночь под прожекторами»: геро с форматом и регламентом,
// вкладки Матчи / Таблица / Бомбардиры / Дисциплины / Команды / Судьи.

import { useState } from "react";
import { cn } from "@/lib/utils";
import { navigate } from "./router";
import type { OverviewDTO } from "./types";
import { FORMAT_LABELS } from "@/lib/labels";
import { EmptyState, LoadingBlock } from "./ui-bits";
import { Breadcrumbs, FormatChip } from "./visuals";
import CalendarView from "./CalendarView";
import StandingsView from "./StandingsView";
import ScorersView from "./ScorersView";
import DisciplineView from "./DisciplineView";
import TeamsView from "./TeamsView";
import RefereesView from "./RefereesView";

const TABS = [
  { id: "matches", label: "Матчи" },
  { id: "table", label: "Таблица" },
  { id: "scorers", label: "Бомбардиры" },
  { id: "discipline", label: "Дисциплины" },
  { id: "teams", label: "Команды" },
  { id: "referees", label: "Судьи" },
] as const;

interface Props {
  leagueId: string;
  tab: string;
  overview: OverviewDTO | null;
  version: number;
}

export default function LeaguePage({ leagueId, tab, overview, version }: Props) {
  const league = overview?.leagues.find((l) => l.id === leagueId) ?? null;
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>("");
  // сезон: выбранный пользователем (если ещё принадлежит лиге) или текущий
  const currentSeason = league?.seasons.find((s) => s.isCurrent) ?? league?.seasons[0] ?? null;
  const seasonId =
    league && selectedSeasonId && league.seasons.some((s) => s.id === selectedSeasonId)
      ? selectedSeasonId
      : currentSeason?.id ?? "";

  if (!overview) return <LoadingBlock />;
  if (!league) return <EmptyState title="Лига не найдена" hint="Возможно, она была удалена" />;

  const activeTab = TABS.some((t) => t.id === tab) ? tab : "matches";

  return (
    <div className="space-y-3">
      <Breadcrumbs items={[{ label: "Главная", onClick: () => navigate("/") }, { label: league.name }]} className="px-1" />

      {/* ---------- Гери лиги ---------- */}
      <div className="overflow-hidden rounded-2xl border border-sline bg-s1">
        <div className="stadium-glow flex flex-wrap items-center gap-3 px-4 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FormatChip format={league.format} />
              <h1 className="truncate text-xl font-black tracking-tight text-ink">{league.name}</h1>
            </div>
            <p className="mt-1 hidden text-xs text-ink3 sm:block">
              {league.yellowCardLimit} ЖК → пропуск · КК → {league.redCardBanMatches} матч · техпоражение {league.walkoverScore}:0
              {league.transferWindowEnd && " · трансферное окно до " + new Date(league.transferWindowEnd).toLocaleDateString("ru-RU")}
            </p>
          </div>
          {league.seasons.length > 1 && (
            <select
              value={seasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
              className="rounded-lg border border-sline bg-s1 px-2.5 py-2 text-xs font-medium text-ink2 focus:border-gold focus:outline-none"
              aria-label="Сезон"
            >
              {league.seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? " (текущий)" : ""}</option>
              ))}
            </select>
          )}
        </div>

        {/* ---------- Вкладки ---------- */}
        <div className="flex gap-1 overflow-x-auto border-t border-sline/60 px-2 scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(`/league/${leagueId}/${t.id}`)}
              className={cn(
                "relative shrink-0 px-4 py-2.5 text-sm font-semibold transition-colors",
                activeTab === t.id ? "text-gold" : "text-ink2 hover:text-ink"
              )}
            >
              {t.label}
              {activeTab === t.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gold" />}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Контент вкладки ---------- */}
      {activeTab === "matches" && <CalendarView seasonId={seasonId} version={version} onOpenMatch={(id) => navigate(`/match/${id}`)} />}
      {activeTab === "table" && <StandingsView seasonId={seasonId} version={version} />}
      {activeTab === "scorers" && <ScorersView seasonId={seasonId} version={version} onOpenPlayer={(id) => navigate(`/player/${id}`)} />}
      {activeTab === "discipline" && <DisciplineView seasonId={seasonId} version={version} onOpenPlayer={(id) => navigate(`/player/${id}`)} />}
      {activeTab === "teams" && <TeamsView seasonId={seasonId} version={version} />}
      {activeTab === "referees" && <RefereesView seasonId={seasonId} version={version} />}
    </div>
  );
}
