"use client";

// Судейский корпус «Ночь под прожекторами»: карточки судей с рейтингом.

import { Star, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "./hooks";
import { navigate } from "./router";
import type { RefereeStatDTO } from "./types";
import { LoadingBlock, ErrorBlock, EmptyState } from "./ui-bits";
import { Avatar } from "./visuals";

export default function RefereesView({ seasonId, version }: { seasonId: string; version: number }) {
  const { data, loading, error } = useFetch<{ referees: RefereeStatDTO[] }>(seasonId ? `/api/public/referees?seasonId=${seasonId}` : null, version);

  if (!seasonId) return <EmptyState title="Сезон не выбран" />;
  if (loading && !data) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-ink">Судейский корпус</p>
        <p className="text-xs text-ink3">Назначения, средние показатели и рейтинг команд</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.referees.map((r) => (
          <button
            key={r.personId}
            onClick={() => navigate(`/player/${r.personId}`)}
            className="rounded-xl border border-sline bg-s1 p-5 text-left transition-all hover:border-gold/50"
          >
            <div className="flex items-center gap-3">
              <Avatar name={r.name} id={r.personId} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight text-ink">{r.name}</p>
                <p className="text-xs text-ink3">{r.matches} обслуженных матчей · профиль →</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-s2 py-2">
                <p className="font-mono text-lg font-bold text-amber-400">{r.yellowAvg}</p>
                <p className="text-xs text-ink3">ЖК за матч</p>
              </div>
              <div className="rounded-lg bg-s2 py-2">
                <p className="font-mono text-lg font-bold text-live">{r.redAvg}</p>
                <p className="text-xs text-ink3">КК за матч</p>
              </div>
              <div className="rounded-lg bg-s2 py-2">
                <p className="font-mono text-lg font-bold text-ink2">{r.penaltyAvg}</p>
                <p className="text-xs text-ink3">Пенальти</p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-sline/60 pt-3">
              <span className="flex items-center gap-1 text-xs text-ink3"><Flag className="h-3 w-3" /> рейтинг команд</span>
              {r.avgRating !== null ? (
                <span className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className={cn("h-4 w-4", i <= Math.round(r.avgRating!) ? "fill-gold text-gold" : "text-ink3")} />
                  ))}
                  <span className="ml-1 font-mono text-sm font-bold text-gold">{r.avgRating}</span>
                  <span className="text-xs text-ink3">({r.ratingsCount})</span>
                </span>
              ) : (
                <span className="text-xs text-ink3">нет оценок</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-ink3">
        Оценки выставляют капитаны и администраторы клубов после завершённых матчей; авторы оценок скрыты (анонимность по PRD).
      </p>
    </div>
  );
}
