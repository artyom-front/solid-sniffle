"use client";

// Календарь матчей «Ночь под прожекторами»: туры, статусы, стадион и судья.

import { useState } from "react";
import { MapPin, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch, fmtDate } from "./hooks";
import type { MatchDTO } from "./types";
import { LoadingBlock, ErrorBlock, ScoreBox, StatusBadge, matchScore, EmptyState } from "./ui-bits";

export default function CalendarView({ seasonId, version, onOpenMatch }: { seasonId: string; version: number; onOpenMatch: (id: string) => void }) {
  const { data, loading, error } = useFetch<{ matches: MatchDTO[] }>(seasonId ? `/api/public/matches?seasonId=${seasonId}` : null, version);
  const [filter, setFilter] = useState<"all" | "past" | "upcoming">("all");

  if (!seasonId) return <EmptyState title="Сезон не выбран" />;
  if (loading && !data) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) return null;

  const matches = data.matches.filter((m) => {
    if (filter === "past") return m.status !== "SCHEDULED";
    if (filter === "upcoming") return m.status === "SCHEDULED";
    return true;
  });

  const rounds = new Map<number, MatchDTO[]>();
  for (const m of matches) {
    const r = m.round ?? 0;
    if (!rounds.has(r)) rounds.set(r, []);
    rounds.get(r)!.push(m);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">Календарь матчей</p>
          <p className="text-xs text-ink3">{data.matches.length} матчей в сезоне</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-s2 p-1">
          {([["all", "Все"], ["past", "Сыгранные"], ["upcoming", "Предстоящие"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={cn("rounded-md px-3 py-1 text-xs font-semibold transition-colors", filter === id ? "bg-gold text-goldink" : "text-ink2 hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {[...rounds.entries()].map(([round, list]) => (
        <div key={round} className="overflow-hidden rounded-xl border border-sline bg-s1">
          <div className="flex items-center gap-2 border-b border-sline/60 bg-s2/50 px-4 py-2.5">
            <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-goldink">{round > 0 ? `${round}-й тур` : "Без тура"}</span>
            <span className="text-xs text-ink3">{fmtDate(list[0].kickoff, false)}</span>
          </div>
          <div className="divide-y divide-sline/40">
            {list.map((m) => {
              const score = matchScore(m);
              return (
                <button
                  key={m.id}
                  onClick={() => onOpenMatch(m.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-s2/50"
                >
                  <div className="w-36 shrink-0 text-xs text-ink3">{fmtDate(m.kickoff)}</div>
                  <div className="flex min-w-[220px] flex-1 items-center justify-end gap-2 text-sm font-medium">
                    <span className="truncate text-right text-ink2">{m.homeTeam.name}</span>
                    <ScoreBox score={score} status={m.status} />
                    <span className="truncate text-ink2">{m.awayTeam.name}</span>
                  </div>
                  <div className="flex w-32 shrink-0 items-center justify-end gap-1.5">
                    {m.status === "WALKOVER" && <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-xs font-bold text-amber-400">WO</span>}
                    <StatusBadge status={m.status} />
                  </div>
                  <div className="hidden w-40 shrink-0 items-center gap-1 text-xs text-ink3 md:flex">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{m.stadium?.name ?? "—"}</span>
                  </div>
                  <div className="hidden w-36 shrink-0 items-center gap-1 text-xs text-ink3 lg:flex">
                    <Flag className="h-3 w-3 shrink-0" />
                    <span className="truncate">{m.referee?.name ?? "судья не назначен"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {matches.length === 0 && <EmptyState title="Матчей не найдено" hint="Измените фильтр" />}
    </div>
  );
}
