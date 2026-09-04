// CRUD баннеров: обновление и удаление.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { bannerPayload } from "../route";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const banner = await db.banner.findUnique({ where: { id } });
    if (!banner) throw new HttpError(404, "Баннер не найден");
    const data = bannerPayload(await req.json());
    const updated = await db.banner.update({ where: { id }, data });
    await audit(user, "Banner", id, "UPDATE", banner, updated);
    return Response.json({ ok: true, banner: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
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
