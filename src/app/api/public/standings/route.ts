import { errorResponse, HttpError } from "@/lib/http";
import { getStandings } from "@/lib/services/public";

/** Турнирная таблица сезона (ленивая материализация — в проде Materialized View + пересчёт в очереди) */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const seasonId = searchParams.get("seasonId");
    if (!seasonId) throw new HttpError(422, "Укажите seasonId");
    return Response.json(await getStandings(seasonId));
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
