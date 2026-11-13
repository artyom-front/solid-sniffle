import { errorResponse } from "@/lib/http";
import { getPlayerProfile } from "@/lib/services/profiles";

/** Профиль игрока/судьи: статистика по сезонам, события, дисквалификации, судейская карьера */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return Response.json(await getPlayerProfile(id));
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
