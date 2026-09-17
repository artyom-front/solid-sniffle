// Профиль стадиона: характеристики, сыгранные и предстоящие матчи, статистика.

import { errorResponse } from "@/lib/http";
import { getStadiumProfile } from "@/lib/services/public";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return Response.json(await getStadiumProfile(id));
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
