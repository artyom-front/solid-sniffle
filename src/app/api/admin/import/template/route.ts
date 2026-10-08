// Скачивание CSV-шаблона для массового импорта.
// GET /api/admin/import/template?type=players|persons|teams|stadiums|clubs
//
// BOM + «;» + CRLF — файл открывается в Excel без «кракозябр»
// и сразу раскладывается по колонкам.

import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { IMPORT_SPECS, buildTemplateCsv, templateFilename, type ImportEntity } from "@/lib/importTemplates";

export async function GET(req: Request) {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") ?? "") as ImportEntity;
    if (!IMPORT_SPECS[type]) throw new HttpError(422, "Неизвестный тип шаблона");

    const csv = buildTemplateCsv(type);
    const bom = "\uFEFF"; // UTF-8 BOM — Excel распознаёт кириллицу

    return new Response(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${templateFilename(type)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
