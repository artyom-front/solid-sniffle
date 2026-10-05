"use client";

// ============================================================
// MatchTimeline — «Протокол» матча по образцу futbol24.com
// (v1.0.41, HTML-эталон от владельца 2026-10-02).
//
// 4-колоночная таблица f-match-summary:
//   [ минута | события ХОЗЯЕВ | бегущий счёт | события ГОСТЕЙ ]
//   • минута — ВСЕГДА у левого края (у событий обеих команд,
//     как в futbol24): 12px/700 tabular;
//   • хозяева — имя → иконка (блок прижат ВЛЕВО), гости —
//     зеркально: иконка → имя (блок прижат ВПРАВО);
//   • бегущий счёт — ЦЕНТРАЛЬНАЯ колонка, только у голов («1:0»);
//     на мобиле (<768px) центральной колонки нет — счёт
//     инлайн-бейджем рядом с иконкой (ширина имени важнее);
//   • замена — две строки в ячейке: «↓ ушедший» красный /
//     «↑ вышедший» зелёный, блок на стороне команды;
//   • полосы «1-й тайм / Перерыв 0:0 / 2-й тайм / Завершён 0:0» —
//     полноширинные (аналог HT/FT-строк futbol24);
//   • имена — В ОДНУ СТРОКУ при любой ширине (директива
//     2026-10-02): 12px → 13px на ≥480px, truncate; иконки
//     мельчают на узких экранах, а не рушат строку.
// v1.0.44 (фидбек 2026-10-05, эталон futbol24): имена в протоколе —
//   КОРОТКИЕ «И. Иванов» (инициал имени + фамилия; полное — в
//   title-тултипе), ассист — отдельное приглушённое имя РЯДОМ с
//   автором без скобок (как S. Gudelj + A. Terzić в эталоне).
// Сетка ОДНА на все вьюпорты: явные col-start/row-start (грабля
// v1.0.39 Р-20 — grid-auto-flow с display:none-детьми сбивается),
// мобильный шаблон 2 колонки, ≥768px — 4 колонки.
// ============================================================

import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { EventIcon } from "./EventIcons";
import { EVENT_SHORT_LABELS } from "@/lib/labels";

/** Короткое имя протокола: «Иванов Иван» → «И. Иванов»
 * (эталон futbol24: S. Gudelj). Формат имени по всему API —
 * «Фамилия Имя [Отчество]»; одно слово возвращается как есть. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  const [last, first] = parts;
  return `${(first[0] ?? "").toUpperCase()}. ${last}`;
}

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

/** Сортировка тайм-оси. Ключ: (тайм, минута) — события первого тайма
 *  (минута ≤ 45, включая компенсированное время 45+X) ВСЕГДА раньше
 *  событий второго тайма (46+). Иначе 45+3 «обгоняло» 46-ю минуту
 *  и вставало после «Перерыва» — неверно физически. */
function sortKey(e: TimelineEventDTO): [number, number] {
  return [e.minute <= 45 ? 0 : 1, effMinute(e)];
}

/** Принадлежит событие первому тайму (включая 45+X)? */
function isFirstHalf(e: TimelineEventDTO): boolean {
  return e.minute <= 45;
}

function minuteLabel(e: { minute: number; stoppage?: number | null }): string {
  return e.stoppage ? `${e.minute}+${e.stoppage}′` : `${e.minute}′`;
}

/** Компоновка строк: полосы «1-й тайм» / «Перерыв» / «2-й тайм» /
 *  «Завершён», склейка легаси-замен, бегущий счёт. Экспортирована для
 *  юнит-тестов сортировки (45+X до «Перерыва»). */
export function buildRows(events: TimelineEventDTO[], homeTeamId: string, status: string, homeScore?: number | null, awayScore?: number | null): RenderRow[] {
  const sorted = [...events].sort((a, b) => {
    const [ha, ma] = sortKey(a);
    const [hb, mb] = sortKey(b);
    return ha - hb || ma - mb;
  });
  const consumed = new Set<string>();
  const rows: RenderRow[] = [];
  let home = 0;
  let away = 0;
  let halftimeInserted = false;

  // Полоса «1-й тайм» — в самом начале оси; пустому запланированному
  // матчу полосы не нужны (компонент его вообще не рендерит).
  const showSkeleton = sorted.length > 0 || status === "COMPLETED" || status === "WALKOVER";
  if (showSkeleton) {
    rows.push({ kind: "marker", label: "1-й тайм", score: null });
  }

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

    // маркеры «Перерыв» + «2-й тайм» — перед ПЕРВЫМ событием второго
    // тайма (минута ≥ 46). События добавленного времени первого тайма
    // (45+X) остаются ВЫШЕ полос: перерыв наступает после конца
    // первого тайма целиком.
    if (!isFirstHalf(e) && !halftimeInserted) {
      halftimeInserted = true;
      rows.push({ kind: "marker", label: "Перерыв", score: `${home}:${away}` });
      rows.push({ kind: "marker", label: "2-й тайм", score: null });
    }

    // легаси-пары SUB_OUT+SUB_IN → одна строка замены
    if (e.type === "SUB_OUT") {
      const partner = sorted.find(
        (x) => x.id !== e.id && !consumed.has(x.id) && x.type === "SUB_IN" && x.teamId === e.teamId && Math.abs(effMinute(x) - effMinute(e)) <= 1
      );
      if (partner) {
        consumed.add(partner.id);
        rows.push({ kind: "sub", e: partner, out: e, isHome: e.teamId === homeTeamId });
        continue;
      }
    }

    // SUBSTITUTION (одна строка на замену): personId — вышедший,
    // assistPersonId — ушедший → блок-замена из двух строк (v1.0.41,
    // образец futbol24: substitution-блок «in — зелёный / out — приглушён»)
    if (e.type === "SUBSTITUTION") {
      rows.push({
        kind: "sub",
        e,
        out: e.assist ? { ...e, person: e.assist } : null,
        isHome: e.teamId === homeTeamId,
      });
      continue;
    }

    rows.push({ kind: "event", e, isHome: e.teamId === homeTeamId, score: goalScore(e) });
  }

  // Завершённый матч: полосы «Перерыв» и «2-й тайм» показываем ВСЕГДА —
  // даже если во втором тайме не было событий (или их нет вовсе):
  // читателю должно быть видно, что матч сыгран до конца.
  if (!halftimeInserted && (status === "COMPLETED" || status === "WALKOVER")) {
    rows.push({ kind: "marker", label: "Перерыв", score: `${home}:${away}` });
    rows.push({ kind: "marker", label: "2-й тайм", score: null });
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
  // Завершённый матч без событий — всё равно рендерим ось с маркерами
  // «1-й тайм / Перерыв 0:0 / 2-й тайм / Завершён» (пустой протокол ≠ сыгранный тайм).
  if (events.length === 0 && status !== "COMPLETED") return null;
  const rows = buildRows(events, homeTeamId, status, homeScore, awayScore);

  // ---------- Темы ----------
  const t = {
    row: theme === "dark" ? "border-sline/40" : "border-zinc-100",
    markerBg: theme === "dark" ? "bg-s2/40" : "bg-zinc-100/80",
    minute: theme === "dark" ? "text-ink" : "text-zinc-800",
    name: theme === "dark" ? "text-ink" : "text-zinc-800",
    assist: theme === "dark" ? "text-ink3" : "text-zinc-400",
    note: theme === "dark" ? "text-ink3" : "text-zinc-400",
    markerLabel: theme === "dark" ? "text-ink3" : "text-zinc-500",
    markerScore: theme === "dark" ? "text-gold" : "text-emerald-700",
    subIn: theme === "dark" ? "text-ok" : "text-emerald-600",
    subOut: theme === "dark" ? "text-live" : "text-red-500",
  };

  /** Имя персоны: кликабельно, ВСЕГДА в одну строку (truncate —
   *  директива 2026-10-02: лучше многоточие, чем развал строки).
   *  v1.0.44: показывается КОРОТКОЕ имя «И. Иванов» (фидбек
   *  2026-10-05, эталон futbol24), полное — в title-тултипе. */
  const Person = ({ p, className, title }: { p: { id: string; name: string }; className?: string; title?: string }) =>
    onPersonClick ? (
      <button
        onClick={(ev) => { ev.stopPropagation(); onPersonClick(p.id); }}
        title={title ?? p.name}
        className={cn("min-w-0 truncate text-left hover:underline", className)}
      >
        {shortName(p.name)}
      </button>
    ) : (
      <span title={title ?? p.name} className={cn("min-w-0 truncate", className)}>
        {shortName(p.name)}
      </span>
    );

  /** Инлайн-бейдж бегущего счёта (мобильный режим, <768px): «1:0»
   *  12px/700 рядом с иконкой события (на ≥768px счёт в центральной
   *  колонке — бейдж скрыт) */
  const RunScore = ({ score, dark, className }: { score: string | null; dark: boolean; className?: string }) =>
    score ? (
      <span
        data-run-score
        className={cn(
          "shrink-0 rounded-md px-1.5 py-0.5 tabular text-xs font-bold leading-none",
          dark ? "bg-s2 text-gold" : "bg-zinc-100 text-emerald-700",
          className
        )}
        title="Счёт после гола"
      >
        {score}
      </span>
    ) : null;

  /** МИНУТА — у левого края (futbol24): 12px/700 tabular */
  const Minute = ({ e }: { e: { minute: number; stoppage?: number | null } }) => (
    <span data-minute className={cn("col-start-1 row-start-1 shrink-0 tabular text-xs font-bold leading-none", t.minute)}>
      {minuteLabel(e)}
    </span>
  );

  /** Строка замены: ↓ ушёл (красный, приглушён) / ↑ вышел (зелёный),
   *  ДВЕ строки, имена в одну строку */
  const SubLine = ({ person, dir }: { person: { id: string; name: string } | null; dir: "out" | "in" }) => {
    if (!person) return null;
    return (
      <span className="flex min-w-0 items-center gap-1">
        {dir === "out" ? (
          <ArrowDown className={cn("h-3 w-3 shrink-0", t.subOut)} aria-hidden />
        ) : (
          <ArrowUp className={cn("h-3 w-3 shrink-0", t.subIn)} aria-hidden />
        )}
        <Person p={person} className={cn("text-[12px] min-[480px]:text-[13px]", dir === "out" ? cn("opacity-75", t.assist) : cn("font-medium", t.name))} />
      </span>
    );
  };

  return (
    <div className={className}>
      {rows.map((row, i) => {
        // ---------- Полоса периода: «1-й тайм» / «ПЕРЕРЫВ 0:0» /
        // «2-й тайм» / «Завершён 0:0» — лейбл слева, счёт справа ----------
        if (row.kind === "marker") {
          return (
            <div key={`m${i}`} data-timeline-marker className={cn("flex min-h-6 items-center gap-2 border-t px-3 py-1", t.row, t.markerBg)}>
              <span className={cn("text-[11px] font-bold uppercase tracking-[0.6px]", t.markerLabel)}>{row.label}</span>
              {row.score && <span className={cn("ml-auto shrink-0 tabular text-xs font-bold", t.markerScore)}>{row.score}</span>}
            </div>
          );
        }

        // ---------- Замена: [минута] + две строки (ушёл ↓ / вышел ↑),
        //     блок на стороне команды (futbol24: substitution-блок) ----------
        if (row.kind === "sub") {
          const subLines = (
            <span className={cn("flex min-w-0 flex-col items-start gap-0.5", !row.isHome && "items-end")}>
              <SubLine person={row.out?.person ?? null} dir="out" />
              <SubLine person={row.e.person} dir="in" />
            </span>
          );
          return (
            <div
              key={row.e.id}
              data-timeline-event
              className={cn(
                "relative grid min-h-10 grid-cols-[44px_minmax(0,1fr)] items-center gap-x-1.5 border-t px-3 py-1.5",
                "min-[768px]:grid-cols-[48px_minmax(0,1fr)_52px_minmax(0,1fr)] min-[768px]:gap-x-2",
                t.row,
                onDelete && "group/row"
              )}
            >
              <Minute e={row.e} />
              {row.isHome ? (
                <span className="col-start-2 row-start-1 flex min-w-0 items-center">{subLines}</span>
              ) : (
                <span className="col-start-2 row-start-1 flex min-w-0 items-center justify-end min-[768px]:col-start-4">{subLines}</span>
              )}
              {onDelete && <DelBtn onDelete={onDelete} id={row.e.id} theme={theme} />}
            </div>
          );
        }

        // ---------- Обычное событие: хозяева — блок ВЛЕВО
        //     [имя][иконка] + счёт в центре; гости — блок ВПРАВО
        //     зеркально [иконка][имя] (futbol24) ----------
        const e = row.e;
        const isGoal = GOAL_TYPES.has(e.type);
        const note = EVENT_SHORT_LABELS[e.type];
        const iconNode = <span className="flex shrink-0 items-center">{<EventIcon type={e.type} />}</span>;

        const nameNode = <Person p={e.person} className={cn("text-[12px] min-[480px]:text-[13px]", isGoal ? "font-semibold" : "font-medium", t.name)} />;
        // v1.0.44 (эталон futbol24): ассист — отдельное приглушённое имя
        // РЯДОМ с автором (S. Gudelj + A. Terzić), НЕ в скобках
        const assistNode = e.assist ? (
          <Person
            p={e.assist}
            title={`Ассист: ${e.assist.name}`}
            className={cn("shrink-0 truncate text-[11px]", t.assist)}
          />
        ) : null;
        const scoreInline = <RunScore score={row.score} dark={theme === "dark"} className="min-[768px]:hidden" />;
        const noteNode = note ? <span className={cn("shrink-0 text-[11px]", t.note)}>{note}</span> : null;

        return (
          <div
            key={e.id}
            data-timeline-event
            className={cn(
              "relative grid min-h-8 grid-cols-[44px_minmax(0,1fr)] items-center gap-x-1.5 border-t px-3 py-1",
              "min-[768px]:grid-cols-[48px_minmax(0,1fr)_52px_minmax(0,1fr)] min-[768px]:gap-x-2",
              t.row,
              onDelete && "group/row"
            )}
          >
            <Minute e={e} />
            {/* хозяева: [имя][ассист][иконка] — блок игрока прижат ВЛЕВО,
                иконка ближе к центру (эталон futbol24: homePlayer → homeIcon) */}
            {row.isHome ? (
              <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-x-1.5">
                {nameNode}
                {assistNode}
                {iconNode}
                {scoreInline}
                {noteNode}
              </span>
            ) : (
              /* гости зеркально: [note][score][иконка][имя][ассист] —
                  иконка ближе к центру, блок игрока прижат ВПРАВО */
              <span className="col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-x-1.5 min-[768px]:col-start-4">
                {noteNode}
                {scoreInline}
                {iconNode}
                {nameNode}
                {assistNode}
              </span>
            )}
            {/* центральная колонка счёта — только ≥768px (мобильный
                счёт — инлайн-бейдж выше) */}
            {row.score && (
              <span
                data-center-score
                className={cn("col-start-3 row-start-1 hidden min-[768px]:block min-[768px]:text-center min-[768px]:tabular min-[768px]:text-[13px] min-[768px]:font-bold", t.markerScore)}
                title="Счёт после гола"
              >
                {row.score}
              </span>
            )}
            {onDelete && <DelBtn onDelete={onDelete} id={e.id} theme={theme} />}
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
