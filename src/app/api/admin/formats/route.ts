// CRUD видов футбола (v1.0.29): ссылки «Футбол / 8×8 / 6×6 / Мини-футбол»
// в меню сайта. Админ добавляет/убирает/переименовывает форматы под
// ситуацию (стандарт 11×11, футзал 5×5, ЛФЛ 8×8, разновидности).
// code совпадает с League.format — по нему фильтруется лента ?format=
// и группируются лиги в сайдбаре. Лимит стартового состава для кастомных
// форматов — 11 по умолчанию (как у товарняков), см. STARTER_LIMITS.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { FORMAT_CODE_RE, FORMAT_LABELS } from "@/lib/labels";

export function formatLinkPayload(body: Record<string, unknown>, partial = false) {
  const out: Record<string, unknown> = {};

  if (!partial || body.code !== undefined) {
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!FORMAT_CODE_RE.test(code)) {
      throw new HttpError(422, "Код формата: 1–12 символов, латиница A-Z/цифры/подчёркивание (например F7, LFL_8)");
    }
    out.code = code;
  }
  if (!partial || body.label !== undefined) {
    const label = String(body.label ?? "").trim();
    if (!label) throw new HttpError(422, "Укажите подпись в меню (например «7×7»)");
    if (label.length > 24) throw new HttpError(422, "Подпись: до 24 символов");
    out.label = label;
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = body.sortOrder === null || body.sortOrder === "" ? 0 : Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000) throw new HttpError(422, "Порядок: 0–1000");
    out.sortOrder = sortOrder;
  }
  if (body.isVisible !== undefined) out.isVisible = !!body.isVisible;

  return out;
}

export async function GET() {
  try {
    await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    // все форматы, включая скрытые: скрытая ссылка не видна в меню сайта,
    // но лиги этого формата остаются и группируются в «Другие форматы»
    const links = await db.formatLink.findMany({ orderBy: { sortOrder: "asc" } });
    const counts = await db.league.groupBy({ by: ["format"], _count: { _all: true } });
    const countOf = (code: string) => counts.find((c) => c.format === code)?._count._all ?? 0;
    return Response.json({
      formats: links.map((f) => ({
        id: f.id, code: f.code, label: f.label,
        sortOrder: f.sortOrder, isVisible: f.isVisible,
        leagueCount: countOf(f.code),
        builtin: Object.prototype.hasOwnProperty.call(FORMAT_LABELS, f.code),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const data = formatLinkPayload(await req.json());
    const code = String(data.code);
    const dup = await db.formatLink.findUnique({ where: { code } });
    if (dup) throw new HttpError(422, `Формат ${code} уже есть в списке`);
    const link = await db.formatLink.create({
      data: {
        code,
        label: String(data.label),
        sortOrder: data.sortOrder === undefined ? 0 : Number(data.sortOrder),
        isVisible: data.isVisible === undefined ? true : !!data.isVisible,
      },
    });
    await audit(user, "FormatLink", link.id, "CREATE", null, link);
    return Response.json({ ok: true, format: link });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
