"use client";

// ============================================================
// Вкладка «Составы» карточки матча (вынесена из MatchPage —
// Этап 3, разборка гигантов; v1.0.28 — новая структура заявки).
//
// Заявка на матч делится на три группы:
//   • Стартовые — вышли с первых минут (номер обязателен по духу
//     любительского протокола, «—» если не введён);
//   • Запасные — игроки на скамейке;
//   • Штаб — тренер/администратор/руководство из заявки (роль
//     Registration != PLAYER), без номеров.
// Легаси-протоколы (все в старте): если «стартовых» больше лимита
// формата — показываем одной группой «Состав», не выдавая
// очевидно кривое деление за правду.
// ============================================================

import { cn } from "@/lib/utils";
import { navigate } from "./router";
import type { MatchDTO } from "./types";
import { STARTER_LIMITS, REGISTRATION_ROLE_LABELS } from "@/lib/labels";
import { Crest, Avatar } from "./visuals";
import { BallIcon, CardIcon } from "./EventIcons";
import { ArrowUp, ArrowDown } from "lucide-react";

interface EventRow {
  id: string;
  minute: number;
  stoppage?: number | null;
  type: string;
  person: { id: string; name: string };
  assist: { id: string; name: string } | null;
  teamId: string;
}

export interface LineupRow {
  id: string;
  teamId: string;
  person: { id: string; name: string; position: string | null };
  isStarter: boolean;
  number: number | null;
  regRole: string;
}

export type LineupsMatch = MatchDTO & {
  events: EventRow[];
  lineups: LineupRow[];
  league: { id: string; name: string; walkoverScore: number; yellowCardLimit: number; format: string };
};

export default function MatchLineupsTab({ m }: { m: LineupsMatch }) {
  // значки участия — только у сыгранных/идущих матчей
  const showMarks = m.status === "COMPLETED" || m.status === "LIVE";
  const limit = STARTER_LIMITS[m.league?.format ?? "FRIENDLY"] ?? 11;
  return (
    <div className="grid grid-cols-1 gap-3 p-3 text-sm sm:grid-cols-2">
      {[m.homeTeam, m.awayTeam].map((team) => {
        const rows = m.lineups.filter((l) => l.teamId === team.id);
        const players = rows.filter((l) => l.regRole === "PLAYER");
        const staff = rows.filter((l) => l.regRole !== "PLAYER");
        const starters = players.filter((l) => l.isStarter);
        const bench = players.filter((l) => !l.isStarter);
        // легаси-протокол: «стартовых» больше, чем позволяет формат —
        // это заявка целиком, а не старт; показываем честно одной группой
        const legacy = starters.length > limit;
        return (
          <div key={team.id} className="rounded-xl border border-sline/50 p-3">
            <button
              className="mb-2 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:text-gold"
              onClick={() => navigate(`/team/${team.id}`)}
            >
              <Crest name={team.name} id={team.id} size="sm" />
              <span className="text-xs font-bold text-ink2">{team.name}</span>
            </button>

            {legacy ? (
              <>
                <p className="px-1 pb-1 text-xs font-bold uppercase tracking-wide text-ink3">
                  Состав · заявка{rows.length ? ` · ${rows.length}` : ""}
                </p>
                {rows.map((l) => (
                  <LineupRowView key={l.id} l={l} showMarks={showMarks} events={m.events} />
                ))}
              </>
            ) : (
              <>
                <p className="px-1 pb-1 text-xs font-bold uppercase tracking-wide text-ink3">
                  Стартовые{starters.length ? ` · ${starters.length}` : ""}
                </p>
                {starters.length === 0 && <p className="px-1 py-1 text-xs text-ink3">не отмечены</p>}
                {starters.map((l) => (
                  <LineupRowView key={l.id} l={l} showMarks={showMarks} events={m.events} />
                ))}

                {bench.length > 0 && (
                  <>
                    <p className="px-1 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-ink3">
                      Запасные · {bench.length}
                    </p>
                    {bench.map((l) => (
                      <LineupRowView key={l.id} l={l} showMarks={showMarks} events={m.events} />
                    ))}
                  </>
                )}

                {staff.length > 0 && (
                  <>
                    <p className="px-1 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-ink3">
                      Штаб и руководство · {staff.length}
                    </p>
                    {staff.map((l) => (
                      <button key={l.id} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-ink3 hover:text-ink2" onClick={() => navigate(`/player/${l.person.id}`)}>
                        <Avatar name={l.person.name} id={l.person.id} size="xs" />
                        <span className="min-w-0 flex-1 truncate">{l.person.name}</span>
                        <span className="shrink-0 text-[11px] font-medium text-ink3">
                          {REGISTRATION_ROLE_LABELS[l.regRole] ?? l.regRole}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Строка игрока: № · аватар · имя · значки событий матча */
function LineupRowView({ l, showMarks, events }: { l: LineupRow; showMarks: boolean; events: EventRow[] }) {
  return (
    <button className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left text-ink2 hover:text-ink" onClick={() => navigate(`/player/${l.person.id}`)}>
      <span className="w-6 text-center font-mono text-xs text-ink3">{l.number ?? "—"}</span>
      <Avatar name={l.person.name} id={l.person.id} size="xs" />
      <span className="min-w-0 flex-1 truncate">{l.person.name}</span>
      {showMarks && <PlayerEventMarks events={events} personId={l.person.id} />}
    </button>
  );
}

/** Значки участия игрока в событиях матча: ⚽ гол, карточки, ▲▼ замены */
export function PlayerEventMarks({ events, personId }: { events: EventRow[]; personId: string }) {
  const GOALS = new Set(["GOAL", "PENALTY", "OWN_GOAL"]);
  type Mark = { minute: number; label: string; node: React.ReactNode; title: string };
  const marks: Mark[] = [];
  const min = (e: EventRow) => e.stoppage ? `${e.minute}+${e.stoppage}′` : `${e.minute}′`;

  for (const e of events) {
    const key = e.minute + (e.stoppage ?? 0);
    if (e.person.id === personId) {
      if (GOALS.has(e.type)) marks.push({ minute: key, label: min(e), title: `Гол ${min(e)}`, node: <BallIcon className="h-3 w-3 text-gold" /> });
      if (e.type === "YELLOW_CARD") marks.push({ minute: key, label: min(e), title: `Жёлтая карточка ${min(e)}`, node: <CardIcon kind="yellow" className="h-3 w-2" /> });
      if (e.type === "RED_CARD") marks.push({ minute: key, label: min(e), title: `Красная карточка ${min(e)}`, node: <CardIcon kind="red" className="h-3 w-2" /> });
      if (e.type === "SUBSTITUTION" || e.type === "SUB_IN") marks.push({ minute: key, label: min(e), title: `Вышел на поле ${min(e)}`, node: <ArrowUp className="h-3 w-3 text-ok" /> });
      if (e.type === "SUB_OUT") marks.push({ minute: key, label: min(e), title: `Ушёл с поля ${min(e)}`, node: <ArrowDown className="h-3 w-3 text-live" /> });
    }
    if (e.assist?.id === personId) {
      if (e.type === "SUBSTITUTION") marks.push({ minute: key, label: min(e), title: `Ушёл с поля ${min(e)}`, node: <ArrowDown className="h-3 w-3 text-live" /> });
      else if (GOALS.has(e.type)) marks.push({ minute: key, label: min(e), title: `Ассист ${min(e)}`, node: <span className="text-[9px] font-black text-gold">А</span> });
    }
  }
  if (marks.length === 0) return null;
  marks.sort((a, b) => a.minute - b.minute);
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      {marks.map((mk, i) => (
        <span key={i} title={mk.title} className={cn("flex items-center gap-0.5 rounded bg-s2/70 px-1 py-0.5 font-mono text-[10px] leading-none text-ink2")}>
          {mk.node}
          <span>{mk.label}</span>
        </span>
      ))}
    </span>
  );
}
