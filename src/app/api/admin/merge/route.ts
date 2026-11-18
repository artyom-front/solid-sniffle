// Epic 4: Гигиена данных — слияние профилей (Merge Persons) и команд
// v1.0.42: merge — СТРОГО SUPER_ADMIN (превью-поиск тоже; матрица ADMIN-GUIDE §1).
// (Merge Teams / «правопреемник», v1.0.19).
// Транзакционное перепривязывание всех связей с сущностью A на сущность B,
// удаление дубля и запись в AuditLog.
//
// Merge команд решает сценарий «команда пересоздана под другим именем»:
// новая команда становится правопреемником — ей передаются ВСЯ история
// (матчи, заявки, события протоколов), старая удаляется.

import { normalizeRoles } from "@/lib/roles";
import { db } from "@/lib/db";
import { requireRole, HttpError, type SessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { caseVariants } from "@/lib/text";

/** Поиск кандидатов на слияние (для превью): персоны или команды */
export async function GET(req: Request) {
  try {
    await requireRole("SUPER_ADMIN");
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "person";

    if (type === "team") {
      // v1.0.49 · поиск на сервере: раньше take 500 + JS-фильтр — команды
      // «за пределами пятисотки» не находились. Регистронезависимо —
      // по вариантам (грабля locale-C, см. lib/text.ts).
      const teamVariants = caseVariants(searchParams.get("q")?.trim() ?? "");
      const teams = await db.team.findMany({
        where: teamVariants.length
          ? { OR: teamVariants.flatMap((v) => [
              { name: { contains: v, mode: "insensitive" as const } },
              { club: { name: { contains: v, mode: "insensitive" as const } } },
            ]) }
          : {},
        include: {
          club: { select: { name: true } },
          _count: { select: { homeMatches: true, awayMatches: true, registrations: true, events: true } },
        },
        take: 500,
        orderBy: { name: "asc" },
      });
      return Response.json({
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          clubName: t.club?.name ?? null,
          links: {
            matches: t._count.homeMatches + t._count.awayMatches,
            registrations: t._count.registrations,
            events: t._count.events,
          },
        })),
      });
    }

    // v1.0.49 · поиск на сервере (по вариантам регистра — грабля locale-C):
    // раньше take 500 + JS-фильтр — при росте базы дубли «за пределами
    // пятисотки» переставали находиться, а merge — ровно тот инструмент,
    // которым владелец чистит разрешённые дубли (Task 56).
    const personVariants = caseVariants(searchParams.get("q")?.trim() ?? "");
    const persons = await db.person.findMany({
      where: personVariants.length
        ? { OR: personVariants.flatMap((v) => [
            { lastName: { contains: v, mode: "insensitive" as const } },
            { firstName: { contains: v, mode: "insensitive" as const } },
            { middleName: { contains: v, mode: "insensitive" as const } },
          ]) }
        : {},
      include: {
        registrations: { include: { team: true } },
        events: { select: { id: true } },
        suspensions: { select: { id: true } },
        refereedMatches: { select: { id: true } },
      },
      take: 500,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    return Response.json({
      persons: persons.map((p) => ({
        id: p.id,
        name: `${p.lastName} ${p.firstName} ${p.middleName ?? ""}`.trim(),
        position: p.position,
        isReferee: p.isReferee,
        links: {
          registrations: p.registrations.length,
          events: p.events.length,
          suspensions: p.suspensions.length,
          refereedMatches: p.refereedMatches.length,
          teams: [...new Set(p.registrations.map((r) => r.team.name))],
        },
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("SUPER_ADMIN");
    const body = await req.json();
    const { fromId, toId, type } = body;
    if (!fromId || !toId) throw new HttpError(422, "Укажите объединяемые сущности");
    if (fromId === toId) throw new HttpError(422, "Нельзя объединить сущность с самой собой");

    return type === "team"
      ? await mergeTeams(fromId, toId, user)
      : await mergePersons(fromId, toId, user);
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";

// ============================================================
// Merge персон (эпик 4)
// ============================================================
async function mergePersons(fromId: string, toId: string, user: SessionUser) {
  const from = await db.person.findUnique({ where: { id: fromId } });
  const to = await db.person.findUnique({ where: { id: toId } });
  if (!from || !to) throw new HttpError(404, "Один из профилей не найден");

  const stats = {
    events: 0, assists: 0, registrations: 0, suspensions: 0,
    lineups: 0, ratings: 0, refereed: 0, users: 0,
  };

  await db.$transaction(async (tx) => {
    // 1. События протоколов
    const evs = await tx.matchEvent.findMany({ where: { personId: fromId } });
    stats.events = evs.length;
    await tx.matchEvent.updateMany({ where: { personId: fromId }, data: { personId: toId } });

    // 2. Ассисты
    const assists = await tx.matchEvent.findMany({ where: { assistPersonId: fromId } });
    stats.assists = assists.length;
    await tx.matchEvent.updateMany({ where: { assistPersonId: fromId }, data: { assistPersonId: toId } });

    // 3. Заявки: конфликт — только АКТИВНАЯ заявка того же (сезон+команда)
    // у правопреемника (v1.0.23: закрытые исторические заявки могут дублироваться)
    const regs = await tx.registration.findMany({ where: { personId: fromId } });
    stats.registrations = regs.length;
    for (const r of regs) {
      const conflict = await tx.registration.findFirst({
        where: { personId: toId, teamId: r.teamId, seasonId: r.seasonId, endDate: null },
      });
      if (conflict) {
        await tx.registration.delete({ where: { id: r.id } });
      } else {
        await tx.registration.update({ where: { id: r.id }, data: { personId: toId } });
      }
    }

    // 4. Дисквалификации
    const susp = await tx.suspension.findMany({ where: { personId: fromId } });
    stats.suspensions = susp.length;
    await tx.suspension.updateMany({ where: { personId: fromId }, data: { personId: toId } });

    // 5. Заявки на матчи: при конфликте (тот же матч) — удаляем дубль
    const lineups = await tx.lineupEntry.findMany({ where: { personId: fromId } });
    stats.lineups = lineups.length;
    for (const l of lineups) {
      const conflict = await tx.lineupEntry.findUnique({
        where: { matchId_personId: { matchId: l.matchId, personId: toId } },
      });
      if (conflict) {
        await tx.lineupEntry.delete({ where: { id: l.id } });
      } else {
        await tx.lineupEntry.update({ where: { id: l.id }, data: { personId: toId } });
      }
    }

    // 6. Оценки судьям (полученные)
    const ratings = await tx.refereeRating.findMany({ where: { refereeId: fromId } });
    stats.ratings = ratings.length;
    await tx.refereeRating.updateMany({ where: { refereeId: fromId }, data: { refereeId: toId } });

    // 7. Назначения в судейскую бригаду (главный судья + бригада матча)
    const refd = await tx.match.findMany({ where: { refereeId: fromId } });
    stats.refereed = refd.length;
    await tx.match.updateMany({ where: { refereeId: fromId }, data: { refereeId: toId } });
    await tx.matchOfficial.updateMany({ where: { personId: fromId }, data: { personId: toId } });

    // 8. Пользователи
    const users = await tx.user.findMany({ where: { personId: fromId } });
    stats.users = users.length;
    await tx.user.updateMany({ where: { personId: fromId }, data: { personId: toId } });

    // 9. Роли объединяются (v1.0.34: объединение массивов + нормализация
    //    корпуса), флаг судьи и позиция наследуются
    const mergedRoles = normalizeRoles([...to.roles, ...from.roles]);
    await tx.person.update({
      where: { id: toId },
      data: {
        roles: mergedRoles,
        isReferee: to.isReferee || from.isReferee,
        position: to.position ?? from.position,
        birthDate: to.birthDate ?? from.birthDate,
      },
    });

    // 10. Удаляем дубликат
    await tx.person.delete({ where: { id: fromId } });
  });

  await audit(user, "Person", toId, "MERGE",
    { deleted: { id: from.id, name: `${from.lastName} ${from.firstName}` } },
    { target: { id: to.id, name: `${to.lastName} ${to.firstName}` }, transferred: stats }
  );

  return Response.json({ ok: true, transferred: stats });
}

// ============================================================
// Merge команд — «правопреемник» (v1.0.19)
// ============================================================
async function mergeTeams(fromId: string, toId: string, user: SessionUser) {
  const from = await db.team.findUnique({ where: { id: fromId } });
  const to = await db.team.findUnique({ where: { id: toId } });
  if (!from || !to) throw new HttpError(404, "Одна из команд не найдена");

  // Команды не могли играть друг против друга — иначе после слияния
  // получим матч «правопреемник против самого себя».
  const headToHead = await db.match.count({
    where: {
      OR: [
        { homeTeamId: fromId, awayTeamId: toId },
        { homeTeamId: toId, awayTeamId: fromId },
      ],
    },
  });
  if (headToHead > 0) {
    throw new HttpError(
      409,
      `Команды сыграли друг с другом ${headToHead} матчей — после объединения получился бы матч «${to.name} против ${to.name}». ` +
        "Такие команды объединять нельзя: переименуйте старую команду или оставьте обе в истории."
    );
  }

  const stats = { matches: 0, registrations: 0, events: 0, lineups: 0 };

  await db.$transaction(async (tx) => {
    // 1. Матчи: обе стороны (хозяева/гости) → команда-правопреемник
    const home = await tx.match.updateMany({ where: { homeTeamId: fromId }, data: { homeTeamId: toId } });
    const away = await tx.match.updateMany({ where: { awayTeamId: fromId }, data: { awayTeamId: toId } });
    stats.matches = home.count + away.count;

    // 2. События протоколов
    const evs = await tx.matchEvent.updateMany({ where: { teamId: fromId }, data: { teamId: toId } });
    stats.events = evs.count;

    // 3. Заявки: конфликт — только АКТИВНАЯ заявка того же человека у
    // правопреемника (v1.0.23: закрытые исторические заявки могут дублироваться)
    const regs = await tx.registration.findMany({ where: { teamId: fromId } });
    stats.registrations = regs.length;
    for (const r of regs) {
      const conflict = await tx.registration.findFirst({
        where: { personId: r.personId, teamId: toId, seasonId: r.seasonId, endDate: null },
      });
      if (conflict) {
        await tx.registration.delete({ where: { id: r.id } });
      } else {
        await tx.registration.update({ where: { id: r.id }, data: { teamId: toId } });
      }
    }

    // 4. Составы: при конфликте (тот же человек в том же матче) — удаляем дубль
    const lineups = await tx.lineupEntry.findMany({ where: { teamId: fromId } });
    for (const l of lineups) {
      const conflict = await tx.lineupEntry.findUnique({
        where: { matchId_personId: { matchId: l.matchId, personId: l.personId } },
      });
      if (conflict) {
        await tx.lineupEntry.delete({ where: { id: l.id } });
      } else {
        await tx.lineupEntry.update({ where: { id: l.id }, data: { teamId: toId } });
      }
    }
    stats.lineups = lineups.length;

    // 5. Удаляем старую команду
    await tx.team.delete({ where: { id: fromId } });
  });

  await audit(user, "Team", toId, "MERGE",
    { deleted: { id: from.id, name: from.name } },
    { target: { id: to.id, name: to.name }, transferred: stats, note: "правопреемник: история передана новой команде" }
  );

  return Response.json({ ok: true, transferred: stats });
}
