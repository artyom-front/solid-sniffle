"use client";

// Турнирная таблица «Ночь под прожекторами»: зоны призов, ЖК/КК-чипы, форма.

import { Info } from "lucide-react";
import { useFetch } from "./hooks";
import { navigate } from "./router";
import type { StandingRowDTO } from "./types";
import { LoadingBlock, ErrorBlock, FormBadges, EmptyState } from "./ui-bits";
import { Crest } from "./visuals";

interface StandingsResponse {
  season: { name: string; league: { name: string; format: string } };
  stage: { name: string; tieBreakers: string } | null;
  standings: StandingRowDTO[];
}

const TIE_LABELS: Record<string, string> = {
  points: "очки",
  head_to_head: "личные встречи",
  goal_diff: "разница мячей",
  goals_for: "забитые мячи",
  wins: "победы",
  fair_play: "fair play (ЖК+КК)",
  name: "алфавит",
};

export default function StandingsView({ seasonId, version }: { seasonId: string; version: number }) {
  const { data, loading, error } = useFetch<StandingsResponse>(seasonId ? `/api/public/standings?seasonId=${seasonId}` : null, version);

  if (!seasonId) return <EmptyState title="Сезон не выбран" />;
  if (loading && !data) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!data) return null;

  const rows = data.standings;
  const tie = data.stage?.tieBreakers?.split(",").filter(Boolean) ?? [];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-sline bg-s1">
        <div className="border-b border-sline/60 bg-s2/50 px-4 py-3">
          <p className="text-sm font-bold text-ink">Турнирная таблица</p>
          <p className="text-xs text-ink3">{data.season.league.name} · {data.season.name}</p>
        </div>
        <div className="overflow-x-auto scrollbar-s21">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-sline/60 text-xs uppercase tracking-wide text-ink3">
                <th className="w-10 px-3 py-3 text-center font-semibold">#</th>
                <th className="px-3 py-3 text-left font-semibold">Команда</th>
                <th className="w-12 px-2 py-3 text-center font-semibold" title="Игры">И</th>
                <th className="w-12 px-2 py-3 text-center font-semibold" title="Победы">В</th>
                <th className="w-12 px-2 py-3 text-center font-semibold" title="Ничьи">Н</th>
                <th className="w-12 px-2 py-3 text-center font-semibold" title="Поражения">П</th>
                <th className="w-24 px-2 py-3 text-center font-semibold" title="Забито:Пропущено">Мячи</th>
                <th className="w-12 px-2 py-3 text-center font-semibold" title="Разница">±</th>
                <th className="w-12 px-2 py-3 text-center font-semibold" title="Очки">О</th>
                <th className="w-28 px-2 py-3 text-center font-semibold" title="ЖК/КК">Дисц.</th>
                <th className="w-32 px-3 py-3 text-center font-semibold" title="Последние 5 матчей">Форма</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.teamId}
                  className={`cursor-pointer border-b border-sline/40 transition-colors last:border-b-0 hover:bg-s2/60 ${r.position === 1 ? "bg-gold/[0.06]" : ""}`}
                  onClick={() => navigate(`/team/${r.teamId}`)}
                >
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${r.position === 1 ? "bg-gold text-goldink" : "text-ink2"}`}>
                      {r.position}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Crest name={r.teamName} id={r.teamId} size="sm" />
                      <span className="min-w-0">
                        <span className="block font-medium text-ink">{r.teamName}</span>
                        {r.clubName && <span className="block text-xs text-ink3">{r.clubName}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-center tabular text-ink2">{r.games}</td>
                  <td className="px-2 py-2.5 text-center tabular font-medium text-emerald-400">{r.wins}</td>
                  <td className="px-2 py-2.5 text-center tabular text-ink2">{r.draws}</td>
                  <td className="px-2 py-2.5 text-center tabular text-ink2">{r.losses}</td>
                  <td className="px-2 py-2.5 text-center font-mono text-xs tabular text-ink2">{r.goalsFor}:{r.goalsAgainst}</td>
                  <td className="px-2 py-2.5 text-center tabular text-ink2">{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                  <td className="px-2 py-2.5 text-center text-base font-bold tabular text-gold">{r.points}</td>
                  <td className="px-2 py-2.5 text-center text-xs">
                    <span className="mr-1 rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-amber-400">{r.yellowCards}</span>
                    <span className="rounded bg-live/15 px-1.5 py-0.5 font-mono text-live">{r.redCards}</span>
                  </td>
                  <td className="px-3 py-2.5"><div className="flex justify-center"><FormBadges form={r.form} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-sline bg-s1 p-4 text-sm text-ink2">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-ink"><Info className="h-4 w-4 text-gold" /> Технические поражения</p>
          <p className="text-xs">Неявка команды — регламентный счёт, индивидуальная статистика игроков при этом не затрагивается. Обе неявки (0:0) — 0 очков и техпоражение каждой команде. В форме: <b>Т</b> — техпоражение, <b>тВ</b> — техническая победа.</p>
        </div>
        <div className="rounded-xl border border-sline bg-s1 p-4 text-sm text-ink2">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-ink"><Info className="h-4 w-4 text-gold" /> Тай-брейки</p>
          <p className="text-xs">Порядок определения мест: {tie.map((t) => TIE_LABELS[t] ?? t).join(" → ")}.</p>
        </div>
      </div>
    </div>
  );
}
