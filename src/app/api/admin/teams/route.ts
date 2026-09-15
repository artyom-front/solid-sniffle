// CRUD команд: список всех (с клубом и числом заявок), создание.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function GET(req: Request) {
  try {
    await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

    const teams = await db.team.findMany({
      where: q ? { OR: [{ name: { contains: q } }, { club: { name: { contains: q } } }] } : {},
      include: {
        club: true,
        _count: { select: { registrations: true, homeMatches: true, awayMatches: true } },
      },
      orderBy: { name: "asc" },
    });
    return Response.json({
      teams: teams.map((t) => ({
        id: t.id, name: t.name, city: t.city, logoUrl: t.logoUrl,
        club: t.club ? { id: t.club.id, name: t.club.name } : null,
        registrationsCount: t._count.registrations,
        matchesCount: t._count.homeMatches + t._count.awayMatches,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN");
    const body = await req.json();

    // ---------- Массовое удаление команд (v1.0.19) ----------
    // Правила те же, что у одиночного DELETE: команды с матчами
    // пропускаются (история неприкосновенна); с cascade удаляются
    // вместе с заявками.
    if (body.action === "bulk-delete") {
      if (user.role !== "LEAGUE_ADMIN" && user.role !== "SUPER_ADMIN") {
        throw new HttpError(403, "Массовое удаление доступно администраторам лиги");
      }
      const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (ids.length === 0) throw new HttpError(422, "Ничего не выбрано");
      const cascade = !!body.cascade;

      const teams = await db.team.findMany({
        where: { id: { in: ids } },
        include: { _count: { select: { homeMatches: true, awayMatches: true, registrations: true } } },
      });
      const deleted: string[] = [];
      const blocked: { id: string; label: string; reason: string }[] = [];
      for (const t of teams) {
        const matches = t._count.homeMatches + t._count.awayMatches;
        if (matches > 0) {
          blocked.push({ id: t.id, label: t.name, reason: `матчей ${matches} — история неприкосновенна (Merge команд переносит её)` });
          continue;
        }
        if (t._count.registrations > 0 && !cascade) {
          blocked.push({ id: t.id, label: t.name, reason: `заявок ${t._count.registrations} — повторите с каскадом или удалите по одному` });
          continue;
        }
        await db.$transaction(async (tx) => {
          if (cascade && t._count.registrations > 0) {
            await tx.registration.deleteMany({ where: { teamId: t.id } });
          }
          await tx.team.delete({ where: { id: t.id } });
        });
        await audit(user, "Team", t.id, "DELETE", null, { bulk: true, cascade });
        deleted.push(t.id);
      }
      return Response.json({ ok: true, deleted: deleted.length, blocked });
    }

    const { name, clubId, city, logoUrl } = body;
    if (!name || String(name).trim() === "") throw new HttpError(422, "Укажите название команды");
    if (clubId) {
      const club = await db.club.findUnique({ where: { id: clubId } });
      if (!club) throw new HttpError(404, "Клуб не найден");
    }
    const team = await db.team.create({
      data: { name: String(name).trim(), clubId: clubId || null, city: city || null, logoUrl: logoUrl || null },
    });
    await audit(user, "Team", team.id, "CREATE", null, team);
    return Response.json({ ok: true, team });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
