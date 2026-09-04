// Milestone 5: оценки судей после матча (анонимно для публичного просмотра).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function POST(req: Request) {
  try {
    const user = await requireRole("PLAYER", "CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { matchId, rating, comment } = await req.json();
    if (!matchId || !rating) throw new HttpError(422, "Укажите матч и оценку");

    const match = await db.match.findUnique({ where: { id: matchId } });
    if (!match) throw new HttpError(404, "Матч не найден");
    if (match.status !== "COMPLETED") throw new HttpError(409, "Оценить судью можно только после завершения матча");
    if (!match.refereeId) throw new HttpError(422, "У матча нет судьи");

    // судья не оценивает сам себя
    if (user.personId && user.personId === match.refereeId) {
      throw new HttpError(403, "Судья не может оценить собственный матч");
    }

    const r = Number(rating);
    if (r < 1 || r > 5) throw new HttpError(422, "Оценка должна быть от 1 до 5");

    const existing = await db.refereeRating.findUnique({
      where: { matchId_authorUserId: { matchId, authorUserId: user.id } },
    });
    if (existing) throw new HttpError(409, "Вы уже оценили судью этого матча");

    const created = await db.refereeRating.create({
      data: { matchId, refereeId: match.refereeId, authorUserId: user.id, rating: r, comment: comment || null },
    });
    await audit(user, "RefereeRating", created.id, "CREATE", null, { matchId, rating: r });

    return Response.json({ ok: true, rating: created });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
