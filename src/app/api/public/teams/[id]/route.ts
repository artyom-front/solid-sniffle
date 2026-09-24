// Профиль команды: клуб, город, составы по сезонам (игроки + тренеры), матчи, позиция в таблице,
// + сигналы: серия результатов, лучший бомбардир, смена тренера.

import { errorResponse } from "@/lib/http";
import { getTeamProfile } from "@/lib/services/profiles";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return Response.json(await getTeamProfile(id));
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
