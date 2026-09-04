// Дашборд админки (Ozon-style): только метрики администрирования.
// KPI + алерты (матч без судьи, незакрытый протокол, LIVE) + свежий аудит.

import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

const MSK_OFFSET = 3 * 3600 * 1000;

export async function GET() {
  try {
    await requireRole("LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE");

    const now = new Date();
    const mskNow = new Date(now.getTime() + MSK_OFFSET);
    const todayStart = Date.UTC(mskNow.getFullYear(), mskNow.getMonth(), mskNow.getDate()) - MSK_OFFSET;
    const todayEnd = todayStart + 24 * 3600 * 1000;

    const [matches, activeSuspensions, recentAudit] = await Promise.all([
      db.match.findMany({
        select: {
          id: true,
          kickoff: true,
          status: true,
          refereeId: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      }),
      db.suspension.findMany({ where: { isActive: true }, select: { id: true } }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    ]);

    const t = (m: (typeof matches)[number]) => `${m.homeTeam.name} — ${m.awayTeam.name}`;
    const in48h = matches.filter(
      (m) =>
        m.status === "SCHEDULED" &&
        !m.refereeId &&
        m.kickoff.getTime() >= now.getTime() &&
        m.kickoff.getTime() <= now.getTime() + 48 * 3600 * 1000
    );
    const overdue = matches.filter(
      (m) =>
        (m.status === "SCHEDULED" || m.status === "LIVE") &&
        m.kickoff.getTime() < now.getTime()
    );
    const live = matches.filter((m) => m.status === "LIVE");
    const today = matches.filter(
      (m) => m.kickoff.getTime() >= todayStart && m.kickoff.getTime() < todayEnd
    );

    const alerts: { id: string; level: "red" | "amber" | "info"; text: string; matchId: string | null }[] = [
      ...live.map((m) => ({ id: `live-${m.id}`, level: "red" as const, text: `Идёт сейчас: ${t(m)} — протокол открыт`, matchId: m.id })),
      ...overdue
        .filter((m) => m.status !== "LIVE")
        .map((m) => ({ id: `od-${m.id}`, level: "amber" as const, text: `Не закрыт протокол: ${t(m)}`, matchId: m.id })),
      ...in48h.map((m) => ({
        id: `ref-${m.id}`,
        level: "amber" as const,
        text: `Через ≤48 ч без судьи: ${t(m)} — назначьте арбитра`,
        matchId: m.id,
      })),
    ];

    return Response.json({
      kpis: {
        matchesToday: today.length,
        live: live.length,
        protocolsPending: overdue.length,
        withoutReferee48h: in48h.length,
        activeSuspensions: activeSuspensions.length,
      },
      alerts,
      recentAudit: recentAudit.map((l) => ({
        id: l.id,
        userEmail: l.userEmail,
        entity: l.entity,
        entityId: l.entityId,
        action: l.action,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
