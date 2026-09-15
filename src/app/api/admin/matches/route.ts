// Список матчей для админ-панели/судьи: REFEREE видит только свои назначения. POST — создание матча.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { assertRefereeAssignmentAllowed } from "@/lib/engine/conflicts";
import { MATCH_OFFICIAL_ROLE_CODES, roleName as officialRoleName } from "@/lib/roles";

/** Создание записей бригады матча с проверками нейтральности.
 *  Главный судья дополнительно пишется в match.refereeId. */
async function createOfficials(
  matchId: string,
  officials: { role: string; personId: string }[],
  seasonId: string | null,
  teamIds: [string, string],
  refereeId: string | null
): Promise<string | null> {
  let mainReferee = refereeId;
  for (const o of officials) {
    if (!MATCH_OFFICIAL_ROLE_CODES.has(o.role) || !o.personId) {
      throw new HttpError(422, "Некорректная запись бригады матча");
    }
    const person = await db.person.findUnique({ where: { id: o.personId } });
    if (!person) throw new HttpError(404, `Персона для роли «${officialRoleName(o.role)}» не найдена`);
    await assertRefereeAssignmentAllowed(db, o.personId, seasonId, teamIds, o.role);
    await db.matchOfficial.create({ data: { matchId, personId: o.personId, role: o.role } });
    if (o.role === "REFEREE") mainReferee = o.personId;
  }
  return mainReferee;
}

export async function GET(req: Request) {
  try {
    const user = await requireRole("REFEREE", "CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { searchParams } = new URL(req.url);
    const seasonId = searchParams.get("seasonId");
    if (!seasonId) return Response.json({ error: "Укажите seasonId" }, { status: 422 });

    // seasonId=friendly — список товарищеских матчей (вне сезонов)
    const isFriendlyList = seasonId === "friendly";

    const matches = await db.match.findMany({
      where: {
        ...(isFriendlyList
          ? { isFriendly: true }
          : { stage: { seasonId }, ...(user.role === "REFEREE" ? { refereeId: user.personId ?? "__none__" } : {}) }),
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        referee: true,
        stage: { include: { season: { include: { league: true } } } },
        officials: { include: { person: true } },
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
        isFriendly: m.isFriendly,
        homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name },
        awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name },
        referee: m.referee ? { id: m.referee.id, name: `${m.referee.lastName} ${m.referee.firstName}` } : null,
        officials: m.officials.map((o) => ({
          id: o.id, role: o.role,
          person: { id: o.person.id, name: `${o.person.lastName} ${o.person.firstName}` },
        })),
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

    // ---------- Массовое удаление матчей без протокола ----------
    if (body.action === "bulk-delete") {
      const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (ids.length === 0) throw new HttpError(422, "Ничего не выбрано");
      const matches = await db.match.findMany({
        where: { id: { in: ids } },
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          _count: { select: { events: true, lineups: true, ratings: true } },
        },
      });
      const deleted: string[] = [];
      const blocked: { id: string; label: string; reason: string }[] = [];
      for (const m of matches) {
        if (m._count.events > 0 || m._count.lineups > 0 || m._count.ratings > 0) {
          blocked.push({
            id: m.id,
            label: `${m.homeTeam.name} — ${m.awayTeam.name}`,
            reason: "есть протокол (события/составы/оценки) — сначала Reset и очистка",
          });
          continue;
        }
        await db.match.delete({ where: { id: m.id } });
        await audit(user, "Match", m.id, "DELETE", null, { bulk: true });
        deleted.push(m.id);
      }
      return Response.json({ ok: true, deleted: deleted.length, blocked });
    }

    const { seasonId, stageId, round, homeTeamId, awayTeamId, kickoff, stadiumId, refereeId, note, isFriendly, officials } = body;

    if (!homeTeamId || !awayTeamId) throw new HttpError(422, "Укажите обе команды");
    if (homeTeamId === awayTeamId) throw new HttpError(422, "Команды должны различаться");
    if (!kickoff) throw new HttpError(422, "Укажите дату и время начала");
    const kickoffDate = new Date(String(kickoff));
    if (Number.isNaN(kickoffDate.getTime())) throw new HttpError(422, "Некорректная дата начала");

    // Товарищеский матч: без лиги/сезона/тура — вне таблиц и статистики
    if (isFriendly) {
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
          stageId: null,
          isFriendly: true,
          round: null,
          homeTeamId, awayTeamId,
          stadiumId: stadiumId || null,
          refereeId: refereeId || null,
          kickoff: kickoffDate,
          note: note || null,
        },
      });
      // бригада матча (главный судья уже в refereeId — не дублируем)
      const list = Array.isArray(officials) ? officials.filter((o: { role?: string }) => o?.role !== "REFEREE") : [];
      if (list.length > 0) {
        await createOfficials(match.id, list, null, [homeTeamId, awayTeamId], refereeId || null);
      }
      await audit(user, "Match", match.id, "CREATE", null, { isFriendly: true, homeTeamId, awayTeamId, kickoff, stadiumId, refereeId, officials: list });
      return Response.json({ ok: true, match });
    }

    // этап: либо передан, либо первый этап сезона (или создаём автоматически)
    let stage: { id: string; seasonId: string } | null = stageId ? await db.stage.findUnique({ where: { id: stageId }, select: { id: true, seasonId: true } }) : null;
    if (stageId && !stage) throw new HttpError(404, "Этап не найден");
    if (!stage) {
      if (!seasonId) throw new HttpError(422, "Укажите сезон или этап (или отметьте «Товарищеский»)");
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
      // «Судья ≠ игрок» в этом чемпионате+сезоне; также запрет судить матч
      // своей команды (товарищеские — без сезона, не проверяются)
      await assertRefereeAssignmentAllowed(db, refereeId, stage.seasonId, [homeTeamId, awayTeamId]);
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
    // бригада матча: помощники/резервный/VAR/инспектор/делегат/врач (+
    // синхронизация главного судьи, если он пришёл в массиве officials)
    const list = Array.isArray(officials) ? officials : [];
    if (list.length > 0) {
      const mainReferee = await createOfficials(match.id, list, stage.seasonId, [homeTeamId, awayTeamId], refereeId || null);
      if (mainReferee !== (refereeId || null)) {
        await db.match.update({ where: { id: match.id }, data: { refereeId: mainReferee } });
      }
    }
    await audit(user, "Match", match.id, "CREATE", null, { stageId: stage.id, round, homeTeamId, awayTeamId, kickoff, stadiumId, refereeId, officials: list });
    return Response.json({ ok: true, match });
  } catch (e) {
    return errorResponse(e);
  }
}
