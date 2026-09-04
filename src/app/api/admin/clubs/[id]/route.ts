// CRUD клубов: обновление и удаление (нельзя удалить клуб с командами).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const club = await db.club.findUnique({ where: { id } });
    if (!club) throw new HttpError(404, "Клуб не найден");
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) throw new HttpError(422, "Название не может быть пустым");
      data.name = String(body.name).trim();
    }
    if (body.city !== undefined) data.city = body.city || null;
    if (body.description !== undefined) data.description = body.description || null;
    const updated = await db.club.update({ where: { id }, data });
    await audit(user, "Club", id, "UPDATE", club, updated);
    return Response.json({ ok: true, club: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const club = await db.club.findUnique({ where: { id }, include: { _count: { select: { teams: true, admins: true } } } });
    if (!club) throw new HttpError(404, "Клуб не найден");
    if (club._count.teams > 0) throw new HttpError(409, `Нельзя удалить клуб: к нему привязано команд — ${club._count.teams}. Сначала удалите или отвяжите команды.`);
    await db.user.updateMany({ where: { clubId: id }, data: { clubId: null } });
    await db.club.delete({ where: { id } });
    await audit(user, "Club", id, "DELETE", club, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
