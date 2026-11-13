import { errorResponse } from "@/lib/http";
import { getMatchDetail } from "@/lib/services/profiles";

/** Детальная карточка матча: события, составы, судья, оценки, H2H, кто пропускает, инсайты */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return Response.json(await getMatchDetail(id));
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
