// Каталог кастомных ролей персоны (поверх системного каталога lib/roles.ts).
// GET — список; POST { name } — создать; DELETE ?id= — удалить
// (роль снимается со всех персон, у которых была выбрана).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { CUSTOM_ROLE_PREFIX } from "@/lib/roles";

export async function GET() {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const customs = await db.customRole.findMany({ orderBy: { name: "asc" } });
    return Response.json({
      customRoles: customs.map((r) => ({
        id: r.id,
        code: CUSTOM_ROLE_PREFIX + r.id,
        name: r.name,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { name } = await req.json();
    const clean = String(name ?? "").trim();
    if (!clean) throw new HttpError(422, "Укажите название роли");
    if (clean.length > 60) throw new HttpError(422, "Название роли слишком длинное");
    const dup = await db.customRole.findFirst({ where: { name: { equals: clean, mode: "insensitive" } } });
    if (dup) throw new HttpError(409, `Роль «${clean}» уже существует`);
    const role = await db.customRole.create({ data: { name: clean } });
    await audit(user, "CustomRole", role.id, "CREATE", null, { name: clean });
    return Response.json({ ok: true, id: role.id, code: CUSTOM_ROLE_PREFIX + role.id, name: clean });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(422, "Укажите id роли");
    const role = await db.customRole.findUnique({ where: { id } });
    if (!role) throw new HttpError(404, "Роль не найдена");
    // снимаем роль со всех персон
    const persons = await db.person.findMany({ where: { roles: { has: CUSTOM_ROLE_PREFIX + id } }, select: { id: true, roles: true } });
    for (const p of persons) {
      await db.person.update({
        where: { id: p.id },
        data: { roles: p.roles.filter((c) => c !== CUSTOM_ROLE_PREFIX + id) },
      });
    }
    await db.customRole.delete({ where: { id } });
    await audit(user, "CustomRole", id, "DELETE", { name: role.name }, { removedFromPersons: persons.length });
    return Response.json({ ok: true, removedFromPersons: persons.length });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
