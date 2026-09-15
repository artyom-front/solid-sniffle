// Судейский протокол (PRD §6 PWA + Epic 1/2 инварианты).
// RBAC: REFEREE — только свои матчи; LEAGUE_ADMIN / SUPER_ADMIN — любые.
// v1.0.19: бригада матча (MatchOfficial +/-), замена = одно событие
// SUBSTITUTION с двумя игроками, минуты 45+X (stoppage), участник
// события — только из протокола, безопасные поля завершённого матча
// (дата/стадион/тур/примечание) редактируются без Reset.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { validateEvent, completeMatch, resetMatch, assignWalkover, computeScore, audit, getEligiblePlayers, isRegisteredOn } from "@/lib/engine/lifecycle";
import { assertNotSuspended } from "@/lib/engine/discipline";
import { assertRefereeAssignmentAllowed } from "@/lib/engine/conflicts";
import { MATCH_OFFICIAL_ROLE_CODES, roleName as officialRoleName } from "@/lib/roles";

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

/** Данные для редактора протокола: доступные игроки с флагами + текущие события/составы/бригада */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireRole("REFEREE", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const match = await db.match.findUnique({
      where: { id },
      include: {
        homeTeam: true, awayTeam: true, referee: true,
        stage: { include: { season: { include: { league: true } } } },
        officials: { include: { person: true } },
      },
    });
    if (!match) throw new HttpError(404, "Матч не найден");
    if (user.role === "REFEREE" && (!user.personId || match.refereeId !== user.personId)) {
      throw new HttpError(403, "Этот матч не назначен вам");
    }

    const [home, away, events, lineups] = await Promise.all([
      getEligiblePlayers(id, match.homeTeamId),
      getEligiblePlayers(id, match.awayTeamId),
      db.matchEvent.findMany({
        where: { matchId: id },
        include: { person: true, assistPerson: true },
        orderBy: [{ minute: "asc" }, { stoppage: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      }),
      db.lineupEntry.findMany({ where: { matchId: id } }),
    ]);

    // кандидаты в бригаду: судейский корпус (isReferee) + все, у кого на карточке
    // роль из судейского корпуса или врач — по ним и есть смысл выбора
    const officialRoleCodes = [...MATCH_OFFICIAL_ROLE_CODES];
    const referees = await db.person.findMany({
      where: { OR: [{ isReferee: true }, { roles: { hasSome: officialRoleCodes } }] },
      orderBy: [{ lastName: "asc" }],
    });

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
        isFriendly: match.isFriendly,
        protocolUrl: match.protocolUrl,
        protocolFileName: match.protocolFileName,
        homeTeam: { id: match.homeTeam.id, name: match.homeTeam.name },
        awayTeam: { id: match.awayTeam.id, name: match.awayTeam.name },
        referee: match.referee ? { id: match.referee.id, name: `${match.referee.lastName} ${match.referee.firstName}` } : null,
        season: match.stage ? { id: match.stage.season.id, name: match.stage.season.name } : null,
        league: match.stage
          ? { id: match.stage.season.league.id, name: match.stage.season.league.name, walkoverScore: match.stage.season.league.walkoverScore }
          : { id: "", name: "Товарищеские матчи", walkoverScore: 3 },
      },
      eligible: { home, away },
      events: events.map((e) => ({
        id: e.id, minute: e.minute, stoppage: e.stoppage, type: e.type, teamId: e.teamId,
        person: { id: e.person.id, name: `${e.person.lastName} ${e.person.firstName}` },
        assist: e.assistPerson ? { id: e.assistPerson.id, name: `${e.assistPerson.lastName} ${e.assistPerson.firstName}` } : null,
      })),
      lineup: lineups.map((l) => ({ teamId: l.teamId, personId: l.personId, isStarter: l.isStarter, number: l.number })),
      officials: match.officials.map((o) => ({
        id: o.id, role: o.role,
        person: { id: o.person.id, name: `${o.person.lastName} ${o.person.firstName}` },
      })),
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
        const { minute, stoppage, type, personId, teamId, assistPersonId } = body;
        if (!(Number(minute) >= 1 && Number(minute) <= 120)) {
          throw new HttpError(422, "Минута должна быть от 1 до 120");
        }
        if (stoppage !== undefined && stoppage !== null && stoppage !== "") {
          if (!(Number(stoppage) >= 1 && Number(stoppage) <= 15)) {
            throw new HttpError(422, "Добавленное время — от +1 до +15");
          }
        }
        const validTypes = [
          "GOAL", "PENALTY", "OWN_GOAL", "YELLOW_CARD", "RED_CARD",
          "SUBSTITUTION",
          "VAR_GOAL_CONFIRM", "VAR_GOAL_CANCEL", "VAR_PENALTY",
        ];
        if (!validTypes.includes(type)) throw new HttpError(422, "Неизвестный тип события");
        if (!personId || !teamId) throw new HttpError(422, "Укажите игрока и команду");

        // Замена = ОДНО событие с двумя игроками: personId — вышедший,
        // assistPersonId — ушедший. Оба обязательны.
        if (type === "SUBSTITUTION" && !assistPersonId) {
          throw new HttpError(422, "Для замены укажите оба игрока: кто выходит и кто уходит");
        }
        if (type === "SUBSTITUTION" && assistPersonId === personId) {
          throw new HttpError(422, "Вышедший и ушедший игрок не могут совпадать");
        }

        // Инварианты Epic 1 + Epic 3: состав протокола (или заявка, если
        // состав не подан) + отсутствие дисквалификации. Для SUBSTITUTION
        // вышедший (personId) exempt от проверки состава — как SUB_IN.
        if (type === "SUBSTITUTION") {
          if (match.status === "COMPLETED") throw new HttpError(409, "Матч уже завершён — сначала верните его в работу");
          if (match.status === "WALKOVER") throw new HttpError(409, "Матч оформлен как техническое поражение — события недоступны");
          if (teamId !== match.homeTeamId && teamId !== match.awayTeamId) throw new HttpError(422, "Команда не участвует в этом матче");
          if (match.stage && !match.isFriendly) {
            // уходит — только из протокола/заявки; выходит — заявка не обязательна
            const outOk = await db.lineupEntry.findFirst({ where: { matchId: id, teamId, personId: assistPersonId } });
            if (!outOk) {
              const registered = await isRegisteredOn(assistPersonId, teamId, match.stage.seasonId, match.kickoff);
              if (!registered) throw new HttpError(409, "Уходящий игрок не заявлен за эту команду на дату матча");
            }
            await assertNotSuspended(assistPersonId, match.stage.seasonId);
            await assertNotSuspended(personId, match.stage.seasonId);
          }
        } else {
          await validateEvent(id, personId, teamId, assistPersonId ?? null);
        }

        const event = await db.matchEvent.create({
          data: {
            matchId: id, minute: Number(minute),
            stoppage: stoppage ? Number(stoppage) : null,
            type, personId, teamId, assistPersonId: assistPersonId ?? null,
          },
        });

        // match → LIVE, счёт пересчитывается сразу (в проде — событие в очереди)
        const score = await computeScore(id);
        if (match.status === "SCHEDULED") {
          await db.match.update({ where: { id }, data: { status: "LIVE", homeScore: score.home, awayScore: score.away } });
        } else if (match.status === "LIVE") {
          await db.match.update({ where: { id }, data: { homeScore: score.home, awayScore: score.away } });
        }

        await audit(user, "MatchEvent", event.id, "CREATE", null, { matchId: id, minute, stoppage: stoppage ?? null, type, personId, teamId, assistPersonId: assistPersonId ?? null });
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

        // номера игроков — из заявки на сезон (товарищеский: из любой активной заявки)
        const regNumbers = new Map<string, number>();
        const regs = await db.registration.findMany({
          where: {
            teamId,
            personId: { in: personIds },
            ...(match.stage ? { seasonId: match.stage.seasonId } : {}),
            OR: [{ endDate: null }, { endDate: { gte: match.kickoff } }],
          },
          orderBy: { startDate: "desc" },
        });
        for (const r of regs) if (r.number != null && !regNumbers.has(r.personId)) regNumbers.set(r.personId, r.number);

        if (match.stage) {
          for (const personId of personIds) {
            const reg = await isRegisteredOn(personId, teamId, match.stage.seasonId, match.kickoff);
            if (!reg) throw new HttpError(409, `Игрок не заявлен за эту команду на дату матча (Registration)`);
            await assertNotSuspended(personId, match.stage.seasonId); // бросит 409 с деталями
          }
        }
        const old = await db.lineupEntry.findMany({ where: { matchId: id, teamId } });
        await db.lineupEntry.deleteMany({ where: { matchId: id, teamId } });
        await db.lineupEntry.createMany({
          data: personIds.map((personId, i) => ({
            matchId: id, teamId, personId, isStarter: true,
            number: regNumbers.get(personId) ?? i + 1,
          })),
        });
        await audit(user, "Lineup", `${id}:${teamId}`, "UPDATE", old.map((l) => l.personId), personIds);
        return Response.json({ ok: true });
      }

      // ---------- Файл протокола (скан/PDF) ----------
      case "protocol": {
        const { protocolUrl, protocolFileName } = body as { protocolUrl?: string; protocolFileName?: string };
        if (protocolUrl && !/^\/api\/media\/[a-z0-9]+$/i.test(protocolUrl)) {
          throw new HttpError(422, "Некорректная ссылка на файл");
        }
        const oldValue = { protocolUrl: match.protocolUrl, protocolFileName: match.protocolFileName };
        await db.match.update({
          where: { id },
          data: { protocolUrl: protocolUrl || null, protocolFileName: protocolFileName || null },
        });
        await audit(user, "Match", id, "UPDATE", oldValue, { protocolUrl: protocolUrl || null, protocolFileName: protocolFileName || null });
        return Response.json({ ok: true });
      }

      // ---------- Назначение главного судьи ----------
      case "referee": {
        const { refereeId } = body;
        const ref = await db.person.findFirst({ where: { id: refereeId, isReferee: true } });
        if (!ref) throw new HttpError(422, "Указанный судья не найден");
        // «Судья ≠ игрок»: не назначать судёй игрока этого сезона и
        // заявленных за команды-участницы (товарищеские — без сезона)
        await assertRefereeAssignmentAllowed(db, refereeId, match.stage?.seasonId ?? null, [match.homeTeamId, match.awayTeamId]);
        await db.$transaction([
          db.match.update({ where: { id }, data: { refereeId } }),
          db.matchOfficial.upsert({
            where: { matchId_personId_role: { matchId: id, personId: refereeId, role: "REFEREE" } },
            create: { matchId: id, personId: refereeId, role: "REFEREE" },
            update: {},
          }),
        ]);
        await audit(user, "Match", id, "UPDATE", { refereeId: match.refereeId }, { refereeId });
        return Response.json({ ok: true });
      }

      // ---------- Бригада матча: добавить официальное лицо ----------
      case "official": {
        const { role, personId } = body as { role: string; personId: string };
        if (!MATCH_OFFICIAL_ROLE_CODES.has(role)) throw new HttpError(422, "Неизвестная роль бригады");
        if (role === "REFEREE") throw new HttpError(422, "Главный судья назначается отдельным действием");
        if (!personId) throw new HttpError(422, "Укажите персону");
        const person = await db.person.findUnique({ where: { id: personId } });
        if (!person) throw new HttpError(404, "Персона не найдена");

        const exists = await db.matchOfficial.findUnique({
          where: { matchId_personId_role: { matchId: id, personId, role } },
        });
        if (exists) throw new HttpError(409, `${officialRoleName(role)} уже назначен`);

        // Нейтральность: конфликт интересов с командами-участницами
        await assertRefereeAssignmentAllowed(db, personId, match.stage?.seasonId ?? null, [match.homeTeamId, match.awayTeamId], role);

        const official = await db.matchOfficial.create({ data: { matchId: id, personId, role } });
        await audit(user, "MatchOfficial", official.id, "CREATE", null, { matchId: id, personId, role });
        return Response.json({ ok: true, official });
      }

      // ---------- Бригада матча: убрать официальное лицо ----------
      case "officialRemove": {
        const { officialId } = body as { officialId: string };
        const official = await db.matchOfficial.findUnique({ where: { id: officialId } });
        if (!official || official.matchId !== id) throw new HttpError(404, "Официальное лицо не найдено");
        await db.matchOfficial.delete({ where: { id: officialId } });
        await audit(user, "MatchOfficial", officialId, "DELETE", official, null);
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

// ---------- Редактирование матча ----------
// v1.0.19: завершённый матч можно редактировать по БЕЗОПАСНЫМ полям —
// дата/время, стадион, тур, примечание, бригада (протокол не затрагивается).
// Команды и статус по-прежнему только до завершения (статус COMPLETED
// управляется протоколом: complete / reset).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const match = await db.match.findUnique({ where: { id }, include: { _count: { select: { events: true, lineups: true } }, stage: { select: { seasonId: true } } } });
    if (!match) throw new HttpError(404, "Матч не найден");
    const isFinished = match.status === "COMPLETED" || match.status === "WALKOVER";
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
        // «Судья ≠ игрок» в этом чемпионате+сезоне и запрет судить свою команду
        await assertRefereeAssignmentAllowed(db, body.refereeId, match.stage?.seasonId ?? null, [match.homeTeamId, match.awayTeamId]);
      }
      data.refereeId = body.refereeId || null;
    }
    if (body.note !== undefined) data.note = body.note || null;
    if (body.status !== undefined) {
      if (isFinished) {
        throw new HttpError(409, `Статус «${match.status === "COMPLETED" ? "Завершён" : "Техпоражение"}» управляется протоколом: верните матч в работу (Reset) на вкладке «Завершение»`);
      }
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

    // ---------- Бригада матча (полная синхронизация массивом) ----------
    if (Array.isArray(body.officials)) {
      const desired = (body.officials as { role: string; personId: string }[]).filter(
        (o) => o && MATCH_OFFICIAL_ROLE_CODES.has(o.role) && o.personId
      );
      // дубликаты пар роль+персона — ошибка
      const seen = new Set<string>();
      for (const o of desired) {
        const key = `${o.role}:${o.personId}`;
        if (seen.has(key)) throw new HttpError(422, "Дубликат в бригаде: одна и та же персона в одной роли");
        seen.add(key);
      }
      const current = await db.matchOfficial.findMany({ where: { matchId: id } });

      // главный судья — отдельно (синхронизация refereeId)
      const desiredReferee = desired.find((o) => o.role === "REFEREE");
      if (desiredReferee && desiredReferee.personId !== match.refereeId) {
        const ref = await db.person.findFirst({ where: { id: desiredReferee.personId, isReferee: true } });
        if (!ref) throw new HttpError(422, "Указанный главный судья не найден");
        await assertRefereeAssignmentAllowed(db, desiredReferee.personId, match.stage?.seasonId ?? null, [match.homeTeamId, match.awayTeamId]);
        await db.match.update({ where: { id }, data: { refereeId: desiredReferee.personId } });
      }
      if (!desiredReferee && match.refereeId && body.refereeId === undefined) {
        // главный судья убран из бригады — снять и с матча
        await db.match.update({ where: { id }, data: { refereeId: null } });
      }

      // добавляем новые назначения (кроме REFEREE — уже обработан)
      for (const o of desired) {
        if (o.role === "REFEREE") {
          await db.matchOfficial.upsert({
            where: { matchId_personId_role: { matchId: id, personId: o.personId, role: "REFEREE" } },
            create: { matchId: id, personId: o.personId, role: "REFEREE" },
            update: {},
          });
          continue;
        }
        const exists = current.some((c) => c.role === o.role && c.personId === o.personId);
        if (!exists) {
          const person = await db.person.findUnique({ where: { id: o.personId } });
          if (!person) throw new HttpError(404, `Персона для роли «${officialRoleName(o.role)}» не найдена`);
          await assertRefereeAssignmentAllowed(db, o.personId, match.stage?.seasonId ?? null, [match.homeTeamId, match.awayTeamId], o.role);
          await db.matchOfficial.create({ data: { matchId: id, personId: o.personId, role: o.role } });
        }
      }
      // удаляем снятые назначения
      for (const c of current) {
        const still = desired.some((o) => o.role === c.role && o.personId === c.personId);
        if (!still) await db.matchOfficial.delete({ where: { id: c.id } });
      }
      await audit(user, "Match", id, "UPDATE", { officials: current.map((c) => ({ role: c.role, personId: c.personId })) }, { officials: desired });
    }

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
