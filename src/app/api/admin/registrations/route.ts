// Epic 3: Заявки и трансферы. Проверка активной регистрации на дату матча
// и трансферного окна лиги.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function POST(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { personId, teamId, seasonId, number, endDatePrevious } = await req.json();
    if (!personId || !teamId || !seasonId) throw new HttpError(422, "Укажите игрока, команду и сезон");

    const season = await db.season.findUnique({ where: { id: seasonId }, include: { league: true } });
    if (!season) throw new HttpError(404, "Сезон не найден");

    // Трансферное окно (Epic 3): после даты закрытия новые заявки запрещены
    const windowEnd = season.league.transferWindowEnd;
    if (windowEnd && new Date() > windowEnd) {
      throw new HttpError(403, `Трансферное окно лиги закрыто (${windowEnd.toLocaleDateString("ru-RU")}). Создание новых заявок запрещено.`);
    }

    // CLUB_ADMIN может заявлять только в команду своего клуба
    if (user.role === "CLUB_ADMIN") {
      const team = await db.team.findUnique({ where: { id: teamId } });
      if (!team || team.clubId !== user.clubId) {
        throw new HttpError(403, "Клубный администратор может заявлять игроков только в команды своего клуба");
      }
    }

    const existing = await db.registration.findUnique({
      where: { personId_teamId_seasonId: { personId, teamId, seasonId } },
    });
    if (existing && !existing.endDate) {
      throw new HttpError(409, "Игрок уже активно заявлен за эту команду в этом сезоне");
    }

    // завершаем предыдущую активную заявку игрока (трансфер)
    if (endDatePrevious) {
      const active = await db.registration.findMany({
        where: { personId, seasonId, endDate: null },
      });
      for (const a of active) {
        await db.registration.update({ where: { id: a.id }, data: { endDate: new Date(endDatePrevious) } });
        await audit(user, "Registration", a.id, "UPDATE", { endDate: null }, { endDate: endDatePrevious });
      }
    }

    const reg = await db.registration.create({
      data: { personId, teamId, seasonId, startDate: new Date(), number: number ? Number(number) : null },
    });
    await audit(user, "Registration", reg.id, "CREATE", null, { personId, teamId, seasonId, number });

    return Response.json({ ok: true, registration: reg });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
