// ============================================================
// Профили: матч (детально), команда, игрок/судья.
// Используется и API-роутами, и SSR-страницами.
// ============================================================

import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { toMatchDTO, seasonStandings } from "@/lib/queries";
import { seasonPlayerStats, refereeStats, type PlayerStatRow } from "@/lib/engine/stats";
import { buildSignalsContext, matchSignals, computeStreak, plural, type Streak } from "@/lib/engine/signals";

/** Порог «разгрома» для превью: 10+ мячей в одном матче */
const ROUT_THRESHOLD = 10;

interface TeamInsight {
  last5: { scored: number; conceded: number; matches: number } | null;
  /** самое крупное взятие ворот — если 10+, это факт для превью */
  rout: { goals: number; opponent: string; date: string; score: string } | null;
  /** самое крупное поражение — если пропустила 10+ */
  collapse: { goals: number; opponent: string; date: string; score: string } | null;
}

/** Инсайты команды для превью матча: голы в последних 5 матчах,
 *  разгромы и провалы за всю историю (все сезоны). */
async function teamInsights(teamId: string): Promise<TeamInsight> {
  const ms = await db.match.findMany({
    where: { status: "COMPLETED", OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
    orderBy: { kickoff: "desc" },
  });
  let scored = 0, conceded = 0;
  let rout: TeamInsight["rout"] = null;
  let collapse: TeamInsight["collapse"] = null;
  ms.forEach((m, i) => {
    const isHome = m.homeTeamId === teamId;
    const my = (isHome ? m.homeScore : m.awayScore) ?? 0;
    const opp = (isHome ? m.awayScore : m.homeScore) ?? 0;
    const oppName = isHome ? m.awayTeam.name : m.homeTeam.name;
    if (i < 5) { scored += my; conceded += opp; }
    if (my >= ROUT_THRESHOLD && (!rout || my > rout.goals)) {
      rout = { goals: my, opponent: oppName, date: m.kickoff.toISOString(), score: `${my}:${opp}` };
    }
    if (opp >= ROUT_THRESHOLD && (!collapse || opp > collapse.goals)) {
      collapse = { goals: opp, opponent: oppName, date: m.kickoff.toISOString(), score: `${my}:${opp}` };
    }
  });
  return {
    last5: ms.length > 0 ? { scored, conceded, matches: Math.min(5, ms.length) } : null,
    rout,
    collapse,
  };
}

// ============================================================
// Детальная карточка матча
// ============================================================

/** События, составы, судья, оценки, таблица сезона, H2H (в формате лиги), кто пропускает, сигналы, инсайты */
export async function getMatchDetail(id: string) {
  const match = await db.match.findUnique({
    where: { id },
    include: {
      homeTeam: { include: { club: true } },
      awayTeam: { include: { club: true } },
      stadium: true,
      referee: true,
      stage: { include: { season: { include: { league: true } } } },
      events: {
        include: { person: true, assistPerson: true, team: true },
        orderBy: { minute: "asc" },
      },
      lineups: { include: { person: true, team: true } },
      ratings: { include: { author: true } },
    },
  });
  if (!match) throw new HttpError(404, "Матч не найден");

  const seasonId = match.stage.seasonId;
  const league = match.stage.season.league;

  // ---------- Таблица сезона (обе команды подсвечиваются на клиенте) ----------
  const standings = await seasonStandings(seasonId);

  // ---------- Личные встречи (H2H): только в этом же формате футбола ----------
  // одна пара команд может встречаться и в 11×11, и в футзале — сравнивать
  // «глухого с футзалистом» некорректно, поэтому фильтруем по формату лиги.
  const h2hMatches = await db.match.findMany({
    where: {
      status: { in: ["COMPLETED", "WALKOVER"] },
      kickoff: { lt: new Date() },
      stage: { season: { league: { format: league.format } } },
      OR: [
        { homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
        { homeTeamId: match.awayTeamId, awayTeamId: match.homeTeamId },
      ],
    },
    include: {
      homeTeam: true, awayTeam: true,
      stage: { include: { season: { include: { league: true } } } },
    },
    orderBy: { kickoff: "desc" },
    take: 10,
  });
  let h2hHomeWins = 0, h2hDraws = 0, h2hAwayWins = 0;
  for (const m of h2hMatches) {
    const homeIsCurrentHome = m.homeTeamId === match.homeTeamId;
    const reg = m.status === "WALKOVER" && m.walkoverType
      ? m.walkoverType === "BOTH"
        ? { h: 0, a: 0 }
        : m.walkoverType === "HOME"
          ? { h: 0, a: m.stage.season.league.walkoverScore }
          : { h: m.stage.season.league.walkoverScore, a: 0 }
      : { h: m.homeScore ?? 0, a: m.awayScore ?? 0 };
    if (reg.h > reg.a) {
      if (homeIsCurrentHome) h2hHomeWins++;
      else h2hAwayWins++;
    } else if (reg.h < reg.a) {
      if (homeIsCurrentHome) h2hAwayWins++;
      else h2hHomeWins++;
    } else h2hDraws++;
  }

  // ---------- Кто пропускает матч (актуально до и во время игры) ----------
  const missing: {
    teamId: string;
    entries: { personId: string; name: string; kind: "SUSPENSION" | "AT_RISK"; detail: string }[];
  }[] = [];
  if (match.status === "SCHEDULED" || match.status === "POSTPONED" || match.status === "LIVE") {
    const teams = [
      { id: match.homeTeamId, name: match.homeTeam.name },
      { id: match.awayTeamId, name: match.awayTeam.name },
    ];
    // активные дисквалификации заявленных игроков
    const suspensions = await db.suspension.findMany({
      where: {
        seasonId,
        isActive: true,
        person: { registrations: { some: { seasonId, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] } } },
      },
      include: { person: true },
    });
    // игрок «в шаге» от дисквалификации по ЖК
    const statRows = await seasonPlayerStats(seasonId);
    for (const t of teams) {
      const entries: { personId: string; name: string; kind: "SUSPENSION" | "AT_RISK"; detail: string }[] = [];
      for (const s of suspensions) {
        const reg = await db.registration.findFirst({
          where: { personId: s.personId, teamId: t.id, seasonId },
        });
        if (!reg) continue;
        const left = s.isLifetime ? "бессрочно" : `${s.matchesTotal - s.matchesServed} ${plural(s.matchesTotal - s.matchesServed, "матч", "матча", "матчей")}`;
        entries.push({
          personId: s.personId,
          name: `${s.person.lastName} ${s.person.firstName}`,
          kind: "SUSPENSION",
          detail: s.source === "MANUAL" ? `дисквалификация КДК · пропустит ${left}` : s.source === "AUTO_RED" ? `красная карточка · пропустит ${left}` : `накопление ЖК · пропустит ${left}`,
        });
      }
      for (const row of statRows) {
        if (row.teamId !== t.id) continue;
        if (row.yellowCards === league.yellowCardLimit - 1 && row.yellowCards > 0) {
          entries.push({
            personId: row.personId,
            name: row.name,
            kind: "AT_RISK",
            detail: `${row.yellowCards} ЖК — ещё одна жёлтая, и игрок пропустит следующий матч`,
          });
        }
      }
      if (entries.length) missing.push({ teamId: t.id, entries });
    }
  }

  // ---------- Сигналы и сводка по командам (форма, серия, бомбардир) ----------
  const sigCtx = await buildSignalsContext(seasonId);
  const signals = matchSignals(
    { id: match.id, round: match.round, homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
    sigCtx,
    standings
  );

  // ---------- Инсайты команд для вкладки «Превью» ----------
  const insights = {
    home: await teamInsights(match.homeTeamId),
    away: await teamInsights(match.awayTeamId),
  };

  return {
    match: {
      id: match.id,
      round: match.round,
      kickoff: match.kickoff.toISOString(),
      status: match.status,
      walkoverType: match.walkoverType,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      note: match.note,
      regulationScore: league.walkoverScore,
      homeTeam: { id: match.homeTeam.id, name: match.homeTeam.name, clubName: match.homeTeam.club?.name ?? null },
      awayTeam: { id: match.awayTeam.id, name: match.awayTeam.name, clubName: match.awayTeam.club?.name ?? null },
      stadium: match.stadium ? { id: match.stadium.id, name: match.stadium.name, city: match.stadium.city } : null,
      referee: match.referee ? { id: match.referee.id, name: `${match.referee.lastName} ${match.referee.firstName} ${match.referee.middleName ?? ""}`.trim() } : null,
      season: { id: match.stage.season.id, name: match.stage.season.name },
      league: { id: league.id, name: league.name, walkoverScore: league.walkoverScore, yellowCardLimit: league.yellowCardLimit },
      events: match.events.map((e) => ({
        id: e.id,
        minute: e.minute,
        type: e.type,
        person: { id: e.person.id, name: `${e.person.lastName} ${e.person.firstName}` },
        assist: e.assistPerson ? { id: e.assistPerson.id, name: `${e.assistPerson.lastName} ${e.assistPerson.firstName}` } : null,
        teamId: e.teamId,
      })),
      lineups: match.lineups.map((l) => ({
        id: l.id,
        teamId: l.teamId,
        person: { id: l.person.id, name: `${l.person.lastName} ${l.person.firstName}`, position: l.person.position },
        isStarter: l.isStarter,
        number: l.number,
      })),
      ratings: match.ratings.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        // анонимность автора (PRD §4)
        authorRole: r.author.role,
      })),
    },
    standings,
    h2h: {
      list: h2hMatches.map((m) => ({
        id: m.id,
        kickoff: m.kickoff.toISOString(),
        status: m.status,
        walkoverType: m.walkoverType,
        homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name },
        awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name },
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        regulationScore: m.stage.season.league.walkoverScore,
        season: { name: m.stage.season.name, league: m.stage.season.league.name },
      })),
      summary: { homeWins: h2hHomeWins, draws: h2hDraws, awayWins: h2hAwayWins },
    },
    missing,
    signals,
    insights,
  };
}

// ============================================================
// Профиль команды
// ============================================================

export async function getTeamProfile(id: string) {
  const team = await db.team.findUnique({ where: { id }, include: { club: true } });
  if (!team) throw new HttpError(404, "Команда не найдена");

  // все заявки команды (по всем сезонам), свежие сезоны первыми
  const regs = await db.registration.findMany({
    where: { teamId: id },
    include: { person: true, season: { include: { league: true } } },
    orderBy: { startDate: "desc" },
  });

  const seasonsMap = new Map<string, { season: { id: string; name: string; league: { id: string; name: string; format: string } }; players: { id: string; name: string; position: string | null; number: number | null; endDate: string | null }[]; coaches: { id: string; name: string; endDate: string | null; startDate: string }[] }>();
  for (const r of regs) {
    if (!seasonsMap.has(r.seasonId)) {
      seasonsMap.set(r.seasonId, {
        season: { id: r.season.id, name: r.season.name, league: { id: r.season.league.id, name: r.season.league.name, format: r.season.league.format } },
        players: [], coaches: [],
      });
    }
    const entry = seasonsMap.get(r.seasonId)!;
    const name = `${r.person.lastName} ${r.person.firstName}`;
    if (r.role === "COACH") entry.coaches.push({ id: r.personId, name, endDate: r.endDate?.toISOString() ?? null, startDate: r.startDate.toISOString() });
    else entry.players.push({ id: r.personId, name, position: r.person.position, number: r.number, endDate: r.endDate?.toISOString() ?? null });
  }
  for (const entry of seasonsMap.values()) {
    entry.players.sort((a, b) => (a.number ?? 99) - (b.number ?? 99) || a.name.localeCompare(b.name, "ru"));
  }

  // матчи команды по всем текущим сезонам
  const teamMatches = await db.match.findMany({
    where: { OR: [{ homeTeamId: id }, { awayTeamId: id }], stage: { season: { isCurrent: true } } },
    include: {
      homeTeam: { include: { club: true } },
      awayTeam: { include: { club: true } },
      stadium: true,
      referee: true,
      stage: { include: { season: { include: { league: true } } } },
    },
    orderBy: { kickoff: "desc" },
  });

  // позиция в таблице текущего сезона каждой лиги + сигналы сезона
  const standings: {
    season: { id: string; name: string; league: { id: string; name: string; format: string } };
    position: number;
    points: number;
    games: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    form: string[];
    streak: Streak | null;
    topScorer: { personId: string; name: string; goals: number; out?: boolean } | null;
    newCoach: { name: string } | null;
  }[] = [];
  const monthAgo = new Date(Date.now() - 30 * 86400000);
  for (const [seasonId, entry] of seasonsMap) {
    if (!entry.season) continue;
    const rows = await seasonStandings(seasonId);
    const row = rows.find((r) => r.teamId === id);
    if (!row) continue;

    const ctx = await buildSignalsContext(seasonId);
    const streak = computeStreak(ctx.matches, id);
    const topScorer = ctx.topScorers.get(id) ?? null;
    const topScorerOut = !!topScorer && ctx.suspended.has(topScorer.personId);
    const currentCoach = entry.coaches.find((c) => !c.endDate) ?? null;
    const coachChanged = currentCoach ? new Date(currentCoach.startDate) >= monthAgo : false;
    const newCoachName = coachChanged ? currentCoach!.name : null;

    standings.push({
      season: entry.season,
      position: row.position, points: row.points, games: row.games,
      wins: row.wins, draws: row.draws, losses: row.losses,
      goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, form: row.form ?? [],
      streak, topScorer: topScorerOut ? { ...topScorer!, out: true } : topScorer,
      newCoach: newCoachName ? { name: newCoachName } : null,
    });
  }

  return {
    team: {
      id: team.id, name: team.name, city: team.city, logoUrl: team.logoUrl,
      club: team.club ? { id: team.club.id, name: team.club.name, city: team.club.city, description: team.club.description } : null,
    },
    seasons: [...seasonsMap.values()],
    standings,
    matches: teamMatches.map((m) => ({
      ...toMatchDTO(m, m.stage.season.league.walkoverScore),
      league: { id: m.stage.season.league.id, name: m.stage.season.league.name, format: m.stage.season.league.format },
    })),
  };
}

// ============================================================
// Профиль игрока / судьи / тренера
// ============================================================

export async function getPlayerProfile(id: string) {
  const person = await db.person.findUnique({
    where: { id },
    include: {
      registrations: { include: { team: { include: { club: true } }, season: { include: { league: true } } }, orderBy: { startDate: "desc" } },
      suspensions: { include: { season: { include: { league: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!person) throw new HttpError(404, "Игрок не найден");

  const seasonIds = [...new Set(person.registrations.map((r) => r.seasonId))];
  const statsBySeason: {
    season: { id: string; name: string; league: string };
    team: { id: string; name: string };
    stats: PlayerStatRow;
  }[] = [];
  for (const seasonId of seasonIds) {
    const stats = (await seasonPlayerStats(seasonId)).find((s) => s.personId === id);
    const season = person.registrations.find((r) => r.seasonId === seasonId)!.season;
    if (stats) statsBySeason.push({
      season: { id: season.id, name: season.name, league: season.league.name },
      team: { id: stats.teamId, name: stats.teamName },
      stats,
    });
  }

  const events = await db.matchEvent.findMany({
    where: { OR: [{ personId: id }, { assistPersonId: id }] },
    include: { match: { include: { homeTeam: true, awayTeam: true, stage: { include: { season: true } } } } },
    orderBy: { minute: "asc" },
    take: 50,
  });

  // Судейская карьера (PRD §4: человек может быть игроком И судьёй)
  let referee: { matches: number; yellowAvg: number; redAvg: number; penaltyAvg: number; avgRating: number | null; ratingsCount: number; debut: string | null; byLeague: { league: string; matches: number; yellowAvg: number; redAvg: number; avgRating: number | null }[]; matchList: { id: string; kickoff: string; home: string; away: string; status: string; league: string; homeScore: number | null; awayScore: number | null }[] } | null = null;
  if (person.isReferee) {
    const refRow = (await refereeStats()).find((r) => r.personId === id) ?? null;
    const refMatches = await db.match.findMany({
      where: { refereeId: id },
      include: { homeTeam: true, awayTeam: true, events: true, ratings: true, stage: { include: { season: { include: { league: true } } } } },
      orderBy: { kickoff: "desc" },
    });
    // разбивка по лигам: полная история, а не только последние 30
    const byLeagueMap = new Map<string, { league: string; matches: number; yellows: number; reds: number; ratings: number[] }>();
    for (const m of refMatches) {
      if (m.status !== "COMPLETED") continue;
      const key = m.stage.season.league.name;
      if (!byLeagueMap.has(key)) byLeagueMap.set(key, { league: key, matches: 0, yellows: 0, reds: 0, ratings: [] });
      const v = byLeagueMap.get(key)!;
      v.matches++;
      v.yellows += m.events.filter((e) => e.type === "YELLOW_CARD").length;
      v.reds += m.events.filter((e) => e.type === "RED_CARD").length;
      v.ratings.push(...m.ratings.map((r) => r.rating));
    }
    const debuts = refMatches.length ? refMatches[refMatches.length - 1].kickoff.toISOString() : null;
    referee = {
      matches: refRow?.matches ?? 0,
      yellowAvg: refRow?.yellowAvg ?? 0,
      redAvg: refRow?.redAvg ?? 0,
      penaltyAvg: refRow?.penaltyAvg ?? 0,
      avgRating: refRow?.avgRating ?? null,
      ratingsCount: refRow?.ratingsCount ?? 0,
      debut: debuts,
      byLeague: [...byLeagueMap.values()].map((v) => ({
        league: v.league,
        matches: v.matches,
        yellowAvg: v.matches ? +(v.yellows / v.matches).toFixed(1) : 0,
        redAvg: v.matches ? +(v.reds / v.matches).toFixed(2) : 0,
        avgRating: v.ratings.length ? +(v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length).toFixed(1) : null,
      })),
      matchList: refMatches.slice(0, 30).map((m) => ({
        id: m.id, kickoff: m.kickoff.toISOString(),
        home: m.homeTeam.name, away: m.awayTeam.name, status: m.status,
        league: m.stage.season.league.name,
        homeScore: m.homeScore, awayScore: m.awayScore,
      })),
    };
  }

  return {
    player: {
      id: person.id,
      name: `${person.lastName} ${person.firstName} ${person.middleName ?? ""}`.trim(),
      birthDate: person.birthDate?.toISOString() ?? null,
      position: person.position,
      isReferee: person.isReferee,
      referee,
      registrations: person.registrations.map((r) => ({
        team: { id: r.team.id, name: r.team.name, clubName: r.team.club?.name ?? null },
        season: { id: r.season.id, name: r.season.name, league: r.season.league.name },
        startDate: r.startDate.toISOString(),
        endDate: r.endDate?.toISOString() ?? null,
        number: r.number,
        role: r.role,
      })),
      suspensions: person.suspensions.map((s) => ({
        league: s.season.league.name,
        source: s.source,
        reason: s.reason,
        matchesTotal: s.matchesTotal,
        matchesServed: s.matchesServed,
        isLifetime: s.isLifetime,
        isActive: s.isActive,
        createdAt: s.createdAt.toISOString(),
      })),
      statsBySeason,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        minute: e.minute,
        isAssist: e.assistPersonId === id,
        match: {
          id: e.match.id,
          home: e.match.homeTeam.name,
          away: e.match.awayTeam.name,
          status: e.match.status,
          kickoff: e.match.kickoff.toISOString(),
        },
      })),
    },
  };
}
