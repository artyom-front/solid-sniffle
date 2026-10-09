// Общие запросы данных для публичного API

import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { displayTeamName } from "@/lib/text";
import { computeStandings, type StandingRow } from "@/lib/engine/standings";
import { resolveScore } from "@/lib/engine/standings";

export interface MatchDTO {
  id: string;
  round: number | null;
  kickoff: string;
  status: string;
  walkoverType: string | null;
  homeScore: number | null;
  awayScore: number | null;
  note: string | null;
  isFriendly?: boolean;
  /** «Важный матч» — помечает администратор (v1.0.54); бейдж в ленте и шапке матча */
  isImportant?: boolean;
  protocolUrl?: string | null;
  protocolFileName?: string | null;
  homeTeam: { id: string; name: string; clubName: string | null; logoUrl: string | null };
  awayTeam: { id: string; name: string; clubName: string | null; logoUrl: string | null };
  stadium: { id: string; name: string; city: string | null } | null;
  referee: { id: string; name: string } | null;
  regulationScore: number;
}

export async function loadSeasonData(seasonId: string) {
  const season = await db.season.findUnique({ where: { id: seasonId }, include: { league: true } });
  if (!season) throw new HttpError(404, "Сезон не найден");

  const stages = await db.stage.findMany({ where: { seasonId } });
  const matches = await db.match.findMany({
    where: { stage: { seasonId } },
    include: {
      homeTeam: { include: { club: true } },
      awayTeam: { include: { club: true } },
      stadium: true,
      referee: true,
    },
    orderBy: [{ round: "asc" }, { kickoff: "asc" }],
  });

  const cardEvents = await db.matchEvent.findMany({
    where: { match: { stage: { seasonId } }, type: { in: ["YELLOW_CARD", "RED_CARD"] } },
    select: { teamId: true, type: true },
  });

  return { season, stages, matches, cardEvents };
}

export function toMatchDTO(m: Awaited<ReturnType<typeof loadSeasonData>>["matches"][number] | {
  id: string; round: number | null; kickoff: Date; status: string; walkoverType: string | null;
  homeScore: number | null; awayScore: number | null; note: string | null;
  isFriendly: boolean; protocolUrl: string | null; protocolFileName: string | null;
  isImportant?: boolean;
  homeTeam: { id: string; name: string; club?: { name: string | null } | null; logoUrl?: string | null };
  awayTeam: { id: string; name: string; club?: { name: string | null } | null; logoUrl?: string | null };
  stadium: { id: string; name: string; city: string | null } | null;
  referee: { id: string; lastName: string; firstName: string } | null;
}, regulationScore: number): MatchDTO {
  return {
    id: m.id,
    round: m.round,
    kickoff: m.kickoff.toISOString(),
    status: m.status,
    walkoverType: m.walkoverType,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    note: m.note,
    isFriendly: m.isFriendly,
    isImportant: (m as { isImportant?: boolean }).isImportant ?? false,
    protocolUrl: m.protocolUrl,
    protocolFileName: m.protocolFileName,
    // фидбек 2026-10-01: публичное имя команды — без суффикса «№N»
    homeTeam: { id: m.homeTeam.id, name: displayTeamName(m.homeTeam.name), clubName: (m.homeTeam as { club?: { name: string | null } | null }).club?.name ?? null, logoUrl: (m.homeTeam as { logoUrl?: string | null }).logoUrl ?? null },
    awayTeam: { id: m.awayTeam.id, name: displayTeamName(m.awayTeam.name), clubName: (m.awayTeam as { club?: { name: string | null } | null }).club?.name ?? null, logoUrl: (m.awayTeam as { logoUrl?: string | null }).logoUrl ?? null },
    stadium: m.stadium ? { id: m.stadium.id, name: m.stadium.name, city: m.stadium.city } : null,
    referee: m.referee ? { id: m.referee.id, name: `${m.referee.lastName} ${m.referee.firstName}` } : null,
    regulationScore,
  };
}

/** Отображаемый счёт с учётом регламентного WO-счёта (COALESCE) */
export function displayScore(m: MatchDTO): { home: number; away: number } | null {
  if (m.status === "COMPLETED") return { home: m.homeScore ?? 0, away: m.awayScore ?? 0 };
  if (m.status === "WALKOVER" && m.walkoverType) {
    return resolveScore({ ...m, regulationScore: m.regulationScore });
  }
  return null;
}

export async function seasonStandings(seasonId: string): Promise<StandingRow[]> {
  const { season, stages, matches, cardEvents } = await loadSeasonData(seasonId);
  // v1.0.54 (feedback54 №1): команды берутся из ЗАЯВОК сезона, а не только
  // из матчей — предварительная таблица видна ДО первого сыгранного матча
  // (все команды с 0 игр). Матчевые команды добавляются объединением —
  // чтобы таблица не теряла команды, заявленные позже/без заявок.
  // Семантика «активной заявки» — как в генераторе расписания.
  const teams = new Map<string, { id: string; name: string; clubName: string | null }>();
  const regs = await db.registration.findMany({
    where: { seasonId, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
    include: { team: { include: { club: true } } },
  });
  for (const r of regs) {
    if (teams.has(r.teamId)) continue;
    teams.set(r.teamId, { id: r.team.id, name: displayTeamName(r.team.name), clubName: r.team.club?.name ?? null });
  }
  for (const m of matches) {
    if (!teams.has(m.homeTeamId)) teams.set(m.homeTeamId, { id: m.homeTeam.id, name: displayTeamName(m.homeTeam.name), clubName: m.homeTeam.club?.name ?? null });
    if (!teams.has(m.awayTeamId)) teams.set(m.awayTeamId, { id: m.awayTeam.id, name: displayTeamName(m.awayTeam.name), clubName: m.awayTeam.club?.name ?? null });
  }
  const stage = stages[0];
  return computeStandings(
    [...teams.values()],
    matches.map((m) => ({
      id: m.id, round: m.round, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
      status: m.status, walkoverType: m.walkoverType, homeScore: m.homeScore, awayScore: m.awayScore,
    })),
    cardEvents,
    stage?.tieBreakers ?? undefined,
    season.league.walkoverScore
  );
}
