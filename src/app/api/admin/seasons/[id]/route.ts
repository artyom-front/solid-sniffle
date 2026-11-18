// CRUD сезонов: обновление и удаление (защита от удаления сыгранных турниров).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { assertSeasonInScope } from "@/lib/scope";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    await assertSeasonInScope(user, id);
    const season = await db.season.findUnique({ where: { id } });
    if (!season) throw new HttpError(404, "Сезон не найден");
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) throw new HttpError(422, "Название не может быть пустым");
      data.name = String(body.name).trim();
    }
    // v1.0.49 (аудит Task 56): битая дата — честная 422, а не Invalid Date → 500
    if (body.startDate !== undefined) {
      const d = new Date(String(body.startDate));
      if (Number.isNaN(d.getTime())) throw new HttpError(422, "Некорректная дата начала сезона");
      data.startDate = d;
    }
    if (body.endDate !== undefined) {
      const d = body.endDate ? new Date(String(body.endDate)) : null;
      if (d && Number.isNaN(d.getTime())) throw new HttpError(422, "Некорректная дата окончания сезона");
      data.endDate = d;
    }
    if (body.isCurrent !== undefined) {
      data.isCurrent = !!body.isCurrent;
      if (data.isCurrent) {
        await db.season.updateMany({ where: { leagueId: season.leagueId, isCurrent: true, NOT: { id } }, data: { isCurrent: false } });
      }
    }

    const updated = await db.season.update({ where: { id }, data });
    await audit(user, "Season", id, "UPDATE", season, updated);
    return Response.json({ ok: true, season: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    await assertSeasonInScope(user, id);
    const season = await db.season.findUnique({ where: { id }, include: { stages: true } });
    if (!season) throw new HttpError(404, "Сезон не найден");

    const [matches, regs, susp] = await Promise.all([
      db.match.count({ where: { stage: { seasonId: id } } }),
      db.registration.count({ where: { seasonId: id } }),
      db.suspension.count({ where: { seasonId: id } }),
    ]);
    if (matches > 0 || regs > 0 || susp > 0) {
      throw new HttpError(409, `Нельзя удалить сезон: матчей ${matches}, заявок ${regs}, дисквалификаций ${susp}`);
    }
    await db.stage.deleteMany({ where: { seasonId: id } });
    await db.season.delete({ where: { id } });
    await audit(user, "Season", id, "DELETE", season, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
