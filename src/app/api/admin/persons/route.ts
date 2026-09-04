// Справочник персон для админки (поиск, создание).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function GET(req: Request) {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN", "REFEREE");
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const seasonId = searchParams.get("seasonId");

    const where = q
      ? { OR: [{ lastName: { contains: q } }, { firstName: { contains: q } }] }
      : {};

    const persons = await db.person.findMany({
      where,
      include: {
        registrations: seasonId ? { where: { seasonId }, include: { team: true } } : { include: { team: true } },
      },
      take: 200,
      orderBy: [{ lastName: "asc" }],
    });

    return Response.json({
      persons: persons.map((p) => ({
        id: p.id,
        name: `${p.lastName} ${p.firstName} ${p.middleName ?? ""}`.trim(),
        position: p.position,
        isReferee: p.isReferee,
        teams: [...new Set(p.registrations.map((r) => r.team.name))],
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { firstName, lastName, middleName, position, birthDate, isReferee } = await req.json();
    if (!firstName || !lastName) throw new HttpError(422, "Укажите имя и фамилию");

    const person = await db.person.create({
      data: {
        firstName,
        lastName,
        middleName: middleName || null,
        position: position || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        isReferee: !!isReferee,
      },
    });
    await audit(user, "Person", person.id, "CREATE", null, { firstName, lastName, position });
    return Response.json({ ok: true, person });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
