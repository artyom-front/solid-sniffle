"use client";

// Дисциплинарные санкции «Ночь под прожекторами»: активные баны и история.

import { Info, Ban, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch, fmtDate } from "./hooks";
import type { SuspensionDTO } from "./types";
import { SOURCE_LABELS } from "@/lib/labels";
import { LoadingBlock, ErrorBlock, EmptyState } from "./ui-bits";
import { Avatar } from "./visuals";

export default function DisciplineView({ seasonId, version, onOpenPlayer }: { seasonId: string; version: number; onOpenPlayer: (id: string) => void }) {
  const { data, loading, error } = useFetch<{ suspensions: SuspensionDTO[] }>(seasonId ? `/api/public/suspensions?seasonId=${seasonId}` : null, version);

  if (!seasonId) return <EmptyState title="Сезон не выбран" />;
  if (loading && !data) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) return null;

  const active = data.suspensions.filter((s) => s.isActive);
  const history = data.suspensions.filter((s) => !s.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-sline bg-s1 p-3 text-xs text-ink2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
        <p>
          Красная карточка — автоматический пропуск следующего матча турнира. Каждые 3 жёлтые карточки — пропуск 1 матча.
          Комитет по дисциплине (КДК) вправе ужесточить санкцию или назначить пожизненную дисквалификацию.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-live/30 bg-s1">
        <div className="flex items-center gap-2 border-b border-live/20 bg-live/10 px-4 py-2.5 text-sm font-semibold text-live">
          <Ban className="h-4 w-4" /> Активные дисквалификации · {active.length}
        </div>
        {active.length === 0 && <p className="py-8 text-center text-sm text-ink3">Все игроки в строю</p>}
        {active.map((s) => (
          <button key={s.id} onClick={() => onOpenPlayer(s.person.id)} className="flex w-full flex-wrap items-center gap-3 border-b border-sline/40 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-s2/50">
            <Avatar name={s.person.name} id={s.person.id} size="sm" />
            <div className="min-w-[180px] flex-1">
              <p className="text-sm font-semibold text-ink">{s.person.name}</p>
              <p className="text-xs text-ink3">{s.team?.name ?? "—"}</p>
            </div>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              s.source === "MANUAL" ? "bg-live/15 text-live" : s.source === "AUTO_RED" ? "bg-orange-400/15 text-orange-300" : "bg-amber-400/15 text-amber-300"
            )}>
              {SOURCE_LABELS[s.source] ?? s.source}
            </span>
            <div className="hidden min-w-[200px] flex-1 text-xs text-ink2 sm:block">{s.reason}</div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-live">
              <Clock className="h-4 w-4" />
              {s.isLifetime ? "Пожизненно" : `осталось ${s.matchesTotal - s.matchesServed} матч.`}
            </div>
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-sline bg-s1">
          <div className="border-b border-sline/60 bg-s2/50 px-4 py-2.5 text-sm font-semibold text-ink2">
            Отбытые · {history.length}
          </div>
          {history.map((s) => (
            <button key={s.id} onClick={() => onOpenPlayer(s.person.id)} className="flex w-full flex-wrap items-center gap-3 border-b border-sline/40 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-s2/50">
              <div className="min-w-[180px] flex-1">
                <p className="text-sm font-medium text-ink2">{s.person.name}</p>
                <p className="text-xs text-ink3">{s.team?.name ?? "—"} · {fmtDate(s.createdAt, false)}</p>
              </div>
              <span className="rounded-full bg-s2 px-2 py-0.5 text-xs text-ink2">{SOURCE_LABELS[s.source] ?? s.source}</span>
              <span className="text-xs text-ink3">отбыто {s.matchesServed}/{s.matchesTotal}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
