// Список матчей для админ-панели/судьи: REFEREE видит только свои назначения. POST — создание матча.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function GET(req: Request) {
  try {
    const user = await requireRole("REFEREE", "CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { searchParams } = new URL(req.url);
    const seasonId = searchParams.get("seasonId");
    if (!seasonId) return Response.json({ error: "Укажите seasonId" }, { status: 422 });

    const matches = await db.match.findMany({
      where: {
        stage: { seasonId },
        ...(user.role === "REFEREE" ? { refereeId: user.personId ?? "__none__" } : {}),
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        referee: true,
        stage: { include: { season: { include: { league: true } } } },
      },
      orderBy: [{ round: "asc" }, { kickoff: "asc" }],
    });

    return Response.json({
      matches: matches.map((m) => ({
        id: m.id,
        round: m.round,
        kickoff: m.kickoff.toISOString(),
        status: m.status,
        walkoverType: m.walkoverType,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name },
        awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name },
        referee: m.referee ? { id: m.referee.id, name: `${m.referee.lastName} ${m.referee.firstName}` } : null,
        eventsCount: 0,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";

// ---------- Создание матча (продакшен-цикл: ручное добавление вне генератора) ----------
export async function POST(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const body = await req.json();
    const { seasonId, stageId, round, homeTeamId, awayTeamId, kickoff, stadiumId, refereeId, note } = body;

    if (!homeTeamId || !awayTeamId) throw new HttpError(422, "Укажите обе команды");
    if (homeTeamId === awayTeamId) throw new HttpError(422, "Команды должны различаться");
    if (!kickoff) throw new HttpError(422, "Укажите дату и время начала");
    const kickoffDate = new Date(String(kickoff));
    if (Number.isNaN(kickoffDate.getTime())) throw new HttpError(422, "Некорректная дата начала");

    // этап: либо передан, либо первый этап сезона (или создаём автоматически)
    let stage: { id: string } | null = stageId ? await db.stage.findUnique({ where: { id: stageId }, select: { id: true } }) : null;
    if (stageId && !stage) throw new HttpError(404, "Этап не найден");
    if (!stage) {
      if (!seasonId) throw new HttpError(422, "Укажите сезон или этап");
      const season = await db.season.findUnique({ where: { id: seasonId }, include: { stages: true, league: true } });
      if (!season) throw new HttpError(404, "Сезон не найден");
      stage = season.stages[0] ?? (await db.stage.create({ data: { seasonId: season.id, name: "Регулярный чемпионат", type: "ROUND_ROBIN" } }));
    }
    if (!stage) throw new HttpError(422, "Не удалось определить этап для матча");

    const [home, away] = await Promise.all([
      db.team.findUnique({ where: { id: homeTeamId } }),
      db.team.findUnique({ where: { id: awayTeamId } }),
    ]);
    if (!home || !away) throw new HttpError(404, "Одна из команд не найдена");

    if (stadiumId) {
      const st = await db.stadium.findUnique({ where: { id: stadiumId } });
      if (!st) throw new HttpError(404, "Стадион не найден");
    }
    if (refereeId) {
      const ref = await db.person.findFirst({ where: { id: refereeId, isReferee: true } });
      if (!ref) throw new HttpError(422, "Указанный судья не найден");
    }

    const match = await db.match.create({
      data: {
        stageId: stage.id,
        round: round ? Number(round) : null,
        homeTeamId, awayTeamId,
        stadiumId: stadiumId || null,
        refereeId: refereeId || null,
        kickoff: kickoffDate,
        note: note || null,
      },
    });
    await audit(user, "Match", match.id, "CREATE", null, { stageId: stage.id, round, homeTeamId, awayTeamId, kickoff, stadiumId, refereeId });
    return Response.json({ ok: true, match });
  } catch (e) {
    return errorResponse(e);
  }
}
