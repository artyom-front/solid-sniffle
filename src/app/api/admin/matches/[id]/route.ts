// Судейский протокол (PRD §6 PWA + Epic 1/2 инварианты).
// RBAC: REFEREE — только свои матчи; LEAGUE_ADMIN / SUPER_ADMIN — любые.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { validateEvent, completeMatch, resetMatch, assignWalkover, computeScore, audit, getEligiblePlayers, isRegisteredOn } from "@/lib/engine/lifecycle";
import { assertNotSuspended } from "@/lib/engine/discipline";

async function assertMatchAccess(matchId: string) {
  const user = await requireRole("REFEREE", "LEAGUE_ADMIN", "SUPER_ADMIN");
  const match = await db.match.findUnique({ where: { id: matchId }, include: { stage: true } });
  if (!match) throw new HttpError(404, "Матч не найден");
  if (user.role === "REFEREE") {
    if (!user.personId || match.refereeId !== user.personId) {
      throw new HttpError(403, "Судья может вводить протокол только для назначенных ему матчей");
    }
  }
  return { user, match };
}

/** Данные для редактора протокола: доступные игроки с флагами + текущие события/составы */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireRole("REFEREE", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const match = await db.match.findUnique({
      where: { id },
      include: { homeTeam: true, awayTeam: true, referee: true, stage: { include: { season: { include: { league: true } } } } },
    });
    if (!match) throw new HttpError(404, "Матч не найден");
    if (user.role === "REFEREE" && (!user.personId || match.refereeId !== user.personId)) {
      throw new HttpError(403, "Этот матч не назначен вам");
    }

    const [home, away, events, lineups] = await Promise.all([
      getEligiblePlayers(id, match.homeTeamId),
      getEligiblePlayers(id, match.awayTeamId),
      db.matchEvent.findMany({ where: { matchId: id }, include: { person: true, assistPerson: true }, orderBy: { minute: "asc" } }),
      db.lineupEntry.findMany({ where: { matchId: id } }),
    ]);

    const referees = await db.person.findMany({ where: { isReferee: true } });

    return Response.json({
      match: {
        id: match.id,
        round: match.round,
        kickoff: match.kickoff.toISOString(),
        status: match.status,
        walkoverType: match.walkoverType,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        note: match.note,
        homeTeam: { id: match.homeTeam.id, name: match.homeTeam.name },
        awayTeam: { id: match.awayTeam.id, name: match.awayTeam.name },
        referee: match.referee ? { id: match.referee.id, name: `${match.referee.lastName} ${match.referee.firstName}` } : null,
        season: { id: match.stage.season.id, name: match.stage.season.name },
        league: { id: match.stage.season.league.id, name: match.stage.season.league.name, walkoverScore: match.stage.season.league.walkoverScore },
      },
      eligible: { home, away },
      events: events.map((e) => ({
        id: e.id, minute: e.minute, type: e.type, teamId: e.teamId,
        person: { id: e.person.id, name: `${e.person.lastName} ${e.person.firstName}` },
        assist: e.assistPerson ? { id: e.assistPerson.id, name: `${e.assistPerson.lastName} ${e.assistPerson.firstName}` } : null,
      })),
      lineup: lineups.map((l) => ({ teamId: l.teamId, personId: l.personId, isStarter: l.isStarter, number: l.number })),
      referees: referees.map((r) => ({ id: r.id, name: `${r.lastName} ${r.firstName} ${r.middleName ?? ""}`.trim() })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { user, match } = await assertMatchAccess(id);
    const body = await req.json();
    const action = body.action as string;

    switch (action) {
      // ---------- Добавление события протокола ----------
      case "event": {
        const { minute, type, personId, teamId, assistPersonId } = body;
        if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90].includes(Number(minute)) && !(Number(minute) >= 1 && Number(minute) <= 120)) {
          throw new HttpError(422, "Минута должна быть от 1 до 120");
        }
        const validTypes = [
          "GOAL", "PENALTY", "OWN_GOAL", "YELLOW_CARD", "RED_CARD",
          "SUB_OUT", "SUB_IN",
          "VAR_GOAL_CONFIRM", "VAR_GOAL_CANCEL", "VAR_PENALTY",
        ];
        if (!validTypes.includes(type)) throw new HttpError(422, "Неизвестный тип события");
        if (!personId || !teamId) throw new HttpError(422, "Укажите игрока и команду");

        // Инварианты Epic 1 + Epic 3: заявка на дату матча + отсутствие дисквалификации
        await validateEvent(id, personId, teamId, assistPersonId ?? null);

        // «На поле»: игрок должен быть в заявке на матч, если состав уже подан
        if (type !== "SUB_IN") {
          const lineupCount = await db.lineupEntry.count({ where: { matchId: id, teamId } });
          if (lineupCount > 0) {
            const inLineup = await db.lineupEntry.findFirst({ where: { matchId: id, teamId, personId } });
            if (!inLineup) throw new HttpError(409, "Игрок не заявлен в состав на этот матч");
          }
        }

        const event = await db.matchEvent.create({
          data: { matchId: id, minute: Number(minute), type, personId, teamId, assistPersonId: assistPersonId ?? null },
        });

        // match → LIVE, счёт пересчитывается сразу (в проде — событие в очереди)
        const score = await computeScore(id);
        if (match.status === "SCHEDULED") {
          await db.match.update({ where: { id }, data: { status: "LIVE", homeScore: score.home, awayScore: score.away } });
        } else if (match.status === "LIVE") {
          await db.match.update({ where: { id }, data: { homeScore: score.home, awayScore: score.away } });
        }

        await audit(user, "MatchEvent", event.id, "CREATE", null, { matchId: id, minute, type, personId, teamId, assistPersonId: assistPersonId ?? null });
        return Response.json({ ok: true, event, score });
      }

      // ---------- Удаление события ----------
      case "deleteEvent": {
        const { eventId } = body;
        const event = await db.matchEvent.findUnique({ where: { id: eventId } });
        if (!event || event.matchId !== id) throw new HttpError(404, "Событие не найдено");
        if (match.status === "COMPLETED") throw new HttpError(409, "Матч завершён — сначала верните его в работу");
        await db.matchEvent.delete({ where: { id: eventId } });
        const score = await computeScore(id);
        if (match.status !== "SCHEDULED") {
          await db.match.update({ where: { id }, data: { homeScore: score.home, awayScore: score.away } });
        }
        await audit(user, "MatchEvent", eventId, "DELETE", event, null);
        return Response.json({ ok: true, score });
      }

      // ---------- Заявка состава (инвариант: дисквалифицированные запрещены) ----------
      case "lineup": {
        const { teamId, personIds } = body as { teamId: string; personIds: string[] };
        if (teamId !== match.homeTeamId && teamId !== match.awayTeamId) throw new HttpError(422, "Команда не участвует в матче");
        if (match.status === "COMPLETED" || match.status === "WALKOVER") throw new HttpError(409, "Матч уже завершён");

        for (const personId of personIds) {
          const reg = await isRegisteredOn(personId, teamId, match.stage.seasonId, match.kickoff);
          if (!reg) throw new HttpError(409, `Игрок не заявлен за эту команду на дату матча (Registration)`);
          await assertNotSuspended(personId, match.stage.seasonId); // бросит 409 с деталями
        }
        const old = await db.lineupEntry.findMany({ where: { matchId: id, teamId } });
        await db.lineupEntry.deleteMany({ where: { matchId: id, teamId } });
        await db.lineupEntry.createMany({
          data: personIds.map((personId, i) => ({ matchId: id, teamId, personId, isStarter: true, number: i + 1 })),
        });
        await audit(user, "Lineup", `${id}:${teamId}`, "UPDATE", old.map((l) => l.personId), personIds);
        return Response.json({ ok: true });
      }

      // ---------- Назначение судьи ----------
      case "referee": {
        const { refereeId } = body;
        const ref = await db.person.findFirst({ where: { id: refereeId, isReferee: true } });
        if (!ref) throw new HttpError(422, "Указанный судья не найден");
        await db.match.update({ where: { id }, data: { refereeId } });
        await audit(user, "Match", id, "UPDATE", { refereeId: match.refereeId }, { refereeId });
        return Response.json({ ok: true });
      }

      // ---------- Завершение ----------
      case "complete": {
        const score = await completeMatch(id, user);
        return Response.json({ ok: true, score });
      }

      // ---------- Техническое поражение (Epic 2) ----------
      case "walkover": {
        const { walkoverType, note } = body;
        if (!["HOME", "AWAY", "BOTH"].includes(walkoverType)) throw new HttpError(422, "Неверный тип техпоражения");
        await assignWalkover(id, walkoverType, user, note);
        return Response.json({ ok: true });
      }

      // ---------- Reopen (только супер-админ) ----------
      case "reset": {
        if (user.role !== "SUPER_ADMIN") throw new HttpError(403, "Только супер-администратор может вернуть матч в работу");
        await resetMatch(id, user);
        return Response.json({ ok: true });
      }

      default:
        throw new HttpError(422, "Неизвестное действие");
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";

// ---------- Редактирование матча (дата/время, стадион, судья, тур, статус, команды) ----------
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const match = await db.match.findUnique({ where: { id }, include: { _count: { select: { events: true, lineups: true } } } });
    if (!match) throw new HttpError(404, "Матч не найден");
    if (match.status === "COMPLETED" || match.status === "WALKOVER") {
      throw new HttpError(409, "Матч завершён — верните его в работу (Reset), прежде чем редактировать");
    }
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.kickoff !== undefined) {
      const d = new Date(String(body.kickoff));
      if (Number.isNaN(d.getTime())) throw new HttpError(422, "Некорректная дата начала");
      data.kickoff = d;
    }
    if (body.round !== undefined) data.round = body.round ? Number(body.round) : null;
    if (body.stadiumId !== undefined) {
      if (body.stadiumId) {
        const st = await db.stadium.findUnique({ where: { id: body.stadiumId } });
        if (!st) throw new HttpError(404, "Стадион не найден");
      }
      data.stadiumId = body.stadiumId || null;
    }
    if (body.refereeId !== undefined) {
      if (body.refereeId) {
        const ref = await db.person.findFirst({ where: { id: body.refereeId, isReferee: true } });
        if (!ref) throw new HttpError(422, "Указанный судья не найден");
      }
      data.refereeId = body.refereeId || null;
    }
    if (body.note !== undefined) data.note = body.note || null;
    if (body.status !== undefined) {
      if (!["SCHEDULED", "POSTPONED"].includes(body.status)) throw new HttpError(422, "Статус: SCHEDULED или POSTPONED (LIVE/COMPLETED управляются протоколом)");
      data.status = body.status;
    }
    if (body.homeTeamId !== undefined || body.awayTeamId !== undefined) {
      if (match._count.events > 0 || match._count.lineups > 0) {
        throw new HttpError(409, "Нельзя менять команды: у матча уже есть события или составы");
      }
      const homeId = body.homeTeamId ?? match.homeTeamId;
      const awayId = body.awayTeamId ?? match.awayTeamId;
      if (homeId === awayId) throw new HttpError(422, "Команды должны различаться");
      const [home, away] = await Promise.all([
        db.team.findUnique({ where: { id: homeId } }),
        db.team.findUnique({ where: { id: awayId } }),
      ]);
      if (!home || !away) throw new HttpError(404, "Одна из команд не найдена");
      if (body.homeTeamId !== undefined) data.homeTeamId = homeId;
      if (body.awayTeamId !== undefined) data.awayTeamId = awayId;
    }

    const updated = await db.match.update({ where: { id }, data });
    await audit(user, "Match", id, "UPDATE", match, updated);
    return Response.json({ ok: true, match: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

// ---------- Удаление матча (только без протокола) ----------
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const match = await db.match.findUnique({
      where: { id },
      include: { _count: { select: { events: true, lineups: true, ratings: true } } },
    });
    if (!match) throw new HttpError(404, "Матч не найден");
    if (match._count.events > 0 || match._count.lineups > 0 || match._count.ratings > 0) {
      throw new HttpError(409, "Нельзя удалить матч с протоколом: очистите события и составы (или Reset для завершённого)");
    }
    await db.match.delete({ where: { id } });
    await audit(user, "Match", id, "DELETE", match, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
