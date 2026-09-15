"use client";

// ============================================================
// MatchTimeline — единая минималистичная хронология матча
// (админка + публичный сайт, v1.0.19).
//
// Дизайн по стандарту топ-ресурсов (SofaScore/FotMob) — зеркальная ось:
//   (D. Bezerra) F. Petrasso ⚽ |  44' 1:1  | ⚽ A. Marcus (M. Scholze)
//              F. Petrasso ⚽ |  45+3'    |
//   ———————————— Перерыв 1:1 ————————————
//   ———————————— Завершён 2:2 ————————————
//
// • Минуты и бегущий счёт — в центре, ось времени; события расходятся
//   влево (хозяева) и вправо (гости) ЗЕРКАЛЬНО: иконка всегда рядом
//   с осью, фамилия — дальше от центра, ассист — у самого края.
// • Имя автора — основным шрифтом; ассист — в скобках, приглушённым.
// • Гол с пенальти — мяч с бейджем «П»; автогол — мяч + подпись;
//   VAR — монитор с вердиктом.
// • Замена — ОДНА строка: ▼ ушедший (приглушён) → ▲ вышедший.
// • «Перерыв» и «Завершён» — в зоне минут, с текущим счётом.
// ============================================================

import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { EventIcon } from "./EventIcons";
import { EVENT_SHORT_LABELS } from "@/lib/labels";

export interface TimelineEventDTO {
  id: string;
  minute: number;
  stoppage?: number | null;
  type: string;
  person: { id: string; name: string };
  assist: { id: string; name: string } | null;
  teamId: string;
}

interface Props {
  events: TimelineEventDTO[];
  homeTeamId: string;
  /** статус матча: COMPLETED → маркер «Завершён» */
  status: string;
  homeScore?: number | null;
  awayScore?: number | null;
  theme: "light" | "dark";
  /** админ-режим: кнопка удаления у каждого события */
  onDelete?: (eventId: string) => void;
  /** клиент: клик по имени → профиль игрока */
  onPersonClick?: (personId: string) => void;
  /** класс корневого div (например, скрыть верхнюю границу первой строки) */
  className?: string;
}

/** Строка на рендер: событие с предвычисленным бегущим счётом или маркер */
type RenderRow =
  | { kind: "event"; e: TimelineEventDTO; isHome: boolean; score: string | null }
  | { kind: "sub"; e: TimelineEventDTO; out: TimelineEventDTO | null; isHome: boolean }
  | { kind: "marker"; label: string; score: string | null };

const GOAL_TYPES = new Set(["GOAL", "PENALTY", "OWN_GOAL"]);

/** Эффективная минута с учётом добавленного времени (45+3 → 48 для сортировки) */
function effMinute(e: TimelineEventDTO): number {
  return e.minute + (e.stoppage ?? 0);
}

function minuteLabel(e: { minute: number; stoppage?: number | null }): string {
  return e.stoppage ? `${e.minute}+${e.stoppage}′` : `${e.minute}′`;
}

/** Компоновка строк: склейка легаси-замен, бегущий счёт, маркеры таймов */
function buildRows(events: TimelineEventDTO[], homeTeamId: string, status: string, homeScore?: number | null, awayScore?: number | null): RenderRow[] {
  const sorted = [...events].sort((a, b) => effMinute(a) - effMinute(b));
  const consumed = new Set<string>();
  const rows: RenderRow[] = [];
  let home = 0;
  let away = 0;
  let halftimeInserted = false;

  const goalScore = (e: TimelineEventDTO): string | null => {
    if (!GOAL_TYPES.has(e.type)) return null;
    const forHome = e.teamId === homeTeamId;
    const own = e.type === "OWN_GOAL";
    if ((forHome && !own) || (!forHome && own)) home++;
    else away++;
    return `${home}:${away}`;
  };

  for (const e of sorted) {
    if (consumed.has(e.id)) continue;
    const m = effMinute(e);

    // маркер «Перерыв» — перед первым событием второго тайма
    if (m > 45 && !halftimeInserted) {
      halftimeInserted = true;
      rows.push({ kind: "marker", label: "Перерыв", score: `${home}:${away}` });
    }

    // легаси-пары SUB_OUT+SUB_IN → одна строка замены
    if (e.type === "SUB_OUT") {
      const partner = sorted.find(
        (x) => x.id !== e.id && !consumed.has(x.id) && x.type === "SUB_IN" && x.teamId === e.teamId && Math.abs(effMinute(x) - m) <= 1
      );
      if (partner) {
        consumed.add(partner.id);
        rows.push({ kind: "sub", e: partner, out: e, isHome: e.teamId === homeTeamId });
        continue;
      }
    }

    rows.push({ kind: "event", e, isHome: e.teamId === homeTeamId, score: goalScore(e) });
  }

  if (status === "COMPLETED" || status === "WALKOVER") {
    const h = homeScore ?? home;
    const a = awayScore ?? away;
    rows.push({ kind: "marker", label: "Завершён", score: `${h}:${a}` });
  }

  return rows;
}

export default function MatchTimeline({
  events, homeTeamId, status, homeScore, awayScore, theme, onDelete, onPersonClick, className,
}: Props) {
  if (events.length === 0) return null;
  const rows = buildRows(events, homeTeamId, status, homeScore, awayScore);

  // ---------- Темы ----------
  const t = {
    row: theme === "dark" ? "border-sline/40" : "border-zinc-100",
    minute: theme === "dark" ? "text-ink font-semibold" : "text-zinc-800 font-semibold",
    runScore: theme === "dark" ? "text-gold" : "text-emerald-700",
    name: theme === "dark" ? "text-ink" : "text-zinc-800",
    assist: theme === "dark" ? "text-ink3" : "text-zinc-400",
    note: theme === "dark" ? "text-ink3" : "text-zinc-400",
    markerLabel: theme === "dark" ? "text-ink3" : "text-zinc-500",
    markerScore: theme === "dark" ? "text-gold font-bold" : "text-emerald-700 font-bold",
    markerLine: theme === "dark" ? "bg-sline/60" : "bg-zinc-200",
    side: theme === "dark" ? "text-ink3" : "text-zinc-400",
    subIn: theme === "dark" ? "text-ok" : "text-emerald-600",
    subOut: theme === "dark" ? "text-live" : "text-red-500",
  };

  const Person = ({ p, className }: { p: { id: string; name: string }; className?: string }) =>
    onPersonClick ? (
      <button
        onClick={(ev) => { ev.stopPropagation(); onPersonClick(p.id); }}
        className={cn("truncate hover:underline", className)}
      >
        {p.name}
      </button>
    ) : (
      <span className={cn("truncate", className)}>{p.name}</span>
    );

  return (
    <div className={className}>
      {rows.map((row, i) => {
        // ---------- Маркер: Перерыв / Завершён ----------
        if (row.kind === "marker") {
          return (
            <div key={`m${i}`} className={cn("flex items-center gap-3 border-t py-2", t.row)}>
              <span className={cn("h-px flex-1", t.markerLine)} />
              <span className="flex items-baseline gap-2">
                <span className={cn("text-[11px] font-bold uppercase tracking-widest", t.markerLabel)}>{row.label}</span>
                {row.score && <span className={cn("font-mono text-sm", t.markerScore)}>{row.score}</span>}
              </span>
              <span className={cn("h-px flex-1", t.markerLine)} />
            </div>
          );
        }

        // ---------- Замена: один выход-вход ----------
        if (row.kind === "sub") {
          const text = (
            <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
              {row.out && (
                <span className="inline-flex min-w-0 items-center gap-0.5 opacity-75">
                  <ArrowDown className={cn("h-3 w-3 shrink-0", t.subOut)} aria-hidden />
                  <Person p={row.out.person} className={t.assist} />
                </span>
              )}
              <span className={cn("text-xs", t.side)} aria-hidden>→</span>
              <span className="inline-flex min-w-0 items-center gap-0.5">
                <ArrowUp className={cn("h-3 w-3 shrink-0", t.subIn)} aria-hidden />
                <Person p={row.e.person} className={cn("font-medium", t.name)} />
              </span>
            </span>
          );
          const icon = <EventIcon type="SUBSTITUTION" />;
          return (
            <div
              key={row.e.id}
              className={cn("relative grid grid-cols-[1fr_3rem_1fr] items-center gap-1 border-t px-1 py-1.5", t.row, onDelete && "group/row")}
            >
              {/* хозяева — зеркально: текст, затем иконка у самой оси */}
              <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                {row.isHome ? (<>{text}{icon}</>) : null}
              </span>
              <span className={cn("shrink-0 text-center font-mono text-xs", t.minute)}>{minuteLabel(row.e)}</span>
              <span className="flex min-w-0 items-center gap-2">{!row.isHome ? (<>{icon}{text}</>) : null}</span>
              {onDelete && (
                <DelBtn onDelete={onDelete} id={row.e.id} theme={theme} />
              )}
            </div>
          );
        }

        // ---------- Обычное событие ----------
        const e = row.e;
        const isGoal = GOAL_TYPES.has(e.type);
        const note = EVENT_SHORT_LABELS[e.type];
        const text = (
          <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-sm">
            <Person p={e.person} className={cn(isGoal ? "font-semibold" : "font-medium", t.name)} />
            {note && <span className={cn("text-xs", t.note)}>{note}</span>}
            {e.assist && (
              <span className={cn("text-xs", t.assist)}>
                (<Person p={e.assist} className="hover:underline" />)
              </span>
            )}
          </span>
        );
        const icon = <EventIcon type={e.type} />;
        return (
          <div
            key={e.id}
            className={cn("relative grid grid-cols-[1fr_3rem_1fr] items-center gap-1 border-t px-1 py-1.5", t.row, onDelete && "group/row")}
          >
            {/* хозяева — зеркально: ассист у края, фамилия, иконка у оси */}
            <span className="flex min-w-0 items-center justify-end gap-2 text-right">
              {row.isHome ? (<>{text}{icon}</>) : null}
            </span>
            <span className="flex shrink-0 flex-col items-center leading-none">
              <span className={cn("font-mono text-xs", t.minute)}>{minuteLabel(e)}</span>
              {row.score && <span className={cn("mt-0.5 font-mono text-[11px] font-bold", t.runScore)}>{row.score}</span>}
            </span>
            <span className="flex min-w-0 items-center gap-2">{!row.isHome ? (<>{icon}{text}</>) : null}</span>
            {onDelete && (
              <DelBtn onDelete={onDelete} id={e.id} theme={theme} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Кнопка удаления события (админ-режим) — видна при наведении на строку */
function DelBtn({ onDelete, id, theme }: { onDelete: (id: string) => void; id: string; theme: "light" | "dark" }) {
  return (
    <button
      onClick={() => onDelete(id)}
      className={cn(
        "absolute -top-0.5 right-0 hidden rounded border px-1 text-xs leading-4 group-hover/row:block",
        theme === "dark"
          ? "border-sline bg-s2 text-ink3 hover:border-live hover:text-live"
          : "border-zinc-200 bg-white text-zinc-400 hover:border-red-300 hover:text-red-500"
      )}
      title="Удалить событие"
      aria-label="Удалить событие"
    >
      ✕
    </button>
  );
}
