// CRUD команд: обновление и удаление (нельзя удалить команду с историей матчей/заявок).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const team = await db.team.findUnique({ where: { id } });
    if (!team) throw new HttpError(404, "Команда не найдена");
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) throw new HttpError(422, "Название не может быть пустым");
      data.name = String(body.name).trim();
    }
    if (body.clubId !== undefined) {
      if (body.clubId) {
        const club = await db.club.findUnique({ where: { id: body.clubId } });
        if (!club) throw new HttpError(404, "Клуб не найден");
      }
      data.clubId = body.clubId || null;
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

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const team = await db.team.findUnique({
      where: { id },
      include: { _count: { select: { homeMatches: true, awayMatches: true, registrations: true } } },
    });
    if (!team) throw new HttpError(404, "Команда не найдена");
    const matches = team._count.homeMatches + team._count.awayMatches;
    if (matches > 0 || team._count.registrations > 0) {
      throw new HttpError(409, `Нельзя удалить команду: матчей ${matches}, заявок игроков ${team._count.registrations}. Удалите матчи/заявки или создайте новую команду.`);
    }
    await db.team.delete({ where: { id } });
    await audit(user, "Team", id, "DELETE", team, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
