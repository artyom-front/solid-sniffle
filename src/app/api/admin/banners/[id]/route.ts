// CRUD баннеров: обновление и удаление.
// v1.0.42: контент сайта — СТРОГО SUPER_ADMIN.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { bannerPayload } from "../route";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("SUPER_ADMIN");
    const { id } = await ctx.params;
    const banner = await db.banner.findUnique({ where: { id } });
    if (!banner) throw new HttpError(404, "Баннер не найден");
    const body = await req.json();
    const data = bannerPayload(body);
    // v1.0.49 (аудит Task 56): PATCH — full-replace, а форма баннера в
    // админке не содержит дат показа. Раньше каждое редактирование
    // МОЛЧА обнуляло расписание (startsAt/endsAt → null), выставленное
    // через API. Даты сохраняем, если запрос их не передал вовсе;
    // явные null по-прежнему очищают расписание.
    if (body.startsAt === undefined) data.startsAt = banner.startsAt;
    if (body.endsAt === undefined) data.endsAt = banner.endsAt;
    const updated = await db.banner.update({ where: { id }, data });
    await audit(user, "Banner", id, "UPDATE", banner, updated);
    return Response.json({ ok: true, banner: updated });
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
    const banner = await db.banner.findUnique({ where: { id } });
    if (!banner) throw new HttpError(404, "Баннер не найден");
    await db.banner.delete({ where: { id } });
    await audit(user, "Banner", id, "DELETE", banner, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
