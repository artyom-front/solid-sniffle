// КДК (Epic 1): ручное управление дисквалификациями.
// RBAC: SUPER_ADMIN, LEAGUE_ADMIN (КДК лиги).

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

export async function GET(req: Request) {
  try {
    await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { searchParams } = new URL(req.url);
    const seasonId = searchParams.get("seasonId");
    if (!seasonId) return Response.json({ error: "Укажите seasonId" }, { status: 422 });

    const suspensions = await db.suspension.findMany({
      where: { seasonId },
      include: { person: { include: { registrations: { where: { seasonId }, include: { team: true } } } } },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    });

    const persons = await db.person.findMany({
      include: { registrations: { where: { seasonId }, include: { team: true } } },
    });

    return Response.json({
      suspensions: suspensions.map((s) => ({
        id: s.id,
        person: { id: s.person.id, name: `${s.person.lastName} ${s.person.firstName}` },
        team: s.person.registrations[0] ? { id: s.person.registrations[0].team.id, name: s.person.registrations[0].team.name } : null,
        source: s.source,
        reason: s.reason,
        matchesTotal: s.matchesTotal,
        matchesServed: s.matchesServed,
        isLifetime: s.isLifetime,
        isActive: s.isActive,
        createdAt: s.createdAt.toISOString(),
      })),
      // кандидаты для ручного бана: все заявленные в сезоне
      persons: persons
        .filter((p) => p.registrations.length > 0)
        .map((p) => ({
          id: p.id,
          name: `${p.lastName} ${p.firstName} ${p.middleName ?? ""}`.trim(),
          team: p.registrations[0].team.name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const body = await req.json();
    const action = body.action as string;

    if (action === "create") {
      const { personId, seasonId, matchesTotal, reason, isLifetime } = body;
      if (!personId || !seasonId) throw new HttpError(422, "Укажите игрока и сезон");
      const season = await db.season.findUnique({ where: { id: seasonId } });
      if (!season) throw new HttpError(404, "Сезон не найден");

      const s = await db.suspension.create({
        data: {
          personId,
          seasonId,
          source: "MANUAL",
          reason: reason || "Решение КДК",
          matchesTotal: isLifetime ? 0 : Math.max(1, Number(matchesTotal) || 1),
          isLifetime: !!isLifetime,
        },
      });
      await audit(user, "Suspension", s.id, "CREATE", null, { personId, seasonId, matchesTotal, reason, isLifetime });
      return Response.json({ ok: true, suspension: s });
    }

    if (action === "update") {
      const { id, matchesTotal, reason, isLifetime, isActive } = body;
      const s = await db.suspension.findUnique({ where: { id } });
      if (!s) throw new HttpError(404, "Дисквалификация не найдена");

      const updated = await db.suspension.update({
        where: { id },
        data: {
          matchesTotal: matchesTotal !== undefined ? Math.max(1, Number(matchesTotal)) : s.matchesTotal,
          reason: reason !== undefined ? reason : s.reason,
          isLifetime: isLifetime !== undefined ? !!isLifetime : s.isLifetime,
          isActive: isActive !== undefined ? !!isActive : s.isActive,
          // ручное изменение срока пересбрасывает прогресс отсиживания
          matchesServed: matchesTotal !== undefined && Number(matchesTotal) !== s.matchesTotal ? 0 : s.matchesServed,
        },
      });
      await audit(user, "Suspension", id, "UPDATE", s, updated);
      return Response.json({ ok: true, suspension: updated });
    }

    if (action === "delete") {
      const { id } = body;
      const s = await db.suspension.findUnique({ where: { id } });
      if (!s) throw new HttpError(404, "Дисквалификация не найдена");
      await db.suspension.delete({ where: { id } });
      await audit(user, "Suspension", id, "DELETE", s, null);
      return Response.json({ ok: true });
    }

    throw new HttpError(422, "Неизвестное действие");
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
