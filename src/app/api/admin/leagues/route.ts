// CRUD лиг (Milestone 2): создание/редактирование. Управление закреплением в «Топ-лигах».

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

const FORMATS = ["F11", "F8", "F6", "FUTSAL"];

export function leaguePayload(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new HttpError(422, "Укажите название лиги");
  const format = String(body.format ?? "");
  if (!FORMATS.includes(format)) throw new HttpError(422, "Формат: F11, F8, F6 или FUTSAL");
  const int = (v: unknown, def: number, min: number, max: number) => {
    const n = v === undefined || v === null || v === "" ? def : Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(422, `Число должно быть от ${min} до ${max}`);
    return n;
  };
  return {
    name,
    shortName: body.shortName ? String(body.shortName).trim() : null,
    format,
    isPinned: !!body.isPinned,
    priority: int(body.priority, 0, 0, 100),
    yellowCardLimit: int(body.yellowCardLimit, 3, 1, 10),
    yellowCardBanMatches: int(body.yellowCardBanMatches, 1, 1, 10),
    redCardBanMatches: int(body.redCardBanMatches, 1, 0, 10),
    walkoverScore: int(body.walkoverScore, 3, 1, 9),
    transferWindowEnd: body.transferWindowEnd ? new Date(String(body.transferWindowEnd)) : null,
  };
}

export async function GET() {
  try {
    await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const leagues = await db.league.findMany({
      include: { seasons: { orderBy: { startDate: "desc" } } },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    return Response.json({
      leagues: leagues.map((l) => ({
        id: l.id, name: l.name, shortName: l.shortName, format: l.format,
        isPinned: l.isPinned, priority: l.priority,
        yellowCardLimit: l.yellowCardLimit, yellowCardBanMatches: l.yellowCardBanMatches,
        redCardBanMatches: l.redCardBanMatches, walkoverScore: l.walkoverScore,
        transferWindowEnd: l.transferWindowEnd?.toISOString() ?? null,
        seasons: l.seasons.map((s) => ({ id: s.id, name: s.name, startDate: s.startDate.toISOString(), isCurrent: s.isCurrent })),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const data = leaguePayload(await req.json());
    const league = await db.league.create({ data });
    await audit(user, "League", league.id, "CREATE", null, data);
    return Response.json({ ok: true, league });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
