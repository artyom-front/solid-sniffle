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
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-sline bg-s1">
        <div className="border-b border-sline/60 bg-s2/40 px-3 py-2.5">
          <p className="text-[13px] font-bold text-ink">Турнирная таблица</p>
          <p className="text-xs text-ink3">{data.season.league.name} · {data.season.name}</p>
        </div>
        {/* Таблица (Р-28): колонки [# 24px | команда 1fr | И | В | Н | П |
            РМ | О], заголовок 11px UPPERCASE серый, строки 36px, топ-3 —
            номер жёлтым, очки 13px/700, разделители 1px. Мобильный
            (<480px): [# | команда | И | О], разница мячей и В-Н-П —
            второй строкой внутри ячейки команды; padding 8px 6px,
            шрифт 12px. БЕЗ горизонтального скролла и обрезаний. */}
        {/* v1.0.54: предварительная таблица (0 матчей) — все заявленные
          команды с нулями; если команд нет вовсе — понятная заглушка */}
      {rows.length === 0 ? (
        <div className="px-3 py-6 text-center text-[13px] text-ink3">
          В сезоне пока нет команд с заявками — зарегистрируйте игроков или добавьте матчи
        </div>
      ) : (
      <table className="w-full text-xs min-[480px]:text-[13px]">
          <thead className="hidden border-b border-sline/60 text-[11px] uppercase tracking-[0.6px] text-ink3 min-[480px]:table-header-group">
            <tr>
              <th className="w-6 px-1 py-2 text-center font-semibold">#</th>
              <th className="px-2 py-2 text-left font-semibold">Команда</th>
              <th className="w-10 px-1 py-2 text-center font-semibold" title="Игры">И</th>
              <th className="w-10 px-1 py-2 text-center font-semibold" title="Победы">В</th>
              <th className="w-10 px-1 py-2 text-center font-semibold" title="Ничьи">Н</th>
              <th className="w-10 px-1 py-2 text-center font-semibold" title="Поражения">П</th>
              <th className="w-10 px-1 py-2 text-center font-semibold" title="Разница мячей">РМ</th>
              <th className="w-10 px-1 py-2 text-center font-semibold" title="Очки">О</th>
              <th className="hidden w-24 px-1 py-2 text-center font-semibold min-[768px]:table-cell" title="Жёлтые/красные карточки">Дисц.</th>
              <th className="hidden w-28 px-1 py-2 text-center font-semibold min-[768px]:table-cell" title="Последние 5 матчей">Форма</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.teamId}
                className={`h-9 border-b border-sline/40 transition-colors last:border-b-0 hover:bg-shover ${r.position === 1 ? "bg-gold/[0.06]" : ""}`}
                data-clickable
                onClick={() => navigate(`/team/${r.teamId}`)}
              >
                <td className="px-1.5 text-center">
                  {/* топ-3 — номер жёлтым (Р-28) */}
                  <span className={`tabular text-xs font-bold ${r.position <= 3 ? "text-gold" : "text-ink2"}`}>
                    {r.position}
                  </span>
                </td>
                <td className="px-1.5 max-sm:px-1.5">
                  <span className="flex items-center gap-2">
                    <Crest name={r.teamName} id={r.teamId} size="xs" />
                    <span className="min-w-0">
                      <span className="block break-words font-medium text-ink">{r.teamName}</span>
                      {r.clubName && <span className="block text-[11px] text-ink3">{r.clubName}</span>}
                    </span>
                  </span>
                  {/* мобильный (<480px): разница мячей, В-Н-П, дисц. и
                      форма — ВТОРОЙ строкой под командой, не режутся */}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 tabular text-[11px] text-ink3 min-[480px]:hidden">
                    <span>В-Н-П {r.wins}-{r.draws}-{r.losses}</span>
                    <span title={`Забито ${r.goalsFor} : пропущено ${r.goalsAgainst}`}>
                      РМ {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                    </span>
                    <span>
                      ЖК <span className="rounded bg-amber-400/15 px-1 py-0.5 text-amber-400">{r.yellowCards}</span>
                      {" "}КК <span className="rounded bg-live/15 px-1 py-0.5 text-live">{r.redCards}</span>
                    </span>
                    <FormBadges form={r.form.slice(-3)} />
                  </span>
                </td>
                <td className="px-1 text-center tabular text-ink2">{r.games}</td>
                <td className="hidden px-1 text-center tabular text-emerald-400 min-[480px]:table-cell">{r.wins}</td>
                <td className="hidden px-1 text-center tabular text-ink2 min-[480px]:table-cell">{r.draws}</td>
                <td className="hidden px-1 text-center tabular text-ink2 min-[480px]:table-cell">{r.losses}</td>
                <td className="hidden px-1 text-center tabular text-ink2 min-[480px]:table-cell" title={`Забито ${r.goalsFor} : пропущено ${r.goalsAgainst}`}>
                  {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                </td>
                <td className="px-1.5 text-center">
                  <span className="tabular text-[13px] font-bold text-gold">{r.points}</span>
                </td>
                <td className="hidden px-1 text-center text-xs min-[768px]:table-cell">
                  <span className="mr-1 rounded bg-amber-400/15 px-1.5 py-0.5 tabular text-amber-400">{r.yellowCards}</span>
                  <span className="rounded bg-live/15 px-1.5 py-0.5 tabular text-live">{r.redCards}</span>
                </td>
                <td className="hidden px-1 min-[768px]:table-cell"><div className="flex justify-center"><FormBadges form={r.form} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-sline bg-s1 p-3 text-[13px] text-ink2">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-ink"><Info className="h-4 w-4 text-gold" /> Технические поражения</p>
          <p className="text-xs">Неявка команды — регламентный счёт, индивидуальная статистика игроков при этом не затрагивается. Обе неявки (0:0) — 0 очков и техпоражение каждой команде. В форме: <b>Т</b> — техпоражение, <b>тВ</b> — техническая победа.</p>
        </div>
        <div className="rounded-lg border border-sline bg-s1 p-3 text-[13px] text-ink2">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-ink"><Info className="h-4 w-4 text-gold" /> Тай-брейки</p>
          <p className="text-xs">Порядок определения мест: {tie.map((t) => TIE_LABELS[t] ?? t).join(" → ")}.</p>
        </div>
      </div>
    </div>
  );
}
