// Epic 3: Заявки и трансферы. Проверка активной регистрации на дату матча
// и трансферного окна лиги.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { assertPlayerRegistrationAllowed } from "@/lib/engine/conflicts";
import { assertSeasonInScope } from "@/lib/scope";
import { isRegistrationRole, REGISTRATION_ROLE_CODES_TEXT } from "@/lib/registration-roles";

/** Список заявок сезона (для панели «Заявки» и контроля составов) */
export async function GET(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { searchParams } = new URL(req.url);
    const seasonId = searchParams.get("seasonId");
    if (!seasonId) throw new HttpError(422, "Укажите seasonId");
    await assertSeasonInScope(user, seasonId);

    const regs = await db.registration.findMany({
      where: { seasonId },
      include: {
        person: { select: { id: true, firstName: true, lastName: true, photoUrl: true, position: true, roles: true } },
        team: { select: { id: true, name: true, logoUrl: true } },
      },
      orderBy: [{ team: { name: "asc" } }, { person: { lastName: "asc" } }],
    });

    return Response.json({
      registrations: regs.map((r) => ({
        id: r.id,
        personId: r.person.id,
        personName: `${r.person.lastName} ${r.person.firstName}`.trim(),
        personPhoto: r.person.photoUrl,
        personPosition: r.person.position,
        personIsReferee: r.person.roles.some((c) => c === "REFEREE" || c.startsWith("ASSISTANT_REF") || c === "FOURTH_OFFICIAL" || c === "VAR" || c === "AVAR" || c === "INSPECTOR"),
        teamId: r.team.id, teamName: r.team.name, teamLogo: r.team.logoUrl,
        number: r.number, role: r.role,
        startDate: r.startDate, endDate: r.endDate, status: r.status,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { personId, teamId, seasonId, number, role, startDate, endDatePrevious } = await req.json();
    if (!personId || !teamId || !seasonId) throw new HttpError(422, "Укажите игрока, команду и сезон");
    await assertSeasonInScope(user, seasonId);

    const season = await db.season.findUnique({ where: { id: seasonId }, include: { league: true } });
    if (!season) throw new HttpError(404, "Сезон не найден");

    // Проверяем существование команды и персоны сразу — понятная 404-я
    // вместо FK-ошибки БД (500) при заявке в удалённую команду
    const team = await db.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, clubId: true } });
    if (!team) throw new HttpError(404, "Команда не найдена — возможно, она была удалена. Обновите список.");
    const person = await db.person.findUnique({ where: { id: personId }, select: { id: true } });
    if (!person) throw new HttpError(404, "Персона не найдена — возможно, профиль был удалён. Обновите список.");

    // Трансферное окно (Epic 3): после даты закрытия новые заявки запрещены
    const windowEnd = season.league.transferWindowEnd;
    if (windowEnd && new Date() > windowEnd) {
      throw new HttpError(403, `Трансферное окно лиги закрыто (${windowEnd.toLocaleDateString("ru-RU")}). Создание новых заявок запрещено.`);
    }

    // CLUB_ADMIN может заявлять только в команду своего клуба
    if (user.role === "CLUB_ADMIN" && team.clubId !== user.clubId) {
      throw new HttpError(403, "Клубный администратор может заявлять игроков только в команды своего клуба");
    }

    // v1.0.23: история заявок разрешена — конфликт только с АКТИВНОЙ заявкой
    // (partial unique index в БД страхует от гонки)
    const existing = await db.registration.findFirst({
      where: { personId, teamId, seasonId, endDate: null },
    });
    if (existing) {
      throw new HttpError(409, "Игрок уже активно заявлен за эту команду в этом сезоне");
    }

    // v1.0.44 (аудит №10): роль заявки валидируется справочником (как и в PATCH)
    const finalRole =
      role === undefined || role === null || role === "" ? "PLAYER"
      : isRegistrationRole(role) ? String(role).trim()
      : null;
    if (finalRole === null) {
      throw new HttpError(422, `Роль заявки: одна из (${REGISTRATION_ROLE_CODES_TEXT})`);
    }

    // Инвариант «судья ≠ игрок» (сезонный скоуп): заявка игрока запрещена,
    // если человек назначен судьёй на матчи ЭТОГО сезона.
    // Судейство в другой лиге (другой seasonId) — не мешает заявке.
    if (finalRole === "PLAYER") {
      await assertPlayerRegistrationAllowed(db, personId, seasonId);
    }

    // v1.0.46 · ДАТА НАЧАЛА ЗАЯВКИ — редактируемая (баг «создал игрока, а его
    // нет в протоколе»): раньше всегда new Date(), и при вводе протокола
    // матча задним числом (kickoff в прошлом) новый игрок НЕ ПОПАДАЛ в список
    // доступных — заявка «начинается позже матча». Теперь дату можно задать
    // (по умолчанию — сегодня): например, датировать заявку началом сезона.
    const start = startDate ? new Date(String(startDate)) : new Date();
    if (Number.isNaN(start.getTime())) throw new HttpError(422, "Дата начала заявки не распознана");
    if (start > new Date(Date.now() + 24 * 3600 * 1000)) {
      throw new HttpError(422, "Дата начала заявки не может быть в будущем");
    }

    // завершаем предыдущую активную заявку игрока (трансфер).
    // v1.0.46: при датированной задним числом новой заявке прежняя закрывается
    // днём ДО начала новой (окна заявок не пересекаются), но не раньше
    // собственного startDate прежней (не создаём отрицательные интервалы).
    if (endDatePrevious) {
      const requested = new Date(endDatePrevious);
      const prevCeil = new Date(start.getTime() - 24 * 3600 * 1000);
      const active = await db.registration.findMany({
        where: { personId, seasonId, endDate: null },
      });
      for (const a of active) {
        const end = Number.isNaN(requested.getTime())
          ? prevCeil
          : new Date(Math.max(a.startDate.getTime(), Math.min(requested.getTime(), prevCeil.getTime())));
        await db.registration.update({
          where: { id: a.id },
          data: { endDate: end, status: "ENDED" },
        });
        await audit(user, "Registration", a.id, "UPDATE", { endDate: null }, { endDate: end.toISOString() });
      }
    }

    const reg = await db.registration.create({
      data: {
        personId, teamId, seasonId, startDate: start,
        number: number ? Number(number) : null,
        role: finalRole,
      },
    });
    await audit(user, "Registration", reg.id, "CREATE", null, { personId, teamId, seasonId, number, role, startDate: start.toISOString() });

    return Response.json({ ok: true, registration: reg });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
