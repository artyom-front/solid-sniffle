// Epic 1: Дисциплинарный регламент (дисквалификации).
// Автоматика: КК → бан на N матчей; накопление ЖК (настраивается в лиге) → бан.
// Ручное управление: КДК (супер-админ) меняет срок/причину/пожизненно.
// Инвариант: активная Suspension блокирует ввод событий и заявок состава.

import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { Prisma } from "@prisma/client";

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
// v1.0.24: tx-параметр — функция исполняется внутри транзакции вызывающего
// (completeMatch/resetMatch), гарантируя атомарность «статус + дисциплина».
export async function processMatchDiscipline(matchId: string, tx: Prisma.TransactionClient = db) {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: {
      stage: { include: { season: { include: { league: true } } } },
      events: true,
    },
  });
  if (!match) return;
  // товарищеские матчи — вне дисциплинарной системы
  if (!match.stage) return;

  const seasonId = match.stage.seasonId;
  const league = match.stage.season.league;

  // ---- 1. Красные карточки этого матча → авто-бан ----
  const reds = match.events.filter((e) => e.type === "RED_CARD");
  for (const red of reds) {
    // не создаём дубль, если уже есть бан от этого события
    const existing = await tx.suspension.findFirst({
      where: { personId: red.personId, seasonId, source: "AUTO_RED", triggeredByMatchId: matchId },
    });
    if (existing) continue;
    await tx.suspension.create({
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
    const seasonEvents = await tx.matchEvent.findMany({
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
      const existing = await tx.suspension.count({
        where: { personId, seasonId, source: "AUTO_YELLOW" },
      });
      if (existing >= bansEarned) continue;
      const toCreate = bansEarned - existing;
      for (let i = 0; i < toCreate; i++) {
        await tx.suspension.create({
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
    // WO-матчи не отсиживаются: игроки в них не участвовали.
    // v1.0.28 (аудит Task 27 🟡-8): учитываются только ЗАЯВКИ, АКТИВНЫЕ
    // НА ДАТУ МАТЧА — закрытая заявка (игрок ушёл) не «отсиживает» матч
    // чужой для него команды, и перенос в середине сезона не даёт
    // двойного тика за один тур.
    const activeSuspensions = await tx.suspension.findMany({
      where: { seasonId, isActive: true, isLifetime: false },
      include: {
        person: {
          include: {
            registrations: {
              where: {
                seasonId,
                startDate: { lte: match.kickoff },
                OR: [{ endDate: null }, { endDate: { gte: match.kickoff } }],
              },
            },
          },
        },
      },
    });

    for (const s of activeSuspensions) {
      if (s.triggeredByMatchId === matchId) continue; // матч-источник не отсиживается
      const teamIds = s.person.registrations.map((r) => r.teamId);
      const played = teamIds.includes(match.homeTeamId) || teamIds.includes(match.awayTeamId);
      if (!played) continue;

      const served = s.matchesServed + 1;
      const done = served >= s.matchesTotal;
      await tx.suspension.update({
        where: { id: s.id },
        data: { matchesServed: served, isActive: !done },
      });
    }
  }
}

/** Сброс матча: деактивируем авто-баны, порождённые этим матчем (для reopen) */
export async function revertMatchDiscipline(matchId: string, tx: Prisma.TransactionClient = db) {
  const match = await tx.match.findUnique({ where: { id: matchId }, include: { stage: true } });
  if (!match || !match.stage) return;
  const seasonId = match.stage.seasonId;
  await tx.suspension.deleteMany({ where: { seasonId, triggeredByMatchId: matchId } });
  // v1.0.28 (аудит Task 27 🟡-7): снимок прогресса отсиживания ДО
  // пересоздания — reset матча (правка ЖК/событий) больше не обнуляет
  // отсиженные матчи по авто-жёлтым банам
  const servedSnapshot = await autoYellowServedSnapshot(seasonId, tx);
  // пересчитываем накопление ЖК (удалив/пересоздав авто-жёлтые баны)
  await tx.suspension.deleteMany({ where: { seasonId, source: "AUTO_YELLOW" } });
  await recomputeYellowAccrual(seasonId, tx, servedSnapshot);
}

/** v1.0.32 · Снимок отсиженных авто-жёлтых банов (сохранить прогресс при пересчёте) */
export async function autoYellowServedSnapshot(seasonId: string, tx: Prisma.TransactionClient = db): Promise<Map<string, number>> {
  const snapshot = new Map<string, number>();
  const autoYellows = await tx.suspension.findMany({
    where: { seasonId, source: "AUTO_YELLOW" },
    select: { personId: true, matchesServed: true },
  });
  for (const s of autoYellows) {
    const prev = snapshot.get(s.personId) ?? 0;
    if (s.matchesServed > prev) snapshot.set(s.personId, s.matchesServed);
  }
  return snapshot;
}

/** v1.0.32 · Пересчёт авто-жёлтых банов по ОСТАВШИМСЯ завершённым матчам сезона.
 *  Вызывается после Reset матча И после УДАЛЕНИЯ матча (его ЖК исчезают
 *  из накопления — статистика матча удаляется вместе с матчем). */
export async function recomputeYellowAccrual(seasonId: string, tx: Prisma.TransactionClient = db, servedSnapshot?: Map<string, number>) {
  const season = await tx.season.findUnique({ where: { id: seasonId }, include: { league: true } });
  if (!season || season.league.yellowCardLimit <= 0) return;
  const league = season.league;

  const seasonEvents = await tx.matchEvent.findMany({
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
    const existing = await tx.suspension.count({ where: { personId, seasonId, source: "AUTO_YELLOW" } });
    for (let i = existing; i < bansEarned; i++) {
      // отсиженный прогресс из снимка — с капом по сроку бана;
      // снятый кап = бан завершён → неактивен
      const served = Math.min(servedSnapshot?.get(personId) ?? 0, league.yellowCardBanMatches - 1);
      await tx.suspension.create({
        data: {
          personId,
          seasonId,
          source: "AUTO_YELLOW",
          reason: `Накопление ${league.yellowCardLimit} жёлтых карточек (автоматически по регламенту)`,
          matchesTotal: league.yellowCardBanMatches,
          matchesServed: served,
          isActive: served < league.yellowCardBanMatches,
        },
      });
    }
  }
}
