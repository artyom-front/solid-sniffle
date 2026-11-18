// Список стадионов (для справочника и ссылок из карточек матчей).

import { db } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
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

export const dynamic = "force-dynamic";
