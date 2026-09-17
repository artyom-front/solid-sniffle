import { errorResponse, HttpError } from "@/lib/http";
import { getScorers } from "@/lib/services/public";

/** Топы бомбардиров / ассистентов / вратарей — WO-матчи исключены (Epic 2) */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const seasonId = searchParams.get("seasonId");
    if (!seasonId) throw new HttpError(422, "Укажите seasonId");
    return Response.json(await getScorers(seasonId));
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
