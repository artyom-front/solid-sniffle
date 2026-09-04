// Epic 1: Дисциплинарный регламент (дисквалификации).
// Автоматика: КК → бан на N матчей; накопление ЖК (настраивается в лиге) → бан.
// Ручное управление: КДК (супер-админ) меняет срок/причину/пожизненно.
// Инвариант: активная Suspension блокирует ввод событий и заявок состава.

import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";

export interface SuspensionInfo {
  id: string;
  source: string;
  reason: string | null;
  matchesTotal: number;
  matchesServed: number;
  matchesRemaining: number;
  isLifetime: boolean;
}

/**
 * Инвариант блокировки (PRD Epic 1):
 * API не должен принимать MatchEvent или заявку состава, если на дату матча
 * у Person есть активная запись в Suspensions.
 */
export async function getActiveSuspension(personId: string, seasonId: string): Promise<SuspensionInfo | null> {
  const all = await db.suspension.findMany({
    where: { personId, seasonId, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  // Prisma не умеет сравнивать две колонки одной строки в where — фильтруем в памяти
  const s = all.find((x) => x.isLifetime || x.matchesServed < x.matchesTotal);
  if (!s) return null;
  return {
    id: s.id,
    source: s.source,
    reason: s.reason,
    matchesTotal: s.matchesTotal,
    matchesServed: s.matchesServed,
    matchesRemaining: s.isLifetime ? Infinity : Math.max(0, s.matchesTotal - s.matchesServed),
    isLifetime: s.isLifetime,
  };
}

/** Проверка перед добавлением события протокола / заявкой состава — бросает 409 */
export async function assertNotSuspended(personId: string, seasonId: string) {
  const s = await getActiveSuspension(personId, seasonId);
  if (s) {
    const term = s.isLifetime ? "пожизненная дисквалификация" : `осталось пропустить матчей: ${s.matchesRemaining}`;
    throw new HttpError(
      409,
      `Игрок дисквалифицирован (${sourceLabel(s.source)}${s.reason ? `, причина: «${s.reason}»` : ""}, ${term}). ` +
        `В соответствии с регламентом он не может быть задействован в матче.`
    );
  }
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "AUTO_RED": return "красная карточка";
    case "AUTO_YELLOW": return "накопление жёлтых карточек";
    case "MANUAL": return "решение КДК";
    default: return source;
  }
}

/**
 * Обработка завершившегося матча (шаг 2 жизненного цикла):
 * 1) красные карточки → автоматические дисквалификации;
 * 2) накопление ЖК в рамках сезона (исключая WO-матчи!) → бан;
 * 3) «отсиживание»: активные баны игроков, чьи команды сыграли, инкрементируются.
 */
export async function processMatchDiscipline(matchId: string) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      stage: { include: { season: { include: { league: true } } } },
      events: true,
    },
  });
  if (!match) return;

  const seasonId = match.stage.seasonId;
  const league = match.stage.season.league;

  // ---- 1. Красные карточки этого матча → авто-бан ----
  const reds = match.events.filter((e) => e.type === "RED_CARD");
  for (const red of reds) {
    // не создаём дубль, если уже есть бан от этого события
    const existing = await db.suspension.findFirst({
      where: { personId: red.personId, seasonId, source: "AUTO_RED", triggeredByMatchId: matchId },
    });
    if (existing) continue;
    await db.suspension.create({
      data: {
        personId: red.personId,
        seasonId,
        source: "AUTO_RED",
        reason: "Красная карточка (автоматически по регламенту)",
        matchesTotal: league.redCardBanMatches,
        triggeredByMatchId: matchId,
      },
    });
  }

  // ---- 2. Накопление ЖК (только сыгранные матчи сезона — WO не в счёт) ----
  if (league.yellowCardLimit > 0) {
    const seasonEvents = await db.matchEvent.findMany({
      where: {
        match: {
          status: "COMPLETED", // ← инвариант Epic 2: события WO-матчей не считаются
          stage: { seasonId },
        },
        type: "YELLOW_CARD",
      },
      select: { personId: true, createdAt: true },
    });

    const yellowsByPerson = new Map<string, number>();
    for (const e of seasonEvents) {
      yellowsByPerson.set(e.personId, (yellowsByPerson.get(e.personId) ?? 0) + 1);
    }

    for (const [personId, total] of yellowsByPerson) {
      // каждые N ЖК → один бан на league.yellowCardBanMatches матчей
      const bansEarned = Math.floor(total / league.yellowCardLimit);
      if (bansEarned <= 0) continue;
      const existing = await db.suspension.count({
        where: { personId, seasonId, source: "AUTO_YELLOW" },
      });
      if (existing >= bansEarned) continue;
      const toCreate = bansEarned - existing;
      for (let i = 0; i < toCreate; i++) {
        await db.suspension.create({
          data: {
            personId,
            seasonId,
            source: "AUTO_YELLOW",
            reason: `Накопление ${league.yellowCardLimit} жёлтых карточек (автоматически по регламенту)`,
            matchesTotal: league.yellowCardBanMatches,
            // бан начинает отсчёд со СЛЕДУЮЩЕГО матча — текущий не отсиживается
            triggeredByMatchId: matchId,
          },
        });
      }
    }
  }

  // ---- 3. Отсиживание банов: матч сыграли команды игрока ----
  if (match.status === "COMPLETED") {
    // WO-матчи не отсиживаются: игроки в них не участвовали
    const activeSuspensions = await db.suspension.findMany({
      where: { seasonId, isActive: true, isLifetime: false },
      include: { person: { include: { registrations: { where: { seasonId } } } } },
    });

    for (const s of activeSuspensions) {
      if (s.triggeredByMatchId === matchId) continue; // матч-источник не отсиживается
      const teamIds = s.person.registrations.map((r) => r.teamId);
      const played = teamIds.includes(match.homeTeamId) || teamIds.includes(match.awayTeamId);
      if (!played) continue;

      const served = s.matchesServed + 1;
      const done = served >= s.matchesTotal;
      await db.suspension.update({
        where: { id: s.id },
        data: { matchesServed: served, isActive: !done },
      });
    }
  }
}

/** Сброс матча: деактивируем авто-баны, порождённые этим матчем (для reopen) */
export async function revertMatchDiscipline(matchId: string) {
  const match = await db.match.findUnique({ where: { id: matchId }, include: { stage: true } });
  if (!match) return;
  const reds = await db.suspension.findMany({
    where: { seasonId: match.stage.seasonId, triggeredByMatchId: matchId },
  });
  for (const s of reds) {
    await db.suspension.delete({ where: { id: s.id } });
  }
  // пересчитываем накопление ЖК (удалив/пересоздав авто-желтые баны)
  await db.suspension.deleteMany({ where: { seasonId: match.stage.seasonId, source: "AUTO_YELLOW" } });
  await processYellowAccrual(match.stage.seasonId);
}

async function processYellowAccrual(seasonId: string) {
  const season = await db.season.findUnique({ where: { id: seasonId }, include: { league: true } });
  if (!season || season.league.yellowCardLimit <= 0) return;
  const league = season.league;

  const seasonEvents = await db.matchEvent.findMany({
    where: {
      match: { status: "COMPLETED", stage: { seasonId } },
      type: "YELLOW_CARD",
    },
    select: { personId: true },
  });
  const yellowsByPerson = new Map<string, number>();
  for (const e of seasonEvents) yellowsByPerson.set(e.personId, (yellowsByPerson.get(e.personId) ?? 0) + 1);

  for (const [personId, total] of yellowsByPerson) {
    const bansEarned = Math.floor(total / league.yellowCardLimit);
    if (bansEarned <= 0) continue;
    const existing = await db.suspension.count({ where: { personId, seasonId, source: "AUTO_YELLOW" } });
    for (let i = existing; i < bansEarned; i++) {
      await db.suspension.create({
        data: {
          personId,
          seasonId,
          source: "AUTO_YELLOW",
          reason: `Накопление ${league.yellowCardLimit} жёлтых карточек (автоматически по регламенту)`,
          matchesTotal: league.yellowCardBanMatches,
        },
      });
    }
  }
}
