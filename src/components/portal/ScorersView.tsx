"use client";

// Статистика игроков «Ночь под прожекторами»: бомбардиры, ассистенты,
// вратари, fair play. Табы — единый стиль Р-07 (жёлтый текст + линия
// 2px снизу, без рамок-боксов); имена/команды переносятся, не режутся.

import { useState } from "react";
import { Info, Target, Zap, Shield, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFetch } from "./hooks";
import type { PlayerStatRowDTO, ScorersDTO } from "./types";
import { LoadingBlock, ErrorBlock, EmptyState, PositionBadge } from "./ui-bits";
import { Avatar } from "./visuals";

const TABS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "scorers", label: "Бомбардиры", icon: <Target className="h-3.5 w-3.5" /> },
  { id: "assisters", label: "Ассистенты", icon: <Zap className="h-3.5 w-3.5" /> },
  { id: "goalkeepers", label: "Вратари", icon: <Shield className="h-3.5 w-3.5" /> },
  { id: "fairPlay", label: "Дисциплина", icon: <Ban className="h-3.5 w-3.5" /> },
];

export default function ScorersView({ seasonId, version, onOpenPlayer }: { seasonId: string; version: number; onOpenPlayer: (id: string) => void }) {
  const { data, loading, error } = useFetch<ScorersDTO>(seasonId ? `/api/public/scorers?seasonId=${seasonId}` : null, version);
  const [tab, setTab] = useState("scorers");

  if (!seasonId) return <EmptyState title="Сезон не выбран" />;
  if (loading && !data) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) return null;

  const Row = ({ p, i, metric, metricLabel }: { p: PlayerStatRowDTO; i: number; metric: number; metricLabel: string }) => (
    <button
      onClick={() => onOpenPlayer(p.personId)}
      className="flex w-full items-center gap-3 border-b border-sline/40 px-4 py-2.5 text-left transition-colors hover:bg-s2/50"
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full tabular text-xs font-bold ${i < 3 ? "bg-gold text-goldink" : "bg-s2 text-ink2"}`}>
        {i + 1}
      </span>
      <Avatar name={p.name} id={p.personId} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 break-words text-sm font-medium text-ink">
          {p.name} <PositionBadge position={p.position} />
        </p>
        <p className="break-words text-xs text-ink3">{p.teamName}</p>
      </div>
      <span className="shrink-0 text-xs text-ink3">{p.games} матч.</span>
      <span className="w-10 shrink-0 text-right tabular text-base font-bold text-gold" title={metricLabel}>{metric}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Голы, ассисты и карточки, полученные в матчах, оформленных как техническое поражение, <b>не учитываются</b> в индивидуальной статистике.</p>
      </div>

      {/* Табы (Р-07): активный — жёлтый текст + линия 2px снизу, 13px/600 */}
      <div className="overflow-hidden rounded-lg border border-sline bg-s1">
        <div className="flex gap-1 overflow-x-auto border-b border-sline/60 px-2 scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold transition-colors",
                tab === t.id ? "text-gold" : "text-ink2 hover:text-ink"
              )}
            >
              {t.icon}
              {t.label}
              {tab === t.id && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-gold" />}
            </button>
          ))}
        </div>

        {tab === "scorers" && (
          <div>
            {data.scorers.map((p, i) => <Row key={p.personId} p={p} i={i} metric={p.goals} metricLabel={`Голов: ${p.goals} (пенальти: ${p.penalties})`} />)}
            {data.scorers.length === 0 && <p className="py-10 text-center text-sm text-ink3">Голов пока нет</p>}
          </div>
        )}

        {tab === "assisters" && (
          <div>
            {data.assisters.map((p, i) => <Row key={p.personId} p={p} i={i} metric={p.assists} metricLabel="Ассистов" />)}
            {data.assisters.length === 0 && <p className="py-10 text-center text-sm text-ink3">Ассистов пока нет</p>}
          </div>
        )}

        {tab === "goalkeepers" && (
          <div>
            <div className="flex items-center gap-3 border-b border-sline/40 bg-s2/50 px-4 py-2 text-xs font-medium text-ink3">
              <span className="w-7" /> <span className="w-8" /> <span className="flex-1">Вратарь</span> <span className="w-16 text-right">Матчей</span> <span className="w-24 text-right">«Сухие» матчи</span>
            </div>
            {data.goalkeepers.map((p, i) => (
              <button key={p.personId} onClick={() => onOpenPlayer(p.personId)} className="flex w-full items-center gap-3 border-b border-sline/40 px-4 py-2.5 text-left transition-colors hover:bg-s2/50">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-s2 tabular text-xs font-bold text-ink2">{i + 1}</span>
                <Avatar name={p.name} id={p.personId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-ink">{p.name}</p>
                  <p className="break-words text-xs text-ink3">{p.teamName}</p>
                </div>
                <span className="w-16 shrink-0 text-right tabular text-sm text-ink2">{p.games}</span>
                <span className="w-24 shrink-0 text-right tabular text-base font-bold text-gold">{p.cleanSheets}</span>
              </button>
            ))}
            {data.goalkeepers.length === 0 && <p className="py-10 text-center text-sm text-ink3">Нет данных</p>}
          </div>
        )}

        {tab === "fairPlay" && (
          <div>
            <div className="flex items-center gap-3 border-b border-sline/40 bg-s2/50 px-4 py-2 text-xs font-medium text-ink3">
              <span className="w-7" /> <span className="w-8" /> <span className="flex-1">Игрок</span> <span className="w-14 text-right">ЖК</span> <span className="w-14 text-right">КК</span>
            </div>
            {data.fairPlay.map((p, i) => (
              <button key={p.personId} onClick={() => onOpenPlayer(p.personId)} className="flex w-full items-center gap-3 border-b border-sline/40 px-4 py-2.5 text-left transition-colors hover:bg-s2/50">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-s2 tabular text-xs font-bold text-ink2">{i + 1}</span>
                <Avatar name={p.name} id={p.personId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-ink">{p.name}</p>
                  <p className="break-words text-xs text-ink3">{p.teamName}</p>
                </div>
                <span className="w-14 shrink-0 text-right tabular font-bold text-amber-400">{p.yellowCards}</span>
                <span className="w-14 shrink-0 text-right tabular font-bold text-live">{p.redCards}</span>
              </button>
            ))}
            {data.fairPlay.length === 0 && <p className="py-10 text-center text-sm text-ink3">Карточек пока нет</p>}
          </div>
        )}
      </div>
    </div>
  );
}
