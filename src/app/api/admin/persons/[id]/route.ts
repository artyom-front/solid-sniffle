// CRUD персон: обновление и удаление. Удаление заблокировано, если профиль привязан
// к матчам/заявкам/дисквалификациям — по PRD такие профили объединяют через Merge (Epic 4).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

const POSITIONS = ["GK", "DF", "MF", "FW"];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const person = await db.person.findUnique({ where: { id } });
    if (!person) throw new HttpError(404, "Персона не найдена");
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.firstName !== undefined) {
      if (!String(body.firstName).trim()) throw new HttpError(422, "Имя не может быть пустым");
      data.firstName = String(body.firstName).trim();
    }
    if (body.lastName !== undefined) {
      if (!String(body.lastName).trim()) throw new HttpError(422, "Фамилия не может быть пустой");
      data.lastName = String(body.lastName).trim();
    }
    if (body.middleName !== undefined) data.middleName = body.middleName || null;
    if (body.position !== undefined) {
      if (body.position && !POSITIONS.includes(body.position)) throw new HttpError(422, "Позиция: GK, DF, MF или FW");
      data.position = body.position || null;
    }
    if (body.birthDate !== undefined) data.birthDate = body.birthDate ? new Date(String(body.birthDate)) : null;
    if (body.isReferee !== undefined) {
      // нельзя снять флаг судьи, если есть назначенные матчи
      if (!body.isReferee) {
        const refs = await db.match.count({ where: { refereeId: id } });
        if (refs > 0) throw new HttpError(409, `Нельзя снять статус судьи: назначено матчей — ${refs}`);
      }
      data.isReferee = !!body.isReferee;
    }

    const updated = await db.person.update({ where: { id }, data });
    await audit(user, "Person", id, "UPDATE", person, updated);
    return Response.json({ ok: true, person: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const person = await db.person.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            events: true, assists: true, lineups: true, registrations: true,
            suspensions: true, refereedMatches: true, ratingsReceived: true, users: true,
          },
        },
      },
    });
    if (!person) throw new HttpError(404, "Персона не найдена");

    const busy = {
      events: person._count.events + person._count.assists,
      lineups: person._count.lineups,
      registrations: person._count.registrations,
      suspensions: person._count.suspensions,
      matches: person._count.refereedMatches,
      ratings: person._count.ratingsReceived,
    };
    if (Object.values(busy).some((n) => n > 0)) {
      throw new HttpError(409, `Профиль привязан к турнирным данным (событий ${busy.events}, заявок ${busy.registrations}, матчей судьи ${busy.matches}). Используйте «Merge профилей».`);
    }
    await db.user.updateMany({ where: { personId: id }, data: { personId: null } });
    await db.person.delete({ where: { id } });
    await audit(user, "Person", id, "DELETE", person, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
