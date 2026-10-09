"use client";

// ============================================================
// Вкладка «Составы» карточки матча — по образцу futbol24.com
// (v1.0.41, HTML-эталон от владельца 2026-10-02).
//
//   • ≥768px — ОДНА зеркальная таблица на обе команды:
//     [№ | игрок хозяев | игрок гостей | №], f-match-lineups:
//     сначала «Основной состав», затем «Запасные», затем «Штаб»;
//     номера — у внешних краёв; имена хозяев прижаты влево,
//     гостей — вправо (зеркало); герб команды — один раз в шапке
//     (у каждого игрока своего лого/флага НЕТ, как в futbol24);
//   • <768px (мобильный и урезанный вариант) — ПОДВКЛАДКИ команд:
//     переключение, чей состав смотреть; состав одной команды
//     на всю ширину строки (имя + значки событий);
//   • имена — ВСЕГДА в одну строку (директива 2026-10-02): на
//     узких экранах мельче шрифт (12px) и мельче значки событий,
//     крайний случай — многоточие; перенос в «столбик букв»
//     запрещён — лучше усечь, чем развалить интерфейс;
//   • замены (futbol24 is-dimmed / is-on-pitch): ушедший с поля —
//     приглушён, вышедший — выделен полужирным;
//   • значки участия: ⚽ гол, карточки, ↑↓ замены, «А» ассист —
//     паттерн FlashScore, подписи минут в бейдже (тултип).
//
// Легаси-протоколы (все в старте): если «стартовых» больше лимита
// формата — показываем одной группой «Состав · заявка», не выдавая
// очевидно кривое деление за правду.
// ============================================================

import { Fragment, useState } from "react";
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
  /** v1.0.34: капитан команды в этом матче — пометка «(К)» в составе */
  isCaptain?: boolean;
  number: number | null;
  regRole: string;
  /** v1.0.55 (feedback55 №4): должность в штабе НА ЭТОТ МАТЧ — у игрока
   *  это «играющий сотрудник» (числится и в составе, и в штабе),
   *  у заявки-штаба — переопределение роли на матч */
  staffRole?: string | null;
}

export type LineupsMatch = MatchDTO & {
  events: EventRow[];
  lineups: LineupRow[];
  league: { id: string; name: string; walkoverScore: number; yellowCardLimit: number; format: string };
};

/** Зеркальная строка таблицы: № (26px) | игрок | игрок | № */
const ROW_GRID = "grid grid-cols-[26px_minmax(0,1fr)_minmax(0,1fr)_26px] items-center gap-x-2";

type TeamRef = MatchDTO["homeTeam"];

interface SideData {
  team: TeamRef;
  rows: LineupRow[];
  starters: LineupRow[];
  bench: LineupRow[];
  staff: LineupRow[];
  legacy: boolean;
}

function buildSide(m: LineupsMatch, team: TeamRef): SideData {
  const rows = m.lineups.filter((l) => l.teamId === team.id);
  const players = rows.filter((l) => l.regRole === "PLAYER");
  // v1.0.55 (feedback55 №4): штаб = заявка-штаб ИЛИ персона с должностью
  // НА МАТЧ (staffRole). Игрок с должностью — «играющий сотрудник»:
  // показывается и в составе (со своим номером), и в штабе (с ролью).
  // Подпись роли: staffRole (переопределение на матч) ?? regRole (заявка).
  const effRole = (l: LineupRow) => l.staffRole ?? l.regRole;
  const staff = rows
    .filter((l) => l.regRole !== "PLAYER" || l.staffRole != null)
    .sort((a, b) => Number(effRole(b) === "COACH") - Number(effRole(a) === "COACH"));
  const byNum = (a: LineupRow, b: LineupRow) => (a.number ?? 999) - (b.number ?? 999);
  const starters = players.filter((l) => l.isStarter).sort(byNum);
  const bench = players.filter((l) => !l.isStarter).sort(byNum);
  const limit = STARTER_LIMITS[m.league?.format ?? "FRIENDLY"] ?? 11;
  // легаси-протокол: «стартовых» больше, чем позволяет формат —
  // это заявка целиком, а не старт
  const legacy = starters.length > limit;
  return { team, rows, starters, bench, staff, legacy };
}

/** Секции одной стороны: «Состав · заявка» (легаси) или
 *  «Основной состав» → «Запасные» → «Штаб».
 *  v1.0.54 (feedback54 №9): счётчики количества (· 11, · 9, · 3) убраны —
 *  глазу легче, цифры считаются в протоколе, а не в подписи секции. */
function sideSections(s: SideData): { title: string; rows: LineupRow[] }[] {
  if (s.legacy) {
    return [{ title: "Состав · заявка", rows: s.rows }];
  }
  const list: { title: string; rows: LineupRow[] }[] = [
    { title: "Основной состав", rows: s.starters },
  ];
  if (s.bench.length > 0) list.push({ title: "Запасные", rows: s.bench });
  if (s.staff.length > 0) list.push({ title: "Штаб", rows: s.staff });
  return list;
}

/** Замена: «in» — вышел на поле (выделен), «out» — ушёл (приглушён) */
function subState(events: EventRow[], personId: string): "in" | "out" | null {
  for (const e of events) {
    if ((e.type === "SUB_OUT" && e.person.id === personId) || (e.type === "SUBSTITUTION" && e.assist?.id === personId)) return "out";
    if ((e.type === "SUB_IN" || e.type === "SUBSTITUTION") && e.person.id === personId) return "in";
  }
  return null;
}

export default function MatchLineupsTab({ m }: { m: LineupsMatch }) {
  // значки участия — только у сыгранных/идущих матчей
  const showMarks = m.status === "COMPLETED" || m.status === "LIVE";
  const home = buildSide(m, m.homeTeam);
  const away = buildSide(m, m.awayTeam);

  // мобильные подвкладки: показываем только команды с заявкой
  const [mobileSide, setMobileSide] = useState<"home" | "away">("home");
  const tabs = [
    { key: "home" as const, side: home },
    { key: "away" as const, side: away },
  ].filter((t) => t.side.rows.length > 0);
  const active = tabs.find((t) => t.key === mobileSide) ?? tabs[0];

  // секции зеркальной таблицы: сторона i-я секция хозяев ↔ i-я гостей
  const homeSecs = sideSections(home);
  const awaySecs = sideSections(away);
  const merged: { homeTitle: string; awayTitle: string; homeRows: LineupRow[]; awayRows: LineupRow[] }[] = [];
  for (let i = 0; i < Math.max(homeSecs.length, awaySecs.length); i++) {
    const hr = homeSecs[i]?.rows ?? [];
    const ar = awaySecs[i]?.rows ?? [];
    if (hr.length === 0 && ar.length === 0) continue;
    merged.push({
      homeTitle: homeSecs[i]?.title ?? "",
      awayTitle: awaySecs[i]?.title ?? "",
      homeRows: hr,
      awayRows: ar,
    });
  }

  return (
    <div className="text-[13px]">
      {/* ================= ≥768px: зеркальная таблица futbol24 ================= */}
      <div className="hidden min-[768px]:block">
        {/* шапка команд: [герб + имя] … [имя + герб] — клик ведёт на страницу */}
        <div className={cn(ROW_GRID, "px-2 pb-1 pt-2")}>
          <span />
          <button
            className="col-start-2 flex min-w-0 items-center gap-2 rounded-md py-1 text-left hover:text-gold"
            onClick={() => navigate(`/team/${m.homeTeam.id}`)}
          >
            <Crest name={m.homeTeam.name} id={m.homeTeam.id} logoUrl={m.homeTeam.logoUrl} size="xxs" />
            <span className="min-w-0 truncate text-[13px] font-bold text-ink2">{m.homeTeam.name}</span>
          </button>
          <button
            className="col-start-3 flex min-w-0 items-center justify-end gap-2 rounded-md py-1 text-right hover:text-gold"
            onClick={() => navigate(`/team/${m.awayTeam.id}`)}
          >
            <span className="min-w-0 truncate text-[13px] font-bold text-ink2">{m.awayTeam.name}</span>
            <Crest name={m.awayTeam.name} id={m.awayTeam.id} logoUrl={m.awayTeam.logoUrl} size="xxs" />
          </button>
          <span />
        </div>

        {merged.map((sec, si) => (
          <Fragment key={si}>
            {/* полоса секции (v1.0.54, feedback54 №7): БЕЗ разделительной
                линии и подложки — просто подпись, составы не «разрезаются»;
                подпись чуть светлее прежней (text-ink2 вместо ink3) */}
            <div className="flex min-h-7 items-center justify-between gap-3 px-2 py-1.5" data-lineup-section>
              {sec.homeTitle === sec.awayTitle || !sec.awayTitle ? (
                <span className="mx-auto text-[11px] font-bold uppercase tracking-[0.6px] text-ink2">{sec.homeTitle || sec.awayTitle}</span>
              ) : !sec.homeTitle ? (
                <span className="ml-auto text-[11px] font-bold uppercase tracking-[0.6px] text-ink2">{sec.awayTitle}</span>
              ) : (
                <>
                  <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-ink2">{sec.homeTitle}</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-ink2">{sec.awayTitle}</span>
                </>
              )}
            </div>
            {sec.homeRows.length === 0 && sec.awayRows.length === 0 && (
              <p className={cn(ROW_GRID, "border-t border-sline/40")}>
                <span />
                <span className="col-start-2 py-1.5 text-xs text-ink3">не отмечены</span>
                <span className="col-start-3" />
                <span />
              </p>
            )}
            {Array.from({ length: Math.max(sec.homeRows.length, sec.awayRows.length) }, (_, i) => {
              const h = sec.homeRows[i];
              const a = sec.awayRows[i];
              return (
                <div key={`${h?.id ?? "h"}-${a?.id ?? "a"}-${i}`} className={cn(ROW_GRID, "border-t border-sline/40")}>
                  <span className="col-start-1 py-1.5 text-center tabular text-xs leading-none text-ink3">{h?.number ?? (h ? "—" : "")}</span>
                  <PlayerCell l={h} m={m} showMarks={showMarks} side="left" className="col-start-2" />
                  <PlayerCell l={a} m={m} showMarks={showMarks} side="right" className="col-start-3" />
                  <span className="col-start-4 py-1.5 text-center tabular text-xs leading-none text-ink3">{a?.number ?? (a ? "—" : "")}</span>
                </div>
              );
            })}
          </Fragment>
        ))}
        {merged.length === 0 && <p className="px-2 py-3 text-xs text-ink3">Заявки нет</p>}
      </div>

      {/* ================= <768px: подвкладки команд ================= */}
      <div className="min-[768px]:hidden">
        {tabs.length > 1 && (
          <div className="flex border-b border-sline/60 px-2" data-lineup-subtabs>
            {tabs.map(({ key, side }) => {
              const isActive = active?.key === key;
              return (
                <button
                  key={key}
                  data-subtab
                  data-active={isActive ? "true" : undefined}
                  className={cn(
                    "relative flex min-w-0 flex-1 items-center justify-center gap-1.5 px-1 py-2.5",
                    isActive ? "text-gold" : "text-ink2 hover:text-ink"
                  )}
                  onClick={() => setMobileSide(key)}
                >
                  <Crest name={side.team.name} id={side.team.id} logoUrl={side.team.logoUrl} size="xxs" />
                  <span className="min-w-0 truncate text-[13px] font-semibold">{side.team.name}</span>
                  {isActive && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-gold" />}
                </button>
              );
            })}
          </div>
        )}
        {active ? (
          <div className="px-2 py-1">
            {sideSections(active.side).map((sec) => (
              <Fragment key={sec.title}>
                <p className="flex min-h-7 items-center px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.6px] text-ink2" data-lineup-section>
                  {sec.title}
                </p>
                {sec.rows.length === 0 && sec.title.startsWith("Основной") && <p className="border-t border-sline/40 px-1 py-1.5 text-xs text-ink3">не отмечены</p>}
                {sec.rows.map((l) => (
                  <div key={l.id} className="flex items-start gap-2 border-t border-sline/40">
                    <span className="w-6 shrink-0 py-1.5 text-center tabular text-xs leading-none text-ink3">{l.number ?? "—"}</span>
                    <PlayerCell l={l} m={m} showMarks={showMarks} side="left" stackMarks className="min-w-0 flex-1" />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        ) : (
          <p className="p-3 text-xs text-ink3">Заявки нет</p>
        )}
      </div>
    </div>
  );
}

/** Ячейка игрока зеркальной таблицы / мобильной строки:
 *  имя в ОДНУ строку (truncate). Значки событий — ВПЛОТНУЮ к имени
 *  (фидбек 2026-10-06: события должны быть РЯДОМ с футболистом, а не
 *  «посередине таблицы»): у хозяев — сразу после имени, у гостей —
 *  непосредственно перед ним. Замены: ушедший приглушён, вышедший
 *  выделен (futbol24 is-dimmed / is-on-pitch). stackMarks (мобильный
 *  <768px, директива 2026-10-02: «лучше уменьшить/перенести значки,
 *  чем резать имя»): имя занимает всю первую строку, значки событий
 *  переносятся на ВТОРУЮ строку вправо. */
function PlayerCell({
  l,
  m,
  showMarks,
  side,
  stackMarks,
  className,
}: {
  l: LineupRow | undefined;
  m: LineupsMatch;
  showMarks: boolean;
  side: "left" | "right";
  stackMarks?: boolean;
  className?: string;
}) {
  if (!l) return <span className={className} />;
  if (l.regRole !== "PLAYER") return <StaffCell l={l} side={side} className={className} />;
  const st = subState(m.events, l.person.id);
  const marks = showMarks ? <PlayerEventMarks events={m.events} personId={l.person.id} /> : null;
  const marksNode = stackMarks ? (
    marks ? <span className="ml-auto flex min-w-0 flex-wrap justify-end gap-0.5">{marks}</span> : null
  ) : (
    marks
  );
  return (
    <button
      className={cn(
        "flex min-w-0 items-center gap-1.5 py-1.5 text-left",
        side === "right" && "justify-end",
        stackMarks && "flex-wrap gap-y-1",
        className
      )}
      data-lineup-player
      onClick={() => navigate(`/player/${l.person.id}`)}
    >
      {/* строка имени: [имя (truncate) + бейдж «К» + значки] — у хозяев
          прижаты ВЛЕВО и идут ПОДРЯД (имя не растягивается — значки
          glued к нему); у гостей — зеркально ВПРАВО. При stackMarks
          имя занимает первую строку целиком, значки — на второй. */}
      <span className={cn("flex min-w-0 flex-1 items-center gap-1.5", side === "right" && "justify-end", stackMarks && "basis-full")}>
        {side === "right" && !stackMarks && marksNode}
        <span
          data-lineup-name
          className={cn(
            "min-w-0 truncate text-[12px] min-[480px]:text-[13px]",
            // v1.0.54 (feedback54 №7): основной состав — СВЕТЛЫМ (text-ink),
            // запасные — приглушённее (ink2) — иерархия читается без линий;
            // замены: вышедший — ярче, ушедший — ещё тусклее
            st === "out" ? "text-ink3" : st === "in" ? "font-semibold text-ink" : l.isStarter ? "text-ink" : "text-ink2"
          )}
        >
          {l.person.name}
        </span>
        {l.isCaptain && (
          <span className="shrink-0 rounded bg-gold/15 px-1 font-mono text-[10px] font-bold leading-4 text-gold" title="Капитан команды в этом матче">
            К
          </span>
        )}
        {side === "left" && !stackMarks && marksNode}
      </span>
      {stackMarks && marksNode}
    </button>
  );
}

/** Ячейка сотрудника штаба: аватар + имя + роль (у гостей — зеркально).
 *  v1.0.55: роль — должность на этот матч (staffRole) либо роль заявки */
function StaffCell({ l, side, className }: { l: LineupRow; side: "left" | "right"; className?: string }) {
  const roleCode = l.staffRole ?? l.regRole;
  const role = REGISTRATION_ROLE_LABELS[roleCode] ?? roleCode;
  return (
    <button
      className={cn("flex min-w-0 items-center gap-2 py-1.5 text-left", side === "right" && "justify-end", className)}
      onClick={() => navigate(`/player/${l.person.id}`)}
    >
      {side === "right" && (
        <span className="shrink-0 text-[10px] font-medium min-[480px]:text-[11px] text-ink3">{role}</span>
      )}
      <span className="min-w-0 truncate text-[12px] min-[480px]:text-[13px] text-ink2">{l.person.name}</span>
      <Avatar name={l.person.name} id={l.person.id} size="xs" />
      {side === "left" && (
        <span className="shrink-0 text-[10px] font-medium min-[480px]:text-[11px] text-ink3">{role}</span>
      )}
    </button>
  );
}

/** Значки участия игрока в событиях матча: ⚽ гол, карточки, ↑↓ замены,
 *  «А» ассист. Компактные бейджи (v1.0.41): на узких экранах мельче
 *  шрифт и иконки — имена игроков важнее (директива 2026-10-02). */
export function PlayerEventMarks({ events, personId }: { events: EventRow[]; personId: string }) {
  const GOALS = new Set(["GOAL", "PENALTY", "OWN_GOAL"]);
  type Mark = { minute: number; label: string; node: React.ReactNode; title: string };
  const marks: Mark[] = [];
  const min = (e: EventRow) => e.stoppage ? `${e.minute}+${e.stoppage}′` : `${e.minute}′`;
  const ballCls = "h-2.5 w-2.5 min-[480px]:h-3 min-[480px]:w-3";
  const cardCls = "h-2.5 w-1.5 min-[480px]:h-3 min-[480px]:w-2";
  const arrowCls = "h-2.5 w-2.5 min-[480px]:h-3 min-[480px]:w-3";

  for (const e of events) {
    const key = e.minute + (e.stoppage ?? 0);
    if (e.person.id === personId) {
      if (GOALS.has(e.type)) marks.push({ minute: key, label: min(e), title: `Гол ${min(e)}`, node: <BallIcon className={cn(ballCls, "text-gold")} /> });
      if (e.type === "YELLOW_CARD") marks.push({ minute: key, label: min(e), title: `Жёлтая карточка ${min(e)}`, node: <CardIcon kind="yellow" className={cardCls} /> });
      if (e.type === "RED_CARD") marks.push({ minute: key, label: min(e), title: `Красная карточка ${min(e)}`, node: <CardIcon kind="red" className={cardCls} /> });
      if (e.type === "SUBSTITUTION" || e.type === "SUB_IN") marks.push({ minute: key, label: min(e), title: `Вышел на поле ${min(e)}`, node: <ArrowUp className={cn(arrowCls, "text-ok")} /> });
      if (e.type === "SUB_OUT") marks.push({ minute: key, label: min(e), title: `Ушёл с поля ${min(e)}`, node: <ArrowDown className={cn(arrowCls, "text-live")} /> });
    }
    if (e.assist?.id === personId) {
      if (e.type === "SUBSTITUTION") marks.push({ minute: key, label: min(e), title: `Ушёл с поля ${min(e)}`, node: <ArrowDown className={cn(arrowCls, "text-live")} /> });
      else if (GOALS.has(e.type)) marks.push({ minute: key, label: min(e), title: `Ассист ${min(e)}`, node: <span className="text-[9px] font-black text-gold">А</span> });
    }
  }
  if (marks.length === 0) return null;
  marks.sort((a, b) => a.minute - b.minute);
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {marks.map((mk, i) => (
        <span
          key={i}
          title={mk.title}
          data-lineup-mark
          className="flex shrink-0 items-center gap-0.5 rounded bg-s2/70 px-0.5 py-0.5 font-mono text-[9px] leading-none text-ink2 min-[480px]:text-[10px]"
        >
          {mk.node}
          <span>{mk.label}</span>
        </span>
      ))}
    </span>
  );
}
