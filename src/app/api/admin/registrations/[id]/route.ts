// Управление отдельной заявкой: правка номера/роли/дат, отзаявка (END) и удаление.
//
// Это недоставший инструмент состава: раньше заявку можно было создать,
// но нельзя было ни отредактировать, ни снять — из-за этого команда
// «не удалялась», а алгоритм действий был неясен.
//
// Практики: CLUB_ADMIN действует только в своём клубе; каждая операция —
// в журнал аудита; «отзаявить» (endDate) сохраняет историю, удаление —
// для ошибочно созданных заявок.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

async function loadRegistration(id: string) {
  const reg = await db.registration.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, firstName: true, lastName: true } },
      team: { select: { id: true, name: true, clubId: true } },
      season: { select: { id: true, name: true } },
    },
  });
  if (!reg) throw new HttpError(404, "Заявка не найдена");
  return reg;
}

/** CLUB_ADMIN может менять заявки только команд своего клуба */
async function assertClubScope(user: { role: string; clubId: string | null }, teamClubId: string | null) {
  if (user.role === "CLUB_ADMIN" && teamClubId !== user.clubId) {
    throw new HttpError(403, "Клубный администратор может управлять заявками только команд своего клуба");
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const reg = await loadRegistration(id);
    await assertClubScope(user, reg.team.clubId);

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.number !== undefined) {
      if (body.number === null || body.number === "") data.number = null;
      else {
        const n = Number(body.number);
        if (!Number.isInteger(n) || n < 1 || n > 999) throw new HttpError(422, "Номер: целое от 1 до 999");
        data.number = n;
      }
    }
    if (body.role !== undefined) {
      if (!String(body.role).trim()) throw new HttpError(422, "Роль заявки не может быть пустой");
      data.role = String(body.role).trim();
    }
    if (body.endDate !== undefined) {
      data.endDate = body.endDate ? new Date(String(body.endDate)) : null;
      data.status = body.endDate ? "ENDED" : "ACTIVE";
    }
    if (body.status !== undefined) {
      if (!["ACTIVE", "ENDED"].includes(body.status)) throw new HttpError(422, "Статус: ACTIVE или ENDED");
      data.status = body.status;
      if (body.status === "ENDED" && reg.endDate === null) data.endDate = new Date();
      if (body.status === "ACTIVE") data.endDate = null;
    }
    if (Object.keys(data).length === 0) throw new HttpError(422, "Нет полей для обновления");

    const updated = await db.registration.update({ where: { id }, data });
    await audit(user, "Registration", id, "UPDATE", reg, updated);
    return Response.json({ ok: true, registration: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const reg = await loadRegistration(id);
    await assertClubScope(user, reg.team.clubId);

    // Предохранитель: если человек выходил в составах за эту команду в этом
    // сезоне — удалять заявку нельзя (история матчей должна опираться на состав),
    // только закрыть датой (отзаявка). Ошибка — структурированная.
    const lineups = await db.lineupEntry.count({
      where: {
        personId: reg.personId,
        teamId: reg.teamId,
        match: { stage: { seasonId: reg.seasonId } },
      },
    });
    if (lineups > 0) {
      throw new HttpError(
        409,
        `Игрок выходил в составах этой команды в сезоне «${reg.season.name}» (${lineups} матчей). ` +
          "Удалить заявку нельзя — история составов должна опираться на неё. Используйте «Отзаявить» (закрыть датой): игрок уйдёт из текущего состава, история сохранится.",
        { code: "REGISTRATION_HAS_LINEUPS", dependencies: { lineups }, cascadeAllowed: false }
      );
    }

    await db.registration.delete({ where: { id } });
    await audit(user, "Registration", id, "DELETE", reg, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
