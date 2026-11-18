// CRUD команд: карточка (GET), обновление (PATCH) и умное удаление (DELETE).
//
// Удаление — по принципу «нет тупиков»: 409 приходит со структурой
// { code, dependencies, cascadeAllowed } — UI предлагает действие.
// Каскад: команда без матчей удаляется вместе со своими заявками
// (заявки не существуют без команды; история матчей неприкосновенна).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const team = await db.team.findUnique({
      where: { id },
      include: {
        club: { select: { id: true, name: true } },
        _count: { select: { homeMatches: true, awayMatches: true, registrations: true } },
      },
    });
    if (!team) throw new HttpError(404, "Команда не найдена");

    // Заявки по сезонам: человек (фото/позиция/роли) + сезон + лига
    const regs = await db.registration.findMany({
      where: { teamId: id },
      include: {
        person: { select: { id: true, firstName: true, lastName: true, middleName: true, photoUrl: true, position: true, roles: true, birthDate: true } },
        season: { select: { id: true, name: true, isCurrent: true, league: { select: { id: true, name: true, shortName: true } } } },
      },
      orderBy: [{ seasonId: "asc" }, { startDate: "asc" }],
    });

    const matchesCount = team._count.homeMatches + team._count.awayMatches;

    // Последние матчи команды (обе стороны) — для вкладки «Матчи»
    const matches = await db.match.findMany({
      where: { OR: [{ homeTeamId: id }, { awayTeamId: id }] },
      orderBy: { kickoff: "desc" },
      take: 30,
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
    });

    return Response.json({
      team: {
        id: team.id, name: team.name, city: team.city, logoUrl: team.logoUrl,
        club: team.club,
        matchesCount,
        registrationsCount: team._count.registrations,
        canDelete: matchesCount === 0,
        deleteBlockers: { matches: matchesCount, registrations: team._count.registrations },
      },
      seasons: [...new Map(regs.map((r) => [r.season.id, r.season])).values()]
        .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)),
      registrations: regs.map((r) => ({
        id: r.id,
        personId: r.person.id,
        personName: `${r.person.lastName} ${r.person.firstName}`.trim(),
        personPhoto: r.person.photoUrl,
        personPosition: r.person.position,
        personRoles: r.person.roles,
        personBirthYear: r.person.birthDate ? new Date(r.person.birthDate).getFullYear() : null,
        seasonId: r.season.id,
        seasonName: r.season.name,
        leagueName: r.season.league.shortName ?? r.season.league.name,
        number: r.number,
        role: r.role,
        startDate: r.startDate,
        endDate: r.endDate,
        status: r.status,
      })),
      matches: matches.map((m) => ({
        id: m.id, kickoff: m.kickoff, status: m.status, round: m.round, isFriendly: m.isFriendly,
        homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeScore: m.homeScore, awayScore: m.awayScore,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const team = await db.team.findUnique({ where: { id } });
    if (!team) throw new HttpError(404, "Команда не найдена");
    // CLUB_ADMIN редактирует только команды своего клуба
    if (user.role === "CLUB_ADMIN" && team.clubId !== user.clubId) {
      throw new HttpError(403, "Клубный администратор может редактировать только команды своего клуба");
    }
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) throw new HttpError(422, "Название не может быть пустым");
      data.name = String(body.name).trim();
    }
    if (body.clubId !== undefined) {
      // SECURITY (BOLA): перенос команды между клубами — только уровень лиги.
      // CLUB_ADMIN не может вывести свою команду из клуба (в т.ч. в чужой):
      // переданному clubId не верим, принадлежность форсится его клубом.
      if (user.role === "CLUB_ADMIN") {
        data.clubId = user.clubId;
      } else {
        if (body.clubId) {
          const club = await db.club.findUnique({ where: { id: body.clubId } });
          if (!club) throw new HttpError(404, "Клуб не найден");
        }
        data.clubId = body.clubId || null;
      }
    }
    if (body.city !== undefined) data.city = body.city || null;
    if (body.logoUrl !== undefined) data.logoUrl = body.logoUrl || null;
    const updated = await db.team.update({ where: { id }, data });
    await audit(user, "Team", id, "UPDATE", team, updated);
    return Response.json({ ok: true, team: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    // Тело необязательно: {} — обычное удаление, { cascade: true } — вместе с заявками
    const body = await req.json().catch(() => ({} as { cascade?: boolean }));
    const cascade = !!body?.cascade;

    const team = await db.team.findUnique({
      where: { id },
      include: { _count: { select: { homeMatches: true, awayMatches: true, registrations: true } } },
    });
    if (!team) throw new HttpError(404, "Команда не найдена");
    const matches = team._count.homeMatches + team._count.awayMatches;

    // Матчи = история чемпионата: неприкосновенна. Структурированный 409,
    // UI по коду и счётчикам предложит перейти к матчам.
    if (matches > 0) {
      throw new HttpError(
        409,
        `Нельзя удалить команду: сыгранных/запланированных матчей — ${matches}, заявок — ${team._count.registrations}. ` +
          "История матчей неприкосновенна: откройте карточку команды → вкладка «Матчи», удалите матчи, затем удалите команду.",
        {
          code: "TEAM_HAS_MATCHES",
          dependencies: { matches, registrations: team._count.registrations },
          cascadeAllowed: false,
        }
      );
    }

    if (team._count.registrations > 0 && !cascade) {
      throw new HttpError(
        409,
        `Команда без матчей, но за неё оформлено заявок: ${team._count.registrations}. ` +
          "Можно удалить команду вместе с заявками (состав исчезнет из всех сезонов) — это безопасно: турнирной истории у команды нет.",
        {
          code: "TEAM_HAS_REGISTRATIONS",
          dependencies: { matches: 0, registrations: team._count.registrations },
          cascadeAllowed: true,
        }
      );
    }

    // Каскад: снимаем заявки состава, затем удаляем команду (атомарно)
    await db.$transaction(async (tx) => {
      if (cascade && team._count.registrations > 0) {
        const removed = await tx.registration.deleteMany({ where: { teamId: id } });
        await audit(user, "Team", id, "CASCADE", { registrations: team._count.registrations }, { removed: removed.count, note: "заявки удалены вместе с командой" });
      }
      await tx.team.delete({ where: { id } });
    });
    await audit(user, "Team", id, "DELETE", team, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
