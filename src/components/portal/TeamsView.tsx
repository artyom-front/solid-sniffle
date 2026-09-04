"use client";

// Сетка команд сезона «Ночь под прожекторами»: герб + город + число заявок.

import { MapPin, Users, ArrowUpRight } from "lucide-react";
import { useFetch } from "./hooks";
import { navigate } from "./router";
import type { TeamDTO } from "./types";
import { LoadingBlock, ErrorBlock, EmptyState } from "./ui-bits";
import { Crest } from "./visuals";

export default function TeamsView({ seasonId, version }: { seasonId: string; version: number }) {
  const { data, loading, error } = useFetch<{ teams: TeamDTO[] }>(seasonId ? `/api/public/teams?seasonId=${seasonId}` : null, version);

  if (!seasonId) return <EmptyState title="Сезон не выбран" />;
  if (loading && !data) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-bold text-ink">Команды</p>
        <p className="text-xs text-ink3">{data.teams.length} команд заявлено на сезон</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.teams.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/team/${t.id}`)}
            className="group rounded-xl border border-sline bg-s1 p-4 text-left transition-all hover:border-gold/50 hover:bg-s2/40"
          >
            <div className="flex items-start justify-between">
              <Crest name={t.name} id={t.id} size="md" />
              <ArrowUpRight className="h-4 w-4 text-ink3 transition-colors group-hover:text-gold" />
            </div>
            <p className="mt-3 font-semibold text-ink group-hover:text-gold">{t.name}</p>
            <p className="flex items-center gap-1 text-xs text-ink3">
              <MapPin className="h-3 w-3" /> {t.clubName}{t.city ? ` · ${t.city}` : ""}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-ink3">
              <Users className="h-3 w-3" /> {t.players.filter((p) => !p.endDate).length} в заявке
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
