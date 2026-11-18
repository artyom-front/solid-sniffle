import { errorResponse } from "@/lib/http";
import { getReferees } from "@/lib/services/public";

/** Судейский корпус: статистика и рейтинги */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const seasonId = searchParams.get("seasonId") ?? undefined;
    return Response.json(await getReferees(seasonId));
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
