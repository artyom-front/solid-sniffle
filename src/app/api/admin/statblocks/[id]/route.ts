// CRUD стат-карточек: обновление и удаление.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { statBlockPayload } from "../route";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const block = await db.statBlock.findUnique({ where: { id } });
    if (!block) throw new HttpError(404, "Стат-карточка не найдена");
    const data = statBlockPayload(await req.json());
    const updated = await db.statBlock.update({ where: { id }, data });
    await audit(user, "StatBlock", id, "UPDATE", block, updated);
    return Response.json({ ok: true, statBlock: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const block = await db.statBlock.findUnique({ where: { id } });
    if (!block) throw new HttpError(404, "Стат-карточка не найдена");
    await db.statBlock.delete({ where: { id } });
    await audit(user, "StatBlock", id, "DELETE", block, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
