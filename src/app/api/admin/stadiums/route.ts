// CRUD стадионов: список и создание.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function GET() {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const stadiums = await db.stadium.findMany({
      include: { _count: { select: { matches: true } } },
      orderBy: { name: "asc" },
    });
    return Response.json({
      stadiums: stadiums.map((s) => ({
        id: s.id, name: s.name, city: s.city, address: s.address, capacity: s.capacity,
        matchesCount: s._count.matches,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { name, city, address, capacity } = await req.json();
    if (!name || String(name).trim() === "") throw new HttpError(422, "Укажите название стадиона");
    const data = {
      name: String(name).trim(),
      city: city || null,
      address: address || null,
      capacity: capacity ? Number(capacity) : null,
    };
    const stadium = await db.stadium.create({ data });
    await audit(user, "Stadium", stadium.id, "CREATE", null, data);
    return Response.json({ ok: true, stadium });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
