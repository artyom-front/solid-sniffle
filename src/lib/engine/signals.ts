// «Эмоции турнира»: производные сигналы для livescore-ленты и карточки матча.
// Всё считается из тех же данных (матчи, события, заявки, дисквалификации) —
// без новых сущностей: стрики, важные матчи, пропуски бомбардира, смена тренера.

import { db } from "@/lib/db";
import { STREAK_MIN } from "@/lib/labels";
import type { StandingRow } from "./standings";

// ---------- Типы ----------

export interface Streak {
  /// код результата: W | D | L | T (техпоражение) | w (техпобеда)
  code: "W" | "D" | "L" | "T" | "w";
  /// длина серии, считается от последнего сыгранного матча назад
  count: number;
}

export interface MatchSignal {
  /// позиция в таблице на момент матча (текущая таблица)
  position: number | null;
  /// очки
  points: number | null;
  /// сыграно матчей (защита от «важности» в начале сезона)
  games: number | null;
  /// серия результатов
  streak: Streak | null;
  /// лучший бомбардир команды в сезоне
  topScorer: { personId: string; name: string; goals: number } | null;
  /// бомбардир дисквалифицирован — не сыграет
  topScorerOut: boolean;
  /// у клуба сменился тренер (последние 30 дней)
  newCoach: { personId: string; name: string } | null;
}

export interface MatchSignals {
  home: MatchSignal;
  away: MatchSignal;
  /// матч «за призы»: топ-соединение или финиш турнира (≤3 туров) и близкие соперники
  important: { flag: boolean; reason: string };
  /// всего туров в стадии и сколько осталось после этого матча
  roundsLeft: number | null;
}

export interface SignalsContext {
  standings: StandingRow[];
  /// все матчи сезона (для стриков и числа туров)
  matches: {
    id: string;
    round: number | null;
    homeTeamId: string;
    awayTeamId: string;
    status: string;
    walkoverType: string | null;
    homeScore: number | null;
    awayScore: number | null;
  }[];
  /// лучший бомбардир каждой команды сезона
  topScorers: Map<string, { personId: string; name: string; goals: number }>;
  /// активно дисквалифицированные (personId → осталось матчей)
  suspended: Map<string, number>;
  /// новые тренеры последних 30 дней по командам
  newCoaches: Map<string, { personId: string; name: string }>;
}

// ---------- Стрики ----------

const RESULT_CODE: Record<string, "W" | "D" | "L" | "T" | "w" | null> = {
  W: "W",
  D: "D",
  L: "L",
  T: "T",
  w: "w",
};

/**
 * Текущая серия команды: идём от последнего сыгранного матча назад,
 * пока код результата совпадает. form из standings обрезан до 5 —
 * поэтому серию считаем по полной истории матчей.
 */
export function computeStreak(
  matches: SignalsContext["matches"],
  teamId: string
): Streak | null {
  const played = matches
    .filter(
      (m) =>
        (m.homeTeamId === teamId || m.awayTeamId === teamId) &&
        (m.status === "COMPLETED" || m.status === "WALKOVER")
    )
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0));

  // результаты с точки зрения команды
  const results: ("W" | "D" | "L" | "T" | "w")[] = [];
  for (const m of played) {
    const isHome = m.homeTeamId === teamId;
    if (m.status === "WALKOVER" && m.walkoverType) {
      if (m.walkoverType === "BOTH") {
        results.push("T");
      } else {
        const homeWon = m.walkoverType === "AWAY";
        const won = isHome === homeWon;
        results.push(won ? "w" : "T");
      }
      continue;
    }
    const my = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
    const rival = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
    if (my > rival) results.push("W");
    else if (my < rival) results.push("L");
    else results.push("D");
  }

  if (results.length === 0) return null;
  const last = results[results.length - 1];
  let count = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] !== last) break;
    count++;
  }
  // возвращаем серию любой длины (для превью полезна и короткая),
  // а «эмоцией» (🔥/❄) она становится при STREAK_MIN+ — порог применяется в UI
  return { code: last, count };
}

// ---------- Контекст сезона ----------

/** Собрать всё необходимое для сигналов по сезону (один проход по БД). */
export async function buildSignalsContext(seasonId: string): Promise<SignalsContext> {
  const matches = await db.match.findMany({
    where: { stage: { seasonId } },
    select: {
      id: true, round: true, homeTeamId: true, awayTeamId: true,
      status: true, walkoverType: true, homeScore: true, awayScore: true,
    },
  });

  // голы по игрокам сезона (только COMPLETED — инвариант Epic 2)
  const goalEvents = await db.matchEvent.findMany({
    where: { match: { status: "COMPLETED", stage: { seasonId } }, type: { in: ["GOAL", "PENALTY"] } },
    select: { personId: true, person: { select: { firstName: true, lastName: true } }, teamId: true },
  });
  const topScorers = new Map<string, { personId: string; name: string; goals: number }>();
  // полный подсчёт: голы каждого игрока, затем лидер каждой команды
  const goalsByTeam = new Map<string, Map<string, { name: string; goals: number }>>();
  for (const e of goalEvents) {
    if (!goalsByTeam.has(e.teamId)) goalsByTeam.set(e.teamId, new Map());
    const inner = goalsByTeam.get(e.teamId)!;
    const key = e.personId;
    const prev = inner.get(key);
    inner.set(key, {
      name: `${e.person.lastName} ${e.person.firstName}`,
      goals: (prev?.goals ?? 0) + 1,
    });
  }
  for (const [teamId, inner] of goalsByTeam) {
    let best: { personId: string; name: string; goals: number } | null = null;
    for (const [personId, v] of inner) {
      if (!best || v.goals > best.goals) best = { personId, name: v.name, goals: v.goals };
    }
    if (best && best.goals > 0) topScorers.set(teamId, best);
  }

  // активные дисквалификации сезона
  const suspensions = await db.suspension.findMany({
    where: { seasonId, isActive: true },
    select: { personId: true, matchesTotal: true, matchesServed: true, isLifetime: true },
  });
  const suspended = new Map<string, number>();
  for (const s of suspensions) {
    const left = s.isLifetime ? 99 : s.matchesTotal - s.matchesServed;
    if (left > 0) suspended.set(s.personId, Math.min(left, 99));
  }

  // смена тренера: действующий COACH стартовал в последние 30 дней
  const monthAgo = new Date(Date.now() - 30 * 86400000);
  const regs = await db.registration.findMany({
    where: { seasonId, role: "COACH", startDate: { gte: monthAgo }, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
    include: { person: { select: { firstName: true, lastName: true } } },
  });
  const newCoaches = new Map<string, { personId: string; name: string }>();
  for (const r of regs) {
    newCoaches.set(r.teamId, { personId: r.personId, name: `${r.person.lastName} ${r.person.firstName}` });
  }

  return { standings: [], matches, topScorers, suspended, newCoaches };
}

// ---------- Сигналы матча ----------

/**
 * Посчитать сигналы конкретного матча (по готовому контексту).
 * Матч может быть любым сезона — позиции берём из текущей таблицы.
 */
export function matchSignals(match: {
  id: string;
  round: number | null;
  homeTeamId: string;
  awayTeamId: string;
}, ctx: SignalsContext, standings: StandingRow[]): MatchSignals {
  const maxRound = ctx.matches.reduce((mx, m) => Math.max(mx, m.round ?? 0), 0);
  const roundsLeft = match.round ? Math.max(0, maxRound - match.round) : null;

  const side = (teamId: string): MatchSignal => {
    const row = standings.find((r) => r.teamId === teamId) ?? null;
    const streak = computeStreak(ctx.matches, teamId);
    const topScorer = ctx.topScorers.get(teamId) ?? null;
    const topScorerOut = !!topScorer && ctx.suspended.has(topScorer.personId);
    const newCoach = ctx.newCoaches.get(teamId) ?? null;
    return {
      position: row?.position ?? null,
      points: row?.points ?? null,
      games: row?.games ?? null,
      streak,
      topScorer,
      topScorerOut,
      newCoach,
    };
  };

  const home = side(match.homeTeamId);
  const away = side(match.awayTeamId);

  // важность: 1-е против 2-го — матч за золотые медали;
  // или до конца ≤3 туров и близкие соперники (разница мест ≤2, очков ≤4);
  // или обе команды в призовой зоне (пары из топ-4).
  // Защита от шума: команды должны сыграть достаточно матчей.
  let important = { flag: false, reason: "" };
  if (home.position && away.position) {
    const minGames = Math.min(home.games ?? 0, away.games ?? 0);
    const goldClash = (home.position === 1 && away.position === 2) || (home.position === 2 && away.position === 1);
    const posSum = home.position + away.position;
    const closeRace =
      roundsLeft !== null &&
      roundsLeft <= 3 &&
      minGames >= 3 &&
      Math.abs(home.position - away.position) <= 2 &&
      Math.abs((home.points ?? 0) - (away.points ?? 0)) <= 4;
    const prizeZone =
      posSum <= 7 &&
      minGames >= 4 &&
      (home.points ?? 0) >= 5 &&
      (away.points ?? 0) >= 5 &&
      roundsLeft !== null &&
      roundsLeft <= 5;
    if (goldClash) {
      important = { flag: true, reason: "Матч за 1-е место — лидеры встречаются лицом к лицу" };
    } else if (closeRace) {
      important = {
        flag: true,
        reason: `Борьба за место в таблице: №${home.position} против №${away.position}, до конца ${roundsLeft} ${plural(roundsLeft, "тур", "тура", "туров")}`,
      };
    } else if (prizeZone) {
      important = { flag: true, reason: `Соперники в борьбе за призовые места (№${home.position} и №${away.position})` };
    }
  }

  return { home, away, important, roundsLeft };
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export { plural };

/** Серия «горячая» (победы) — огонь в ленте, порог STREAK_MIN (5+) */
export function isHotStreak(s: Streak | null): boolean {
  return !!s && (s.code === "W" || s.code === "w") && s.count >= STREAK_MIN;
}

/** Серия «кризис» (поражения/техпоражения) — снежинка, порог STREAK_MIN (5+) */
export function isColdStreak(s: Streak | null): boolean {
  return !!s && (s.code === "L" || s.code === "T") && s.count >= STREAK_MIN;
}
