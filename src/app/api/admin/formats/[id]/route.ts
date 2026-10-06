// CRUD видов футбола: обновление и удаление.
// v1.0.42: контент сайта — СТРОГО SUPER_ADMIN.
// Удаление не трогает лиги: у лиги просто остаётся формат без ссылки —
// в сайдбаре он попадёт в группу «Другие форматы» (универсальное имя).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { formatLinkPayload } from "../route";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("SUPER_ADMIN");
    const { id } = await ctx.params;
    const link = await db.formatLink.findUnique({ where: { id } });
    if (!link) throw new HttpError(404, "Формат не найден");
    const data = formatLinkPayload(await req.json(), true);
    if (Object.keys(data).length === 0) throw new HttpError(422, "Нет изменений: передайте code/label/sortOrder/isVisible");
    if (data.code && data.code !== link.code) {
      const dup = await db.formatLink.findUnique({ where: { code: String(data.code) } });
      if (dup) throw new HttpError(422, `Формат ${data.code} уже есть в списке`);
    }
    const updated = await db.formatLink.update({ where: { id }, data });
    await audit(user, "FormatLink", id, "UPDATE", link, updated);
    return Response.json({ ok: true, format: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    // v1.0.49 (аудит Task 56): контент сайта — СТРОГО SUPER_ADMIN, как в
    // GET/POST/PATCH этого же роута; LEAGUE_ADMIN здесь был регрессом v1.0.42
    const user = await requireRole("SUPER_ADMIN");
    const { id } = await ctx.params;
    const link = await db.formatLink.findUnique({ where: { id } });
    if (!link) throw new HttpError(404, "Формат не найден");
    await db.formatLink.delete({ where: { id } });
    await audit(user, "FormatLink", id, "DELETE", link, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
