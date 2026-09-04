"use client";

// Профиль стадиона «Ночь под прожекторами»: характеристики, статистика,
// календарь сыгранных и предстоящих матчей.

import { useState } from "react";
import { MapPin, Users, Goal, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "./hooks";
import { navigate } from "./router";
import type { MatchDTO } from "./types";
import { LoadingBlock, EmptyState, matchScore } from "./ui-bits";
import { Breadcrumbs, StatTile } from "./visuals";

interface StadiumDetail {
  stadium: { id: string; name: string; city: string | null; address: string | null; capacity: number | null };
  stats: { hosted: number; goals: number; avgGoals: number };
  matches: (MatchDTO & { league: { id: string; name: string; format: string } })[];
}

export default function StadiumPage({ stadiumId, initial }: { stadiumId: string; initial?: StadiumDetail | null }) {
  const { data, error } = useFetch<StadiumDetail>(`/api/public/stadiums/${stadiumId}`, 0, initial);
  const [matchFilter, setMatchFilter] = useState<"all" | "played" | "upcoming">("all");

  if (error) return <EmptyState title="Стадион не найден" hint={error} />;
  if (!data || !data.stadium) return <LoadingBlock label="Загрузка стадиона..." />;

  const { stadium, stats, matches } = data;
  const matchesFiltered = matches.filter((m) => {
    if (matchFilter === "played") return m.status === "COMPLETED" || m.status === "WALKOVER";
    if (matchFilter === "upcoming") return m.status === "SCHEDULED" || m.status === "POSTPONED" || m.status === "LIVE";
    return true;
  });

  return (
    <div className="space-y-3">
      <Breadcrumbs items={[{ label: "Главная", onClick: () => navigate("/") }, { label: stadium.name }]} className="px-1" />

      {/* ---------- Гери стадиона ---------- */}
      <div className="overflow-hidden rounded-2xl border border-sline bg-s1">
        <div className="stadium-glow flex flex-wrap items-center gap-4 px-4 py-5 sm:px-6">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold/15">
            <MapPin className="h-7 w-7 text-gold" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black tracking-tight text-ink">{stadium.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink3">
              {stadium.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{stadium.city}{stadium.address ? `, ${stadium.address}` : ""}</span>}
              {stadium.capacity && <span className="flex items-center gap-1"><Users className="h-3 w-3" />вместимость {stadium.capacity.toLocaleString("ru-RU")}</span>}
            </p>
          </div>
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-3 gap-2 border-t border-sline/60 px-4 py-3">
          <StatTile value={stats.hosted} label="матчей" />
          <StatTile value={stats.goals} label="голов" accent />
          <StatTile value={stats.avgGoals} label="гол/матч" />
        </div>
      </div>

      {/* ---------- Матчи ---------- */}
      <div className="overflow-hidden rounded-xl border border-sline bg-s1">
        <div className="flex items-center justify-between border-b border-sline/60 bg-s2/50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><BarChart3 className="h-4 w-4 text-gold" /> Матчи на стадионе</p>
          <div className="flex gap-1">
            {([["all", "Все"], ["played", "Сыгранные"], ["upcoming", "Предстоящие"]] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setMatchFilter(id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                  matchFilter === id ? "bg-gold text-goldink" : "bg-s2 text-ink2 hover:text-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[480px] space-y-1 overflow-y-auto p-3 scrollbar-s21">
          {matchesFiltered.length === 0 && <p className="py-6 text-center text-xs text-ink3">Нет матчей</p>}
          {matchesFiltered.map((m) => {
            const score = matchScore(m);
            const time = new Date(m.kickoff);
            return (
              <button
                key={m.id}
                onClick={() => navigate(`/match/${m.id}`)}
                className="flex w-full items-center gap-3 rounded-xl border border-sline/50 bg-s2/30 px-3 py-2.5 text-left text-sm hover:border-gold/40"
              >
                <span className="w-16 shrink-0 text-xs text-ink3">
                  {time.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", timeZone: "Europe/Moscow" })}
                </span>
                <Goal className="h-3.5 w-3.5 shrink-0 text-ink3" />
                <span className="min-w-0 flex-1 truncate text-ink2">
                  {m.homeTeam.name} <span className="text-ink3">—</span> {m.awayTeam.name}
                </span>
                <span className="hidden truncate text-xs text-ink3 md:inline">{m.league.name}</span>
                <span className={cn("shrink-0 font-mono text-sm font-bold", m.status === "WALKOVER" ? "text-amber-400" : "text-ink")}>
                  {score ? `${score.home}:${score.away}` : time.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
