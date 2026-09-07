// ============================================================
// Сервис-слой публичных данных: ЕДИНЫЙ источник для API-роутов
// и SSR-страниц (App Router). Ответы имеют ту же форму, что и
// прежние route-хендлеры, — клиентский код не меняется.
// ============================================================

import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { toMatchDTO, seasonStandings, loadSeasonData } from "@/lib/queries";
import { seasonPlayerStats, refereeStats } from "@/lib/engine/stats";
import { buildSignalsContext, matchSignals, computeStreak, plural, type MatchSignals } from "@/lib/engine/signals";

const FORMATS = ["F11", "F8", "F6", "FUTSAL"];
/** Порог «разгрома» для превью: 10+ мячей в одном матче */
export const ROUT_THRESHOLD = 10;

// ============================================================
// Обзор портала
// ============================================================

export async function getOverview() {
  const leagues = await db.league.findMany({
    include: { seasons: { orderBy: { startDate: "desc" } } },
    orderBy: { createdAt: "asc" },
  });

  const [persons, teams, matches, goals, events, activeSuspensions, clubs, referees] = await Promise.all([
    db.person.count(),
    db.team.count(),
    db.match.count(),
    db.matchEvent.count({ where: { type: { in: ["GOAL", "PENALTY"] } } }),
    db.matchEvent.count(),
    db.suspension.count({ where: { isActive: true } }),
    db.club.count(),
    db.person.count({ where: { isReferee: true } }),
  ]);

  return {
    leagues: leagues.map((l) => ({
      id: l.id,
      name: l.name,
      shortName: l.shortName,
      format: l.format,
      isPinned: l.isPinned,
      priority: l.priority,
      yellowCardLimit: l.yellowCardLimit,
      redCardBanMatches: l.redCardBanMatches,
      walkoverScore: l.walkoverScore,
      transferWindowEnd: l.transferWindowEnd?.toISOString() ?? null,
      seasons: l.seasons.map((s) => ({
        id: s.id,
        name: s.name,
        startDate: s.startDate.toISOString(),
        isCurrent: s.isCurrent,
      })),
    })),
    stats: { persons, teams, matches, goals, events, activeSuspensions, clubs, referees },
  };
}

export async function getBanners() {
  const now = new Date();
  const banners = await db.banner.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });
  return {
    banners: banners.map((b) => ({
      id: b.id, placement: b.placement, title: b.title,
      imageUrl: b.imageUrl, linkUrl: b.linkUrl, text: b.text,
    })),
  };
}

// ============================================================
// Livescore-лента по дате (МСК) и формату
// ============================================================

export async function getMatchesDay(date: string, format: string) {
  const leagues = await db.league.findMany({
    where: FORMATS.includes(format) ? { format } : {},
    include: { seasons: { where: { isCurrent: true }, take: 1 } },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  // границы МСК-дня в UTC
  let start: Date | null = null;
  let end: Date | null = null;
  if (date !== "all") {
    const day = date === "today" ? new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10) : date;
    const [y, mo, d] = day.split("-").map(Number);
    start = new Date(Date.UTC(y, mo - 1, d) - 3 * 3600 * 1000);
    end = new Date(Date.UTC(y, mo - 1, d + 1) - 3 * 3600 * 1000);
  }

  const result: {
    league: { id: string; name: string; shortName: string | null; format: string; isPinned: boolean; walkoverScore: number };
    season: { id: string; name: string };
    matches: (ReturnType<typeof toMatchDTO> & { signals: MatchSignals })[];
  }[] = [];
  for (const league of leagues) {
    const season = league.seasons[0];
    if (!season) continue;
    const matches = await db.match.findMany({
      where: {
        stage: { seasonId: season.id },
        ...(start && end ? { kickoff: { gte: start, lt: end } } : {}),
      },
      include: {
        homeTeam: { include: { club: true } },
        awayTeam: { include: { club: true } },
        stadium: true,
        referee: true,
      },
      orderBy: { kickoff: "asc" },
    });
    if (matches.length === 0) continue;

    // сигналы турнира: считаются по всему сезону (стрики — полная история)
    const standings = await seasonStandings(season.id);
    const ctx = await buildSignalsContext(season.id);

    result.push({
      league: {
        id: league.id, name: league.name, shortName: league.shortName, format: league.format,
        isPinned: league.isPinned, walkoverScore: league.walkoverScore,
      },
      season: { id: season.id, name: season.name },
      matches: matches.map((m) => ({
        ...toMatchDTO(m, league.walkoverScore),
        signals: matchSignals(
          { id: m.id, round: m.round, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId },
          ctx,
          standings
        ),
      })),
    });
  }

  return { date: date === "all" ? null : (start ? start.toISOString() : null), leagues: result };
}

// ============================================================
// Календарь матчей сезона
// ============================================================

export async function getSeasonMatches(seasonId: string) {
  const { season, matches } = await loadSeasonData(seasonId);
  return {
    season: {
      id: season.id,
      name: season.name,
      league: { id: season.league.id, name: season.league.name, walkoverScore: season.league.walkoverScore },
    },
    matches: matches.map((m) => toMatchDTO(m, season.league.walkoverScore)),
  };
}

// ============================================================
// Турнирная таблица
// ============================================================

export async function getStandings(seasonId: string) {
  const [standings, data] = await Promise.all([seasonStandings(seasonId), loadSeasonData(seasonId)]);
  return {
    season: {
      id: data.season.id,
      name: data.season.name,
      league: { id: data.season.league.id, name: data.season.league.name, format: data.season.league.format, walkoverScore: data.season.league.walkoverScore },
    },
    stage: data.stages[0] ? { id: data.stages[0].id, name: data.stages[0].name, tieBreakers: data.stages[0].tieBreakers } : null,
    standings,
  };
}

// ============================================================
// Бомбардиры / ассистенты / вратари / fair play
// ============================================================

export async function getScorers(seasonId: string) {
  const stats = await seasonPlayerStats(seasonId);
  const scorers = [...stats].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name, "ru")).filter((s) => s.goals > 0);
  const assisters = [...stats].sort((a, b) => b.assists - a.assists || b.goals - a.goals || a.name.localeCompare(b.name, "ru")).filter((s) => s.assists > 0);
  const goalkeepers = [...stats].filter((s) => s.position === "GK").sort((a, b) => b.cleanSheets - a.cleanSheets || a.name.localeCompare(b.name, "ru"));
  const fairPlay = [...stats].sort((a, b) => b.yellowCards - a.yellowCards || b.redCards - a.redCards || a.name.localeCompare(b.name, "ru")).filter((s) => s.yellowCards > 0 || s.redCards > 0);
  return { scorers: scorers.slice(0, 30), assisters: assisters.slice(0, 30), goalkeepers, fairPlay: fairPlay.slice(0, 30) };
}

// ============================================================
// Дисквалификации сезона
// ============================================================

export async function getSuspensions(seasonId: string) {
  const suspensions = await db.suspension.findMany({
    where: { seasonId },
    include: {
      person: { include: { registrations: { where: { seasonId }, include: { team: true } } } },
      season: { include: { league: true } },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return {
    suspensions: suspensions.map((s) => {
      const reg = s.person.registrations[0];
      return {
        id: s.id,
        person: { id: s.person.id, name: `${s.person.lastName} ${s.person.firstName}` },
        team: reg ? { id: reg.team.id, name: reg.team.name } : null,
        league: { name: s.season.league.name },
        source: s.source,
        reason: s.reason,
        matchesTotal: s.matchesTotal,
        matchesServed: s.matchesServed,
        isLifetime: s.isLifetime,
        isActive: s.isActive,
        createdAt: s.createdAt.toISOString(),
      };
    }),
  };
}

// ============================================================
// Судьи
// ============================================================

export async function getReferees(seasonId?: string) {
  const referees = await refereeStats(seasonId);
  return { referees };
}

// ============================================================
// Команды сезона
// ============================================================

export async function getSeasonTeams(seasonId: string) {
  const regs = await db.registration.findMany({
    where: { seasonId },
    include: { person: true, team: { include: { club: true } } },
  });

  const teamsMap = new Map<string, {
    id: string; name: string; clubName: string | null; city: string | null;
    players: { id: string; name: string; position: string | null; number: number | null; endDate: string | null }[];
  }>();

  for (const r of regs) {
    if (!teamsMap.has(r.teamId)) {
      teamsMap.set(r.teamId, {
        id: r.team.id,
        name: r.team.name,
        clubName: r.team.club?.name ?? null,
        city: r.team.club?.city ?? null,
        players: [],
      });
    }
    teamsMap.get(r.teamId)!.players.push({
      id: r.personId,
      name: `${r.person.lastName} ${r.person.firstName}`,
      position: r.person.position,
      number: r.number,
      endDate: r.endDate?.toISOString() ?? null,
    });
  }

  const teams = [...teamsMap.values()].map((t) => ({
    ...t,
    players: t.players.sort((a, b) => (a.number ?? 99) - (b.number ?? 99) || a.name.localeCompare(b.name, "ru")),
  }));

  return { teams };
}

// ============================================================
// Профиль стадиона
// ============================================================

export async function getStadiumProfile(id: string) {
  const stadium = await db.stadium.findUnique({ where: { id } });
  if (!stadium) throw new HttpError(404, "Стадион не найден");

  const matches = await db.match.findMany({
    where: { stadiumId: id },
    include: {
      homeTeam: { include: { club: true } },
      awayTeam: { include: { club: true } },
      stadium: true,
      referee: true,
      stage: { include: { season: { include: { league: true } } } },
    },
    orderBy: { kickoff: "desc" },
    take: 60,
  });

  const played = matches.filter((m) => m.status === "COMPLETED" || m.status === "WALKOVER");
  const goals = played.reduce((sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);

  return {
    stadium: { id: stadium.id, name: stadium.name, city: stadium.city, address: stadium.address, capacity: stadium.capacity },
    stats: { hosted: played.length, goals, avgGoals: played.length ? +(goals / played.length).toFixed(1) : 0 },
    matches: matches.map((m) => ({
      ...toMatchDTO(m, m.stage.season.league.walkoverScore),
      league: { id: m.stage.season.league.id, name: m.stage.season.league.name, format: m.stage.season.league.format },
    })),
  };
}
