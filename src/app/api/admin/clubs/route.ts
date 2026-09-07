// CRUD клубов (бренд/юрлицо — инвариант №1: Club ≠ Team).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function GET() {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const clubs = await db.club.findMany({
      include: { teams: { select: { id: true, name: true } }, _count: { select: { teams: true, admins: true } } },
      orderBy: { name: "asc" },
    });
    return Response.json({
      clubs: clubs.map((c) => ({
        id: c.id, name: c.name, city: c.city, description: c.description,
        teams: c.teams, teamsCount: c._count.teams,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { name, city, description } = await req.json();
    if (!name || String(name).trim() === "") throw new HttpError(422, "Укажите название клуба");
    const club = await db.club.create({
      data: { name: String(name).trim(), city: city || null, description: description || null },
    });
    await audit(user, "Club", club.id, "CREATE", null, club);
    return Response.json({ ok: true, club });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
