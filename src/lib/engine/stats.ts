// Milestone 3 + 5: аналитика игроков и судей.
// Инвариант Epic 2: голы/карточки WO-матчей НЕ учитываются в личной статистике
// (WHERE match.walkover_type IS NULL — здесь: status = 'COMPLETED').

import { db } from "@/lib/db";

export interface PlayerStatRow {
  personId: string;
  name: string;
  teamName: string;
  teamId: string;
  position: string | null;
  games: number;
  goals: number;
  penalties: number;
  ownGoals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  cleanSheets: number;
}

/**
 * Полная статистика игроков сезона. Только COMPLETED-матчи:
 * события технических поражений исключены полностью.
 */
export async function seasonPlayerStats(seasonId: string): Promise<PlayerStatRow[]> {
  const events = await db.matchEvent.findMany({
    where: {
      match: { status: "COMPLETED", stage: { seasonId } }, // ← фильтр WO
    },
    include: { person: true, team: true },
  });

  const lineups = await db.lineupEntry.findMany({
    where: { match: { status: "COMPLETED", stage: { seasonId } } },
    include: { person: true, team: true },
  });

  const map = new Map<string, PlayerStatRow>();
  const get = (personId: string, teamId: string, name: string, teamName: string, position: string | null) => {
    let row = map.get(personId);
    if (!row) {
      row = {
        personId, name, teamName, teamId, position,
        games: 0, goals: 0, penalties: 0, ownGoals: 0, assists: 0,
        yellowCards: 0, redCards: 0, cleanSheets: 0,
      };
      map.set(personId, row);
    }
    return row;
  };

  // участие (по заявкам на матчи и по событиям)
  const playedMatches = new Map<string, Set<string>>();
  for (const l of lineups) {
    get(l.personId, l.teamId, `${l.person.lastName} ${l.person.firstName}`, l.team.name, l.person.position);
    if (!playedMatches.has(l.personId)) playedMatches.set(l.personId, new Set());
    playedMatches.get(l.personId)!.add(l.matchId);
  }
  for (const e of events) {
    get(e.personId, e.teamId, `${e.person.lastName} ${e.person.firstName}`, e.team.name, e.person.position);
    if (!playedMatches.has(e.personId)) playedMatches.set(e.personId, new Set());
    playedMatches.get(e.personId)!.add(e.matchId);
    if (e.assistPersonId) {
      get(e.assistPersonId, e.teamId, "", e.team.name, null);
    }
  }

  for (const e of events) {
    const row = map.get(e.personId);
    if (row) {
      if (e.type === "GOAL") row.goals++;
      if (e.type === "PENALTY") { row.goals++; row.penalties++; }
      if (e.type === "OWN_GOAL") row.ownGoals++;
      if (e.type === "YELLOW_CARD") row.yellowCards++;
      if (e.type === "RED_CARD") row.redCards++;
    }
    if (e.assistPersonId) {
      const a = map.get(e.assistPersonId);
      if (a) a.assists++;
    }
  }

  for (const [personId, row] of map) {
    row.games = playedMatches.get(personId)?.size ?? 0;
    // имена для ассистентов, не попавших в заявки
    if (!row.name) {
      const p = await db.person.findUnique({ where: { id: personId } });
      row.name = p ? `${p.lastName} ${p.firstName}` : "—";
    }
  }

  // «Сухие» матчи вратарей: команда не пропустила в сыгранном матче, вратарь в заявке
  const matches = await db.match.findMany({
    where: { status: "COMPLETED", stage: { seasonId } },
    include: { lineups: { include: { person: true } } },
  });
  for (const m of matches) {
    const concededHome = m.awayScore ?? 0;
    const concededAway = m.homeScore ?? 0;
    for (const l of m.lineups) {
      if (l.person.position !== "GK") continue;
      const row = map.get(l.personId);
      if (!row) continue;
      const isHome = l.teamId === m.homeTeamId;
      const conceded = isHome ? concededHome : concededAway;
      if (conceded === 0) row.cleanSheets++;
    }
  }

  return [...map.values()];
}

export interface RefereeStatRow {
  personId: string;
  name: string;
  matches: number;
  yellowAvg: number;
  redAvg: number;
  penaltyAvg: number;
  avgRating: number | null;
  ratingsCount: number;
}

/** Статистика судей: средние ЖК/КК/пенальти и рейтинг команд (Milestone 5) */
export async function refereeStats(seasonId?: string): Promise<RefereeStatRow[]> {
  const referees = await db.person.findMany({ where: { isReferee: true } });
  const matchWhere = seasonId
    ? { refereeId: { not: null }, status: "COMPLETED", stage: { seasonId } }
    : { refereeId: { not: null }, status: "COMPLETED" };
  const matches = await db.match.findMany({
    where: matchWhere,
    include: { events: true, ratings: true },
  });

  const rows: RefereeStatRow[] = [];
  for (const ref of referees) {
    const own = matches.filter((m) => m.refereeId === ref.id);
    const events = own.flatMap((m) => m.events);
    const yellows = events.filter((e) => e.type === "YELLOW_CARD").length;
    const reds = events.filter((e) => e.type === "RED_CARD").length;
    const penalties = events.filter((e) => e.type === "PENALTY").length;
    const ratings = own.flatMap((m) => m.ratings.map((r) => r.rating));
    rows.push({
      personId: ref.id,
      name: `${ref.lastName} ${ref.firstName} ${ref.middleName ?? ""}`.trim(),
      matches: own.length,
      yellowAvg: own.length ? +(yellows / own.length).toFixed(1) : 0,
      redAvg: own.length ? +(reds / own.length).toFixed(2) : 0,
      penaltyAvg: own.length ? +(penalties / own.length).toFixed(2) : 0,
      avgRating: ratings.length ? +(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null,
      ratingsCount: ratings.length,
    });
  }
  return rows.sort((a, b) => b.matches - a.matches);
}
