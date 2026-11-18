// Генерация расписания (Milestone 2): round-robin по заявленным командам сезона.

import { db } from "@/lib/db";
import { requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { assertSeasonInScope } from "@/lib/scope";
import { generateRoundRobin } from "@/lib/engine/schedule";
import { audit } from "@/lib/engine/lifecycle";

export async function POST(req: Request) {
  try {
    const user = await requireRole("LEAGUE_ADMIN", "SUPER_ADMIN");
    const { seasonId, double, startDate, kickoffHour, replaceScheduled, stageName } = await req.json();
    if (!seasonId || !startDate) throw new HttpError(422, "Укажите сезон и дату старта");
    await assertSeasonInScope(user, seasonId);

    const season = await db.season.findUnique({ where: { id: seasonId }, include: { league: true } });
    if (!season) throw new HttpError(404, "Сезон не найден");

    // команды сезона = команды с активными заявками
    const regs = await db.registration.findMany({
      where: { seasonId, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
      include: { team: true },
    });
    const teamIds = [...new Set(regs.map((r) => r.teamId))];
    if (teamIds.length < 2) throw new HttpError(422, "В сезоне должно быть не менее двух команд с заявками");

    // v1.0.49 (аудит Task 56): этапы — детерминированно (без orderBy выбор
    // stages[0] был произвольным при нескольких этапах; у Stage нет createdAt)
    const stages = await db.stage.findMany({ where: { seasonId }, orderBy: { name: "asc" } });
    let stage = stages[0];
    if (!stage) {
      stage = await db.stage.create({
        data: { seasonId, name: stageName || "Регулярный чемпионат", type: "ROUND_ROBIN" },
      });
    }

    const slots = generateRoundRobin(teamIds, !!double);
    if (slots.length === 0) throw new HttpError(422, "Не удалось сгенерировать расписание");

    const stadiums = await db.stadium.findMany();
    // v1.0.49 (аудит Task 56): битая дата старта — честная 422, а не 500;
    // час старта — 0–23 (раньше 25 молча сдвигал сутки)
    const start = new Date(`${startDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) throw new HttpError(422, "Некорректная дата старта (формат ГГГГ-ММ-ДД)");
    const hour = kickoffHour === undefined || kickoffHour === null ? 11 : Number(kickoffHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new HttpError(422, "Час старта: 0–23");

    const byRound = new Map<number, number>();
    const created: string[] = [];
    // v1.0.49 (аудит Task 56): генерация атомарна — раньше deleteMany и N
    // отдельных create шли без транзакции: сбой в середине оставлял сезон
    // без старого расписания и с половиной нового (эталон — import)
    await db.$transaction(
      async (tx) => {
        if (replaceScheduled) {
          await tx.match.deleteMany({ where: { stage: { seasonId }, status: "SCHEDULED" } });
        }
        for (const s of slots) {
          const idx = byRound.get(s.round) ?? 0;
          byRound.set(s.round, idx + 1);
          const kickoff = new Date(start.getTime() + (s.round - 1) * 7 * 24 * 3600 * 1000);
          kickoff.setUTCHours(hour - 3 + (idx % 4) * 2, 0, 0, 0);
          const m = await tx.match.create({
            data: {
              stageId: stage!.id,
              round: s.round,
              homeTeamId: s.homeTeamId,
              awayTeamId: s.awayTeamId,
              stadiumId: stadiums.length ? stadiums[(s.round + idx) % stadiums.length].id : null,
              kickoff,
            },
          });
          created.push(m.id);
        }
      },
      { timeout: 60000 }
    );

    await audit(user, "Stage", stage.id, "CREATE", null, {
      seasonId, matches: created.length, double: !!double, replaceScheduled: !!replaceScheduled,
    });

    return Response.json({ ok: true, created: created.length, rounds: byRound.size });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
