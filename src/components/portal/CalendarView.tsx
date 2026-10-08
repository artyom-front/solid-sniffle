"use client";

// Календарь матчей «Ночь под прожекторами»: туры, статусы, стадион и судья.

import { useState } from "react";
import { MapPin, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch, fmtDate } from "./hooks";
import type { MatchDTO } from "./types";
import { LoadingBlock, ErrorBlock, StatusBadge, matchScore, EmptyState } from "./ui-bits";

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
          <div className="flex items-center gap-2 border-b border-sline/60 bg-s2/50 px-3 py-2.5 md:px-4">
            <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-goldink">{round > 0 ? `${round}-й тур` : "Без тура"}</span>
            <span className="text-xs text-ink3">{fmtDate(list[0].kickoff, false)}</span>
          </div>
          <div className="divide-y divide-sline/40">
            {list.map((m) => {
              const score = matchScore(m);
              // цвет цифр — как у ScoreBox: технический — янтарный, без счёта — приглушённый
              const digitColor = m.status === "WALKOVER" ? "text-amber-400" : score ? "text-ink" : "text-ink3";
              return (
                <button
                  key={m.id}
                  onClick={() => onOpenMatch(m.id)}
                  className={cn(
                    // мобайл (<md): мета-строка (дата·статус) + команды друг под
                    // другом, счёт по цифре справа (см. комментарий в MatchDayView)
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-s2/50",
                    "md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-1 md:px-4 md:py-3"
                  )}
                >
                  {/* дата: мобайл — строка 1 слева; десктоп — колонка слева */}
                  <span className="col-start-1 row-start-1 min-w-0 truncate text-xs text-ink3 md:order-1 md:w-36 md:shrink-0 md:whitespace-normal">
                    {fmtDate(m.kickoff)}
                  </span>
                  {/* статус: мобайл — строка 1 справа; десктоп — после счёта */}
                  <span className="col-start-2 row-start-1 flex items-center justify-end gap-1.5 md:order-3 md:w-32 md:shrink-0">
                    {m.status === "WALKOVER" && <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-xs font-bold text-amber-400">WO</span>}
                    <StatusBadge status={m.status} />
                  </span>
                  {/* команды и счёт: мобайл — «растворяются» (contents) в строки
                   *  грида; десктоп — классический блок «Хозяева 2:1 Гости» */}
                  <span className="contents text-sm font-medium md:order-2 md:flex md:min-w-[220px] md:flex-1 md:items-center md:justify-end md:gap-2">
                    <span className="col-start-1 row-start-2 min-w-0 truncate text-ink2 md:text-right">{m.homeTeam.name}</span>
                    <span className="contents font-mono text-sm font-bold tabular md:flex md:shrink-0 md:items-center">
                      <span className={cn("col-start-2 row-start-2 flex items-center justify-end font-mono text-sm font-bold tabular md:justify-center", digitColor)}>
                        {score ? score.home : "—"}
                      </span>
                      <span className="hidden px-1 md:inline" aria-hidden>
                        :
                      </span>
                      <span className={cn("col-start-2 row-start-3 flex items-center justify-end font-mono text-sm font-bold tabular md:justify-center", digitColor)}>
                        {score ? score.away : "—"}
                      </span>
                    </span>
                    <span className="col-start-1 row-start-3 min-w-0 truncate text-ink2">{m.awayTeam.name}</span>
                  </span>
                  {/* стадион / судья — только десктоп */}
                  <span className="hidden items-center gap-1 text-xs text-ink3 md:order-4 md:flex md:w-40 md:shrink-0">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{m.stadium?.name ?? "—"}</span>
                  </span>
                  <span className="hidden items-center gap-1 text-xs text-ink3 md:order-5 md:w-36 md:shrink-0 md:items-center lg:flex">
                    <Flag className="h-3 w-3 shrink-0" />
                    <span className="truncate">{m.referee?.name ?? "судья не назначен"}</span>
                  </span>
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
