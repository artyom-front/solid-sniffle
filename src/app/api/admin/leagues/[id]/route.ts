// CRUD лиг: обновление и удаление (с защитой от потери турнирных данных).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { leaguePayload } from "../route";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const league = await db.league.findUnique({ where: { id } });
    if (!league) throw new HttpError(404, "Лига не найдена");
    const data = leaguePayload(await req.json());
    const updated = await db.league.update({ where: { id }, data });
    await audit(user, "League", id, "UPDATE", league, updated);
    return Response.json({ ok: true, league: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const league = await db.league.findUnique({ where: { id }, include: { seasons: true } });
    if (!league) throw new HttpError(404, "Лига не найдена");

    const seasonIds = league.seasons.map((s) => s.id);
    if (seasonIds.length > 0) {
      const [matches, regs, susp] = await Promise.all([
        db.match.count({ where: { stage: { seasonId: { in: seasonIds } } } }),
        db.registration.count({ where: { seasonId: { in: seasonIds } } }),
        db.suspension.count({ where: { seasonId: { in: seasonIds } } }),
      ]);
      if (matches > 0 || regs > 0 || susp > 0) {
        throw new HttpError(409, `Нельзя удалить лигу: привязано матчей ${matches}, заявок ${regs}, дисквалификаций ${susp}. Сначала очистите сезоны.`);
      }
      await db.stage.deleteMany({ where: { seasonId: { in: seasonIds } } });
      await db.season.deleteMany({ where: { id: { in: seasonIds } } });
    }
    await db.league.delete({ where: { id } });
    await audit(user, "League", id, "DELETE", league, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
