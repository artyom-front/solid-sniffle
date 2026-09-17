// CRUD персон: карточка (GET), обновление (PATCH) и умное удаление (DELETE).
//
// Удаление персоны — «нет тупиков»:
//  • Турнирная история (события, составы, судейство, дисквалификации) —
//    неприкосновенна: такие профили объединяют через Merge (Epic 4).
//  • Заявки без сыгранных матчей — каскад: профиль удаляется вместе с ними.
// 409 отдаёт структуру { code, dependencies, cascadeAllowed } — UI
// предлагает конкретное действие вместо загадочного «используйте Merge».

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { normalizeRoles, refereeFromRoles, assertNoCardRoleConflict } from "@/lib/roles";

const POSITIONS = ["GK", "DF", "MF", "FW"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const person = await db.person.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            events: true, assists: true, lineups: true, registrations: true,
            suspensions: true, refereedMatches: true, ratingsReceived: true, users: true,
          },
        },
      },
    });
    if (!person) throw new HttpError(404, "Персона не найдена");

    const regs = await db.registration.findMany({
      where: { personId: id },
      include: {
        team: { select: { id: true, name: true, logoUrl: true } },
        season: { select: { id: true, name: true, league: { select: { id: true, name: true, shortName: true } } } },
      },
      orderBy: { startDate: "desc" },
    });

    // Игровая статистика: голы/карточки по типам событий
    const eventsByType = await db.matchEvent.groupBy({
      by: ["type"],
      where: { personId: id },
      _count: { _all: true },
    });

    const historyBlockers =
      person._count.events + person._count.assists + person._count.lineups +
      person._count.suspensions + person._count.refereedMatches + person._count.ratingsReceived;

    return Response.json({
      person: {
        id: person.id, firstName: person.firstName, lastName: person.lastName,
        middleName: person.middleName, birthDate: person.birthDate, gender: person.gender,
        position: person.position, roles: person.roles, isReferee: person.isReferee,
        photoUrl: person.photoUrl, createdAt: person.createdAt,
      },
      stats: {
        events: person._count.events,
        assists: person._count.assists,
        lineups: person._count.lineups,
        registrations: person._count.registrations,
        suspensions: person._count.suspensions,
        refereedMatches: person._count.refereedMatches,
        ratings: person._count.ratingsReceived,
        linkedAccounts: person._count.users,
        goals: (eventsByType.find((e) => e.type === "GOAL")?._count._all ?? 0) +
               (eventsByType.find((e) => e.type === "PENALTY")?._count._all ?? 0),
        yellowCards: eventsByType.find((e) => e.type === "YELLOW_CARD")?._count._all ?? 0,
        redCards: eventsByType.find((e) => e.type === "RED_CARD")?._count._all ?? 0,
      },
      canDelete: historyBlockers === 0,
      deleteBlockers: {
        events: person._count.events + person._count.assists,
        lineups: person._count.lineups,
        registrations: person._count.registrations,
        suspensions: person._count.suspensions,
        matches: person._count.refereedMatches,
        ratings: person._count.ratingsReceived,
      },
      registrations: regs.map((r) => ({
        id: r.id,
        teamId: r.team.id, teamName: r.team.name, teamLogo: r.team.logoUrl,
        seasonId: r.season.id, seasonName: r.season.name,
        leagueName: r.season.league.shortName ?? r.season.league.name,
        number: r.number, role: r.role,
        startDate: r.startDate, endDate: r.endDate, status: r.status,
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
    const person = await db.person.findUnique({ where: { id } });
    if (!person) throw new HttpError(404, "Персона не найдена");
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.firstName !== undefined) {
      if (!String(body.firstName).trim()) throw new HttpError(422, "Имя не может быть пустым");
      data.firstName = String(body.firstName).trim();
    }
    if (body.lastName !== undefined) {
      if (!String(body.lastName).trim()) throw new HttpError(422, "Фамилия не может быть пустой");
      data.lastName = String(body.lastName).trim();
    }
    if (body.middleName !== undefined) data.middleName = body.middleName || null;
    if (body.position !== undefined) {
      if (body.position && !POSITIONS.includes(body.position)) throw new HttpError(422, "Позиция: GK, DF, MF или FW");
      data.position = body.position || null;
    }
    if (body.birthDate !== undefined) data.birthDate = body.birthDate ? new Date(String(body.birthDate)) : null;
    if (body.gender !== undefined) {
      if (body.gender && !["MALE", "FEMALE"].includes(body.gender)) throw new HttpError(422, "Пол: MALE или FEMALE");
      data.gender = body.gender || null;
    }
    if (body.photoUrl !== undefined) {
      if (body.photoUrl && !String(body.photoUrl).startsWith("/api/media/")) throw new HttpError(422, "Фото загружается через медиатеку");
      data.photoUrl = body.photoUrl || null;
    }
    if (body.roles !== undefined) {
      const roles = normalizeRoles(body.roles);
      // Инвариант «судья ≠ игрок»: роли несовместимы на одной карточке
      assertNoCardRoleConflict(roles);
      // нельзя снять роль судьи, если есть назначенные матчи
      if (person.isReferee && !refereeFromRoles(roles)) {
        const refs = await db.match.count({ where: { refereeId: id } });
        if (refs > 0) throw new HttpError(409, `Нельзя снять статус судьи: назначено матчей — ${refs}`);
      }
      data.roles = roles;
      data.isReferee = refereeFromRoles(roles);
    }
    if (body.isReferee !== undefined && body.roles === undefined) {
      // легаси-путь: одиночный флаг судьи
      if (!body.isReferee) {
        const refs = await db.match.count({ where: { refereeId: id } });
        if (refs > 0) throw new HttpError(409, `Нельзя снять статус судьи: назначено матчей — ${refs}`);
      }
      data.isReferee = !!body.isReferee;
      const roles = new Set(person.roles);
      if (body.isReferee) roles.add("REFEREE"); else roles.delete("REFEREE");
      data.roles = [...roles];
    }

    const updated = await db.person.update({ where: { id }, data });
    await audit(user, "Person", id, "UPDATE", person, updated);
    return Response.json({ ok: true, person: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({} as { cascade?: boolean }));
    const cascade = !!body?.cascade;

    const person = await db.person.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            events: true, assists: true, lineups: true, registrations: true,
            suspensions: true, refereedMatches: true, ratingsReceived: true, users: true,
          },
        },
      },
    });
    if (!person) throw new HttpError(404, "Персона не найдена");

    const blockers = {
      events: person._count.events + person._count.assists,
      lineups: person._count.lineups,
      registrations: person._count.registrations,
      suspensions: person._count.suspensions,
      matches: person._count.refereedMatches,
      ratings: person._count.ratingsReceived,
    };
    const hardBlockers = blockers.events + blockers.lineups + blockers.suspensions + blockers.matches + blockers.ratings;

    // Турнирная история неприкосновенна — только Merge переносит её на другой профиль
    if (hardBlockers > 0) {
      const parts = [
        blockers.events ? `событий ${blockers.events}` : "",
        blockers.lineups ? `появлений в составах ${blockers.lineups}` : "",
        blockers.matches ? `матчей судьи ${blockers.matches}` : "",
        blockers.suspensions ? `дисквалификаций ${blockers.suspensions}` : "",
        blockers.ratings ? `оценок судейства ${blockers.ratings}` : "",
      ].filter(Boolean).join(", ");
      throw new HttpError(
        409,
        `У профиля есть турнирная история (${parts}). История матчей неприкосновенна: ` +
          "профиль можно объединить с другим через «Система → Merge профилей» — все события и заявки переедут на выбранный профиль.",
        {
          code: "PERSON_HAS_HISTORY",
          dependencies: blockers,
          cascadeAllowed: false,
        }
      );
    }

    if (blockers.registrations > 0 && !cascade) {
      throw new HttpError(
        409,
        `Профиль без игровой истории, но за ним числится заявок: ${blockers.registrations}. ` +
          "Можно удалить профиль вместе с заявками (он исчезнет из составов команд) — матчи и события не затрагиваются, их нет.",
        {
          code: "PERSON_HAS_REGISTRATIONS",
          dependencies: blockers,
          cascadeAllowed: true,
        }
      );
    }

    await db.$transaction(async (tx) => {
      // отвязываем учётные записи (они остаются, но без профиля)
      await tx.user.updateMany({ where: { personId: id }, data: { personId: null } });
      if (cascade && blockers.registrations > 0) {
        const removed = await tx.registration.deleteMany({ where: { personId: id } });
        await audit(user, "Person", id, "CASCADE", { registrations: blockers.registrations }, { removed: removed.count, note: "заявки удалены вместе с профилем" });
      }
      await tx.person.delete({ where: { id } });
    });
    await audit(user, "Person", id, "DELETE", person, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
