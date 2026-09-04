// CRUD сезонов: создание (авто-этап «Регулярный чемпионат»), isCurrent — единственный на лигу.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function POST(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { leagueId, name, startDate, endDate, isCurrent, stageName } = await req.json();
    if (!leagueId) throw new HttpError(422, "Укажите лигу");
    if (!name || String(name).trim() === "") throw new HttpError(422, "Укажите название сезона");
    if (!startDate) throw new HttpError(422, "Укажите дату начала");

    const league = await db.league.findUnique({ where: { id: leagueId } });
    if (!league) throw new HttpError(404, "Лига не найдена");

    const data = {
      leagueId,
      name: String(name).trim(),
      startDate: new Date(String(startDate)),
      endDate: endDate ? new Date(String(endDate)) : null,
      isCurrent: !!isCurrent,
    };

    const season = await db.$transaction(async (tx) => {
      if (data.isCurrent) {
        await tx.season.updateMany({ where: { leagueId, isCurrent: true }, data: { isCurrent: false } });
      }
      const s = await tx.season.create({ data });
      await tx.stage.create({ data: { seasonId: s.id, name: stageName || "Регулярный чемпионат", type: "ROUND_ROBIN" } });
      return s;
    });

    await audit(user, "Season", season.id, "CREATE", null, data);
    return Response.json({ ok: true, season });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
