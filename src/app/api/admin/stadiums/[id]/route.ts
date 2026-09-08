// CRUD стадионов: обновление и удаление (нельзя удалить стадион с матчами).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const stadium = await db.stadium.findUnique({ where: { id } });
    if (!stadium) throw new HttpError(404, "Стадион не найден");
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) throw new HttpError(422, "Название не может быть пустым");
      data.name = String(body.name).trim();
    }
    if (body.city !== undefined) data.city = body.city || null;
    if (body.address !== undefined) data.address = body.address || null;
    if (body.capacity !== undefined) data.capacity = body.capacity ? Number(body.capacity) : null;
    const updated = await db.stadium.update({ where: { id }, data });
    await audit(user, "Stadium", id, "UPDATE", stadium, updated);
    return Response.json({ ok: true, stadium: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const stadium = await db.stadium.findUnique({ where: { id }, include: { _count: { select: { matches: true } } } });
    if (!stadium) throw new HttpError(404, "Стадион не найден");
    if (stadium._count.matches > 0) {
      throw new HttpError(409, `Нельзя удалить стадион: на нём сыграно/запланировано матчей — ${stadium._count.matches}`);
    }
    await db.stadium.delete({ where: { id } });
    await audit(user, "Stadium", id, "DELETE", stadium, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
