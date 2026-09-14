// CRUD команд: список всех (с клубом и числом заявок), создание.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function GET(req: Request) {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

    const teams = await db.team.findMany({
      where: q ? { OR: [{ name: { contains: q } }, { club: { name: { contains: q } } }] } : {},
      include: {
        club: true,
        _count: { select: { registrations: true, homeMatches: true, awayMatches: true } },
      },
      orderBy: { name: "asc" },
    });
    return Response.json({
      teams: teams.map((t) => ({
        id: t.id, name: t.name, city: t.city, logoUrl: t.logoUrl,
        club: t.club ? { id: t.club.id, name: t.club.name } : null,
        registrationsCount: t._count.registrations,
        matchesCount: t._count.homeMatches + t._count.awayMatches,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { name, clubId, city, logoUrl } = await req.json();
    if (!name || String(name).trim() === "") throw new HttpError(422, "Укажите название команды");
    if (clubId) {
      const club = await db.club.findUnique({ where: { id: clubId } });
      if (!club) throw new HttpError(404, "Клуб не найден");
    }
    const team = await db.team.create({
      data: { name: String(name).trim(), clubId: clubId || null, city: city || null, logoUrl: logoUrl || null },
    });
    await audit(user, "Team", team.id, "CREATE", null, team);
    return Response.json({ ok: true, team });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
