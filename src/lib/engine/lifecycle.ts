// Milestone 3: жизненный цикл матча — валидации, события протокола,
// завершение, техпоражения (Epic 2), журнал аудита (инвариант №4).

import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { SessionUser } from "@/lib/auth";
import { assertNotSuspended, processMatchDiscipline, revertMatchDiscipline } from "./discipline";

// ---------- Аудит (инвариант №4) ----------

export async function audit(
  user: SessionUser | null,
  entity: string,
  entityId: string,
  action: string,
  oldValue: unknown,
  newValue: unknown
) {
  await db.auditLog.create({
    data: {
      userId: user?.id ?? null,
      userEmail: user?.email ?? "system",
      entity,
      entityId,
      action,
      oldValue: oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue: newValue === undefined ? null : JSON.stringify(newValue),
    },
  });
}

// ---------- Валидации ----------

export interface EligiblePlayer {
  personId: string;
  name: string;
  position: string | null;
  number: number | null;
  registrationOk: boolean;
  suspension: { matchesRemaining: number; isLifetime: boolean; source: string } | null;
}

/**
 * Epic 3 (валидация заявки): игрок активно заявлен за команду именно на дату матча
 * (учёт дат регистрации и трансферов).
 */
export async function isRegisteredOn(personId: string, teamId: string, seasonId: string, date: Date): Promise<boolean> {
  const reg = await db.registration.findFirst({
    where: {
      personId,
      teamId,
      seasonId,
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    },
  });
  return !!reg;
}

/** Список игроков, доступных для протокола, с флагами регистрации/дисквалификации */
export async function getEligiblePlayers(matchId: string, teamId: string): Promise<EligiblePlayer[]> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { stage: { include: { season: true } } },
  });
  if (!match) throw new HttpError(404, "Матч не найден");

  const regs = await db.registration.findMany({
    where: {
      teamId,
      seasonId: match.stage.seasonId,
      startDate: { lte: match.kickoff },
      OR: [{ endDate: null }, { endDate: { gte: match.kickoff } }],
    },
    include: { person: true },
  });

  const result: EligiblePlayer[] = [];
  for (const r of regs) {
    const suspension = await db.suspension.findFirst({
      where: { personId: r.personId, seasonId: match.stage.seasonId, isActive: true },
    });
    const active =
      suspension && (suspension.isLifetime || suspension.matchesServed < suspension.matchesTotal)
        ? {
            matchesRemaining: suspension.isLifetime ? -1 : suspension.matchesTotal - suspension.matchesServed,
            isLifetime: suspension.isLifetime,
            source: suspension.source,
          }
        : null;
    result.push({
      personId: r.personId,
      name: `${r.person.lastName} ${r.person.firstName}`,
      position: r.person.position,
      number: r.number,
      registrationOk: true,
      suspension: active,
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/**
 * Валидация события протокола (PRD):
 * 1) матч не завершён; 2) игрок заявлен за команду на дату матча;
 * 3) игрок не дисквалифицирован (Epic 1, инвариант блокировки).
 */
export async function validateEvent(
  matchId: string,
  personId: string,
  teamId: string,
  assistPersonId?: string | null
) {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { stage: { include: { season: true } } },
  });
  if (!match) throw new HttpError(404, "Матч не найден");
  if (match.status === "COMPLETED") throw new HttpError(409, "Матч уже завершён — редактирование запрещено");
  if (match.status === "WALKOVER") throw new HttpError(409, "Матч оформлен как техническое поражение — события недоступны");
  if (teamId !== match.homeTeamId && teamId !== match.awayTeamId) {
    throw new HttpError(422, "Команда не участвует в этом матче");
  }

  const registered = await isRegisteredOn(personId, teamId, match.stage.seasonId, match.kickoff);
  if (!registered) {
    throw new HttpError(409, "Игрок не заявлен за эту команду на дату матча (проверьте Registration и трансферное окно)");
  }

  await assertNotSuspended(personId, match.stage.seasonId);

  if (assistPersonId) {
    const assistRegistered = await isRegisteredOn(assistPersonId, teamId, match.stage.seasonId, match.kickoff);
    if (!assistRegistered) throw new HttpError(422, "Автор ассиста не заявлен за эту команду на дату матча");
    await assertNotSuspended(assistPersonId, match.stage.seasonId);
  }

  return match;
}

// ---------- Счёт ----------

/** Гол с поля и пенальти — в пользу команды события; автогол — В ПОЛЬЗУ СОПЕРНИКА */
export async function computeScore(matchId: string): Promise<{ home: number; away: number }> {
  const events = await db.matchEvent.findMany({ where: { matchId } });
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) return { home: 0, away: 0 };
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (e.type !== "GOAL" && e.type !== "PENALTY" && e.type !== "OWN_GOAL") continue;
    const forHome = e.teamId === match.homeTeamId;
    const own = e.type === "OWN_GOAL";
    // автогол игрока команды X засчитывается сопернику
    if ((forHome && !own) || (!forHome && own)) home++;
    else away++;
  }
  return { home, away };
}

// ---------- Завершение матча ----------

export async function completeMatch(matchId: string, user: SessionUser | null) {
  const match = await db.match.findUnique({ where: { id: matchId }, include: { events: true } });
  if (!match) throw new HttpError(404, "Матч не найден");
  if (match.status === "COMPLETED") throw new HttpError(409, "Матч уже завершён");

  // Инвариант (PRD §4): матч не может быть завершён без назначенного главного судьи
  if (!match.refereeId) {
    throw new HttpError(422, "Матч не может быть завершён без назначенного главного судьи");
  }

  const score = await computeScore(matchId);

  const oldValue = {
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
  };

  await db.match.update({
    where: { id: matchId },
    data: { status: "COMPLETED", homeScore: score.home, awayScore: score.away },
  });

  // Дисциплинарная обработка (Epic 1): красные, ЖК-накопление, отсиживание
  await processMatchDiscipline(matchId);

  // Инвариант №3 (Event-Driven): в проде здесь публикация события в BullMQ
  // (пересчёт таблиц, генерация карточек, рассылка). В демо пересчёт ленивый — при чтении.
  await audit(user, "Match", matchId, "COMPLETE", oldValue, {
    status: "COMPLETED",
    ...score,
    eventsCount: match.events.length,
  });

  return score;
}

/** Reopen: вернуть матч в работу (только супер-админ, с откатом дисциплинарных последствий) */
export async function resetMatch(matchId: string, user: SessionUser | null) {
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) throw new HttpError(404, "Матч не найден");
  const oldValue = { status: match.status, homeScore: match.homeScore, awayScore: match.awayScore, walkoverType: match.walkoverType };

  await db.match.update({
    where: { id: matchId },
    data: { status: "SCHEDULED", homeScore: null, awayScore: null, walkoverType: null },
  });
  await revertMatchDiscipline(matchId);
  await audit(user, "Match", matchId, "RESET", oldValue, { status: "SCHEDULED" });
}

/** Epic 2: назначение технического поражения */
export async function assignWalkover(matchId: string, walkoverType: "HOME" | "AWAY" | "BOTH", user: SessionUser | null, note?: string) {
  const match = await db.match.findUnique({ where: { id: matchId }, include: { events: true } });
  if (!match) throw new HttpError(404, "Матч не найден");
  if (match.status === "COMPLETED") throw new HttpError(409, "Матч уже сыгран — сначала верните его в работу");

  const oldValue = { status: match.status, walkoverType: match.walkoverType };

  // WO-матч не игрался: события и составы неактуальны
  await db.matchEvent.deleteMany({ where: { matchId } });
  await db.lineupEntry.deleteMany({ where: { matchId } });

  await db.match.update({
    where: { id: matchId },
    data: { status: "WALKOVER", walkoverType, homeScore: null, awayScore: null, note: note ?? match.note },
  });

  await audit(user, "Match", matchId, "WO_ASSIGN", oldValue, { status: "WALKOVER", walkoverType, note });
}
