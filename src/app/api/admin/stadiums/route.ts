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
        photoUrl: s.photoUrl,
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
    const { name, city, address, capacity, photoUrl } = await req.json();
    if (!name || String(name).trim() === "") throw new HttpError(422, "Укажите название стадиона");
    // мягкая защита от дублей
    const dup = await db.stadium.findFirst({ where: { name: { equals: String(name).trim(), mode: "insensitive" } } });
    if (dup) throw new HttpError(409, `Стадион «${dup.name}» уже существует — проверьте список`);
    const data = {
      name: String(name).trim(),
      city: city || null,
      address: address || null,
      // v1.0.49 (аудит Task 56): вместимость — целое ≥ 0 или null;
      // раньше NaN → Prisma 500, отрицательное молча писалось в БД
      capacity: (() => {
        if (capacity === undefined || capacity === null || capacity === "") return null;
        const n = Number(capacity);
        if (!Number.isInteger(n) || n < 0) throw new HttpError(422, "Вместимость: целое неотрицательное число (мест)");
        return n;
      })(),
      photoUrl: typeof photoUrl === "string" && photoUrl.startsWith("/api/media/") ? photoUrl : null,
    };
    const stadium = await db.stadium.create({ data });
    await audit(user, "Stadium", stadium.id, "CREATE", null, data);
    return Response.json({ ok: true, stadium });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
