// Активные стат-карточки правой колонки (v1.0.29): редакционные блоки
// статистики с опциональным фото. Пусто → пустой массив (колонка без
// карточек не меняет разметку — фиксированные боксы только когда есть).

import { errorResponse } from "@/lib/http";
import { getStatBlocks } from "@/lib/services/public";

export async function GET() {
  try {
    return Response.json(await getStatBlocks());
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
