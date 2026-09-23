// Milestone 2 + Epic 2: пересчёт турнирной таблицы.
// Ключевое правило (PRD): WO-матчи подставляют регламентный счёт (COALESCE-принцип),
// WO_BOTH — 0:0, обеим 0 очков и тех. поражение каждой.

export interface StandingsMatch {
  id: string;
  round: number | null;
  homeTeamId: string;
  awayTeamId: string;
  status: string; // COMPLETED | WALKOVER | ...
  walkoverType: string | null; // HOME | AWAY | BOTH
  homeScore: number | null;
  awayScore: number | null;
}

export interface StandingsTeam {
  id: string;
  name: string;
  clubName?: string | null;
}

export interface StandingRow {
  position: number;
  teamId: string;
  teamName: string;
  clubName: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  /// Число матчей, отданных/полученных технически
  techLosses: number;
  techWins: number;
  /// Жёлтые (1 балл) + красные (3 балла) — fair play тай-брейкер
  fairPlay: number;
  yellowCards: number;
  redCards: number;
  /// Последние 5 результатов: 'W' | 'D' | 'L' | 'T'(техпоражение) | 'w'(техпобеда)
  form: string[];
}

/** Регламентный счёт техпоражения по типу неявки (PRD Epic 2) */
export function walkoverScore(
  walkoverType: string,
  regulationScore: number
): { home: number; away: number; homePoints: number; awayPoints: number } {
  switch (walkoverType) {
    case "HOME": // неявка хозяев: 0:3 (или 0:5 в мини-футболе), гости получают техпобеду
      return { home: 0, away: regulationScore, homePoints: 0, awayPoints: 3 };
    case "AWAY": // неявка гостей: 3:0 (5:0) хозяевам
      return { home: regulationScore, away: 0, homePoints: 3, awayPoints: 0 };
    case "BOTH": // срыв матча: 0:0, обеим 0 очков, обеим техпоражение
      return { home: 0, away: 0, homePoints: 0, awayPoints: 0 };
    default:
      return { home: 0, away: 0, homePoints: 0, awayPoints: 0 };
  }
}

export function computeStandings(
  teams: StandingsTeam[],
  matches: StandingsMatch[],
  events: { teamId: string; type: string }[] = [],
  tieBreakers = "points,head_to_head,goal_diff,goals_for,wins,fair_play,name",
  regulationScore = 3
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const t of teams) {
    rows.set(t.id, {
      position: 0,
      teamId: t.id,
      teamName: t.name,
      clubName: t.clubName ?? null,
      games: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0,
      points: 0, techLosses: 0, techWins: 0,
      fairPlay: 0, yellowCards: 0, redCards: 0,
      form: [],
    });
  }

  // помечаем каждый матч регламентным счётом лиги (COALESCE-подстановка)
  const ordered = [...matches]
    .map((m) => ({ ...m, regulationScore }))
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0));

  for (const m of ordered) {
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away) continue;

    // --- только сыгранные матчи влияют на таблицу ---
    let homeGoals = 0, awayGoals = 0, homePts = 0, awayPts = 0;
    let isWalkover = false;

    if (m.status === "COMPLETED" && m.homeScore !== null && m.awayScore !== null) {
      homeGoals = m.homeScore;
      awayGoals = m.awayScore;
      if (homeGoals > awayGoals) { homePts = 3; awayPts = 0; }
      else if (homeGoals < awayGoals) { homePts = 0; awayPts = 3; }
      else { homePts = 1; awayPts = 1; }
    } else if (m.status === "WALKOVER" && m.walkoverType) {
      // COALESCE-подстановка регламентного счёта (PRD)
      const reg = walkoverScore(m.walkoverType, m.regulationScore);
      homeGoals = reg.home; awayGoals = reg.away;
      homePts = reg.homePoints; awayPts = reg.awayPoints;
      isWalkover = true;
    } else {
      continue; // SCHEDULED / POSTPONED не учитываются
    }

    home.games++; away.games++;
    home.goalsFor += homeGoals; home.goalsAgainst += awayGoals;
    away.goalsFor += awayGoals; away.goalsAgainst += homeGoals;
    home.points += homePts; away.points += awayPts;

    if (isWalkover) {
      if (m.walkoverType === "BOTH") {
        // обе неявки: техпоражение обеим при счёте 0:0
        home.losses++; away.losses++;
        home.techLosses++; away.techLosses++;
        home.form.push("T"); away.form.push("T");
      } else {
        const homeWon = m.walkoverType === "AWAY";
        if (homeWon) { home.wins++; home.techWins++; away.losses++; away.techLosses++; home.form.push("w"); away.form.push("T"); }
        else { away.wins++; away.techWins++; home.losses++; home.techLosses++; away.form.push("w"); home.form.push("T"); }
      }
    } else {
      if (homeGoals > awayGoals) { home.wins++; away.losses++; home.form.push("W"); away.form.push("L"); }
      else if (homeGoals < awayGoals) {
        away.wins++; home.losses++;
        away.form.push("W");
        home.form.push("L");
      } else {
        home.draws++; away.draws++;
        home.form.push("D");
        away.form.push("D");
      }
    }
  }

  // Fair play из событий (только сыгранные матчи — фильтрация на стороне вызова)
  for (const e of events) {
    const row = rows.get(e.teamId);
    if (!row) continue;
    if (e.type === "YELLOW_CARD") { row.yellowCards++; row.fairPlay += 1; }
    if (e.type === "RED_CARD") { row.redCards++; row.fairPlay += 3; }
  }

  for (const row of rows.values()) {
    row.goalDiff = row.goalsFor - row.goalsAgainst;
    row.form = row.form.slice(-5);
  }

  const list = [...rows.values()];
  const order = tieBreakers.split(",").map((s) => s.trim()).filter(Boolean);
  sortStandings(list, ordered, order);

  list.forEach((r, i) => (r.position = i + 1));
  return list;
}

function sortStandings(list: StandingRow[], matches: StandingsMatch[], order: string[]) {
  const headToHead = (a: StandingRow, b: StandingRow): number => {
    let ap = 0, bp = 0, agd = 0, bgd = 0;
    for (const m of matches) {
      if (m.status !== "COMPLETED" && m.status !== "WALKOVER") continue;
      const pair = new Set([m.homeTeamId, m.awayTeamId]);
      if (!pair.has(a.teamId) || !pair.has(b.teamId)) continue;
      const { home, away } = resolveScore(m);
      const aHome = m.homeTeamId === a.teamId;
      const aGoals = aHome ? home : away;
      const bGoals = aHome ? away : home;
      if (aGoals > bGoals) ap += 3;
      else if (aGoals < bGoals) bp += 3;
      else { ap += 1; bp += 1; }
      agd += aGoals - bGoals;
      bgd += bGoals - aGoals;
    }
    return bp - ap || bgd - agd;
  };

  list.sort((a, b) => {
    for (const key of order) {
      let cmp = 0;
      switch (key) {
        case "points": cmp = b.points - a.points; break;
        case "wins": cmp = b.wins - a.wins; break;
        case "goal_diff": cmp = b.goalDiff - a.goalDiff; break;
        case "goals_for": cmp = b.goalsFor - a.goalsFor; break;
        case "head_to_head": cmp = headToHead(a, b); break;
        case "fair_play": cmp = a.fairPlay - b.fairPlay; break;
        case "name": cmp = a.teamName.localeCompare(b.teamName, "ru"); break;
      }
      if (cmp !== 0) return cmp;
    }
    return a.teamName.localeCompare(b.teamName, "ru");
  });
}

/** Счёт матча с учётом WO-подстановки регламентного счёта (COALESCE на чтении) */
export function resolveScore(m: {
  status: string;
  walkoverType: string | null;
  homeScore: number | null;
  awayScore: number | null;
  regulationScore?: number;
}): { home: number; away: number } {
  if (m.status === "COMPLETED") return { home: m.homeScore ?? 0, away: m.awayScore ?? 0 };
  if (m.status === "WALKOVER" && m.walkoverType) {
    const reg = walkoverScore(m.walkoverType, m.regulationScore ?? 3);
    return { home: reg.home, away: reg.away };
  }
  return { home: 0, away: 0 };
}
