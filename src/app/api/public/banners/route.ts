// Активные баннеры по слотам (Milestone 4). Пустой слот → UI рисует заглушку «Реклама».

import { errorResponse } from "@/lib/http";
import { getBanners } from "@/lib/services/public";

export async function GET() {
  try {
    return Response.json(await getBanners());
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
