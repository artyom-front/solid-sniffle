// Журнал аудита (инвариант №4): история изменений для супер-админа.

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function GET(req: Request) {
  try {
    await requireRole("SUPER_ADMIN", "LEAGUE_ADMIN");
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return Response.json({
      logs: logs.map((l) => ({
        id: l.id,
        userEmail: l.userEmail,
        entity: l.entity,
        entityId: l.entityId,
        action: l.action,
        oldValue: l.oldValue ? safeParse(l.oldValue) : null,
        newValue: l.newValue ? safeParse(l.newValue) : null,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export const dynamic = "force-dynamic";
