// CRUD стат-карточек: обновление и удаление.
// v1.0.42: контент сайта — СТРОГО SUPER_ADMIN.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { statBlockPayload } from "../route";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("SUPER_ADMIN");
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
    // v1.0.49 (аудит Task 56): контент сайта — СТРОГО SUPER_ADMIN, как в
    // GET/POST/PATCH этого же роута; LEAGUE_ADMIN здесь был регрессом v1.0.42
    const user = await requireRole("SUPER_ADMIN");
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
