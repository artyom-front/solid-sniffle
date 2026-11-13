import { errorResponse, HttpError } from "@/lib/http";
import { getSeasonTeams } from "@/lib/services/public";

/** Команды сезона с составами (заявками) */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const seasonId = searchParams.get("seasonId");
    if (!seasonId) throw new HttpError(422, "Укажите seasonId");
    return Response.json(await getSeasonTeams(seasonId));
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
