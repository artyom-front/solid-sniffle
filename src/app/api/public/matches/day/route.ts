// Livescore-лента: матчи по дате (МСК) и формату, сгруппированные по лигам (текущие сезоны).

import { errorResponse } from "@/lib/http";
import { getMatchesDay } from "@/lib/services/public";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? "today"; // YYYY-MM-DD | today | all
    const format = searchParams.get("format") ?? "all";
    return Response.json(await getMatchesDay(date, format));
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
