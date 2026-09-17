import { errorResponse } from "@/lib/http";
import { getOverview } from "@/lib/services/public";

/** Обзор портала: лиги, сезоны, агрегированная статистика */
export async function GET() {
  try {
    return Response.json(await getOverview());
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
