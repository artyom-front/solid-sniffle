// Milestone 3: жизненный цикл матча — валидации, события протокола,
// завершение, техпоражения (Epic 2), журнал аудита (инвариант №4).

import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { SessionUser } from "@/lib/auth";
import { assertNotSuspended, processMatchDiscipline, revertMatchDiscipline, autoYellowServedSnapshot, recomputeYellowAccrual } from "./discipline";
import { computeMatchState } from "./match-state";

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
  /** Номер из сезонной заявки (Registration) — у любителей обычно пуст */
  number: number | null;
  /** Роль в заявке (PLAYER/COACH/ADMINISTRATOR/…) — игроки vs штаб */
  regRole: string;
  /** Номер из ПОСЛЕДНЕГО матча этой команды до текущего — предзаполнение */
  lastNumber: number | null;
  /** true — заявка покрывает дату матча. false — заявка началась ПОЗЖЕ
   *  матча (ввод протокола задним числом): игрок виден с предупреждением,
   *  дата заявки правится одним кликом (v1.0.46) */
  registrationOk: boolean;
  /** id заявки (Registration) — для быстрой правки даты из протокола */
  registrationId: string | null;
  /** дата начала заявки — для подписи «заявлен …» */
  registrationStart: string | null;
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

/** Последние номера игроков команды: номер из последнего матча ДО даты —
 *  любительская практика: заявка на сезон без номеров, номер живёт в протоколе
 *  матча. Возвращает personId → номер (первое вхождение = самый свежий матч). */
export async function getLastNumbers(teamId: string, before: Date): Promise<Map<string, number>> {
  const rows = await db.lineupEntry.findMany({
    where: { teamId, number: { not: null }, match: { kickoff: { lt: before } } },
    orderBy: { match: { kickoff: "desc" } },
    select: { personId: true, number: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) if (!map.has(r.personId)) map.set(r.personId, r.number!);
  return map;
}

/** v1.0.46 · РАЗРЕШЕНИЕ ДУБЛЕЙ в списке протокола: одна персона = одна
 *  строка. Окна заявок могут ПЕРЕСЕКАТЬСЯ (трансфер: прежнюю не закрыли
 *  вовремя; аудит №9 — исторически две ACTIVE у одного игрока), а после
 *  снятия фильтра «startDate <= kickoff» (ввод задним числом) в выборку
 *  попадают и старая, и новая заявка — без дедупа игрок мелькал ДВАЖДЫ.
 *  Правило выбора на персону:
 *    1) заявка, ПОКРЫВАЮЩАЯ дату матча (startDate <= kickoff) — из них
 *       самая свежая (поздний startDate);
 *    2) если ни одна не покрывает — самая свежая (покажется с пометкой
 *       «заявлен после матча», дата правится из протокола). */
export function pickBestRegistrationPerPerson<T extends { personId: string; startDate: Date }>(
  regs: T[],
  kickoff: Date
): T[] {
  const best = new Map<string, T>();
  for (const r of regs) {
    const prev = best.get(r.personId);
    if (!prev) {
      best.set(r.personId, r);
      continue;
    }
    const covers = r.startDate.getTime() <= kickoff.getTime();
    const prevCovers = prev.startDate.getTime() <= kickoff.getTime();
    const better =
      covers !== prevCovers ? covers : r.startDate.getTime() > prev.startDate.getTime();
    if (better) best.set(r.personId, r);
  }
  return [...best.values()];
}

/** Список игроков, доступных для протокола, с флагами регистрации/дисквалификации.
 *  Товарищеский матч (без этапа): активные заявки команды в ЛЮБОМ сезоне —
 *  без дисциплинарных флагов (дисквалификации — скоуп турнира).
 *
 *  v1.0.46 · ЛУЧШАЯ ПРАКТИКА ВВОДА ЗАДНИМ ЧИСЛОМ: игрок, чья заявка началась
 *  ПОЗЖЕ даты матча, раньше ПРОСТА ИСЧЕЗАЛ из списка («создал Артемьева —
 *  его нет в протоколе»). Теперь он ВИДЕН с registrationOk=false — с
 *  пометкой «заявлен после матча»; дата заявки правится прямо из протокола
 *  (кнопка у строки / подтверждение при подаче состава). */
export async function getEligiblePlayers(matchId: string, teamId: string): Promise<EligiblePlayer[]> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { stage: { include: { season: true } } },
  });
  if (!match) throw new HttpError(404, "Матч не найден");

  // предзаполнение номеров: последний номер игрока в этой команде
  const lastNumbers = await getLastNumbers(teamId, match.kickoff);

  /** заявка → DTO с флагом покрытия даты матча */
  const toDTO = (r: { id: string; personId: string; startDate: Date; role: string; number: number | null; person: { lastName: string; firstName: string; position: string | null } }) => ({
    personId: r.personId,
    name: `${r.person.lastName} ${r.person.firstName}`,
    position: r.person.position,
    number: r.number,
    regRole: r.role,
    lastNumber: lastNumbers.get(r.personId) ?? null,
    registrationOk: r.startDate.getTime() <= match.kickoff.getTime(),
    registrationId: r.id,
    registrationStart: r.startDate.toISOString(),
  });

  if (!match.stage) {
    // товарищеский: заявки команды в ЛЮБОМ сезоне, покрывшие дату матча
    // (endDate null/позже матча). Дедуп — одна строка на персону.
    const regs = await db.registration.findMany({
      where: {
        teamId,
        OR: [{ endDate: null }, { endDate: { gte: match.kickoff } }],
      },
      include: { person: true, season: { select: { startDate: true } } },
    });
    const result: EligiblePlayer[] = [];
    for (const r of pickBestRegistrationPerPerson(regs, match.kickoff)) {
      result.push({ ...toDTO(r), suspension: null });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  // турнирный матч: заявки команды в СЕЗОНЕ этапа — активные (endDate null)
  // либо закрывшие дату матча; позднее начало помечается registrationOk=false
  const regs = await db.registration.findMany({
    where: {
      teamId,
      seasonId: match.stage.seasonId,
      OR: [{ endDate: null }, { endDate: { gte: match.kickoff } }],
    },
    include: { person: true },
  });

  const result: EligiblePlayer[] = [];
  for (const r of pickBestRegistrationPerPerson(regs, match.kickoff)) {
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
    result.push({ ...toDTO(r), suspension: active });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/**
 * Валидация события протокола (PRD + v1.0.19 + v1.0.52):
 * 1) матч не завершён; 2) участник — из ПРОТОКОЛА матча: если состав
 *    подан, автор (и ассистент) обязаны быть в LineupEntry; если состав
 *    ещё не подан — действует fallback-проверка заявки на дату матча;
 * 3) участник не дисквалифицирован (Epic 1, инвариант блокировки);
 * 4) v1.0.52 · СОСТОЯНИЕ МАТЧА (когда состав подан):
 *    • SUBSTITUTION — personId (вышедший) обязан быть ЗАПАСНЫМ, ещё не
 *      выходившим; assistPersonId (ушедший) — НА ПОЛЕ;
 *    • прочие события (гол/пенальти/автогол/карточки/VAR) — участник
 *      обязан быть НА ПОЛЕ (запасной не участвует, пока не вышел заменой).
 *
 * SUBSTITUTION: personId — вышедший на поле, assistPersonId — ушедший.
 * Параметр type опционален для совместимости: без него state-правила
 * применяются как для обычного события (на поле).
 */
export async function validateEvent(
  matchId: string,
  personId: string,
  teamId: string,
  assistPersonId?: string | null,
  type?: string | null
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

  const inLineup = async (pid: string): Promise<boolean> =>
    !!(await db.lineupEntry.findFirst({ where: { matchId, teamId, personId: pid } }));
  const lineupCount = await db.lineupEntry.count({ where: { matchId, teamId } });

  // Товарищеский матч (или без этапа): заявки на сезон нет, дисциплина
  // не применяется — но протокол обязан оставаться логичным (v1.0.44,
  // аудит №12): если состав подан, участник события должен быть в
  // LineupEntry. Раньше здесь был безусловный return — гол можно было
  // записать человеку, вообще не входящему в состав команды.
  if (!match.stage || match.isFriendly) {
    if (lineupCount > 0) {
      if (!(await inLineup(personId))) {
        throw new HttpError(409, "Игрок не внесён в протокол матча (состав уже подан). Добавьте игрока в состав на вкладке «Составы».");
      }
      if (assistPersonId && !(await inLineup(assistPersonId))) {
        throw new HttpError(409, "Автор ассиста не внесён в протокол матча (состав уже подан). Добавьте игрока в состав на вкладке «Составы».");
      }
    }
    await assertMatchStateRules(matchId, teamId, personId, assistPersonId ?? null, type ?? null);
    return match;
  }
  const seasonId = match.stage.seasonId;

  // Правило v1.0.19: в событии участвует только игрок, внесённый в протокол.
  // Пока состав не подан — проверяем заявку на дату матча (старое поведение).
  const checkMembership = async (pid: string, label: string): Promise<void> => {
    if (lineupCount > 0) {
      if (!(await inLineup(pid))) {
        throw new HttpError(409, `${label} не внесён в протокол матча (состав уже подан). Добавьте игрока в состав на вкладке «Составы».`);
      }
    } else {
      const registered = await isRegisteredOn(pid, teamId, seasonId, match.kickoff);
      if (!registered) {
        throw new HttpError(409, `${label} не заявлен за эту команду на дату матча. Подайте состав на вкладке «Составы» — туда попадают только заявленные игроки.`);
      }
    }
    await assertNotSuspended(pid, seasonId);
  };

  await checkMembership(personId, "Игрок");

  if (assistPersonId) {
    await checkMembership(assistPersonId, "Автор ассиста");
  }

  await assertMatchStateRules(matchId, teamId, personId, assistPersonId ?? null, type ?? null);

  return match;
}

/** v1.0.52 · Правила состояния матча: кто на поле / кто может выйти.
 *  Применяются ТОЛЬКО когда состав подан (иначе state неизвестен —
 *  работает fallback заявки). Ошибки — с именем игрока и причиной. */
async function assertMatchStateRules(
  matchId: string,
  teamId: string,
  personId: string,
  assistPersonId: string | null,
  type: string | null
) {
  const lineupRows = await db.lineupEntry.findMany({
    where: { matchId, teamId },
    select: { personId: true, isStarter: true },
  });
  if (lineupRows.length === 0) return; // состав не подан — легаси-fallback

  const subEvents = await db.matchEvent.findMany({
    where: { matchId, teamId, type: { in: ["SUBSTITUTION", "SUB_IN", "SUB_OUT"] } },
    select: { type: true, personId: true, assistPersonId: true },
  });
  const state = computeMatchState(lineupRows, subEvents);

  // имена для понятных ошибок (одним запросом на всех участников)
  const ids = [personId, ...(assistPersonId ? [assistPersonId] : [])];
  const persons = await db.person.findMany({
    where: { id: { in: ids } },
    select: { id: true, lastName: true, firstName: true },
  });
  const nameOf = (pid: string) => {
    const p = persons.find((x) => x.id === pid);
    return p ? `${p.lastName} ${p.firstName}`.trim() : "Игрок";
  };

  if (type === "SUBSTITUTION") {
    // вышедший (personId) — только запасной, ещё не выходивший
    if (state.onField.has(personId)) {
      throw new HttpError(409, `${nameOf(personId)} уже на поле — он не может выйти на замену. Замена: «Выходит на поле» — запасной, «Уходит» — игрок на поле.`);
    }
    if (!state.bench.has(personId)) {
      // не на поле, но и не в скамейке: уже выходил (и ушёл) — или не запас
      const inProtocol = lineupRows.some((l) => l.personId === personId);
      const reason = state.usedInSub.has(personId)
        ? "уже выходил на поле и покинул его — повторный выход запрещён"
        : inProtocol
          ? "не числится в запасе (стартовый состав)"
          : "не внесён в протокол матча";
      throw new HttpError(409, `${nameOf(personId)} не может выйти на замену: ${reason}.`);
    }
    // ушедший (assistPersonId) — только игрок на поле
    if (assistPersonId) {
      if (!state.onField.has(assistPersonId)) {
        const reason = state.usedInSub.has(assistPersonId)
          ? "уже покинул поле заменой и не может уйти повторно"
          : "не на поле (запасные не уходят — они входят)";
        throw new HttpError(409, `${nameOf(assistPersonId)} не может уйти с поля: ${reason}.`);
      }
    }
    return;
  }

  // прочие события: участник (и ассистент) — только НА ПОЛЕ
  const label = type === "GOAL" || type === "PENALTY" ? "Автор гола" : "Игрок";
  if (!state.onField.has(personId)) {
    const reason = state.bench.has(personId)
      ? "запасной — участвует только выйдя на замену"
      : state.usedInSub.has(personId)
        ? "уже покинул поле заменой"
        : "не на поле";
    throw new HttpError(409, `${label} ${nameOf(personId)} — ${reason}. Гол/карточка записывается только игроку на поле; запасной выходит через событие «Замена».`);
  }
  if (assistPersonId && !state.onField.has(assistPersonId)) {
    const reason = state.bench.has(assistPersonId)
      ? "запасной — участвует только выйдя на замену"
      : state.usedInSub.has(assistPersonId)
        ? "уже покинул поле заменой"
        : "не на поле";
    throw new HttpError(409, `Автор ассиста ${nameOf(assistPersonId)} — ${reason}.`);
  }
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

  // v1.0.24 (аудит Task 27 🟠-3): статус и дисциплинарные последствия —
  // ОДНА транзакция. Раньше сбой посередине оставлял матч COMPLETED без
  // дисциплинарной обработки (или наоборот). Внутри — повторная проверка
  // статуса: двойной complete из двух вкладок не задвоит отсиживание банов.
  await db.$transaction(async (tx) => {
    const fresh = await tx.match.findUnique({ where: { id: matchId }, select: { status: true } });
    if (!fresh) throw new HttpError(404, "Матч не найден");
    if (fresh.status === "COMPLETED") throw new HttpError(409, "Матч уже завершён");
    await tx.match.update({
      where: { id: matchId },
      data: { status: "COMPLETED", homeScore: score.home, awayScore: score.away },
    });

    // Дисциплинарная обработка (Epic 1): красные, ЖК-накопление, отсиживание.
    // Товарищеские матчи (без этапа) — БЕЗ дисциплинарных последствий.
    if (match.stageId) {
      await processMatchDiscipline(matchId, tx);
    }
  });

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

  // v1.0.24 (аудит Task 27 🟠-3): возврат в работу и откат дисциплины —
  // одна транзакция: сбой больше не оставляет SCHEDULED со stale-банами.
  await db.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: matchId },
      data: { status: "SCHEDULED", homeScore: null, awayScore: null, walkoverType: null },
    });
    if (match.stageId) {
      await revertMatchDiscipline(matchId, tx);
    }
  });
  await audit(user, "Match", matchId, "RESET", oldValue, { status: "SCHEDULED" });
}

/** Epic 2: назначение технического поражения */
export async function assignWalkover(matchId: string, walkoverType: "HOME" | "AWAY" | "BOTH", user: SessionUser | null, note?: string) {
  const match = await db.match.findUnique({ where: { id: matchId }, include: { events: true } });
  if (!match) throw new HttpError(404, "Матч не найден");
  if (match.status === "COMPLETED") throw new HttpError(409, "Матч уже сыгран — сначала верните его в работу");

  const oldValue = { status: match.status, walkoverType: match.walkoverType };

  // v1.0.24 (аудит Task 27 🟠-3): события/составы удаляются ТОЛЬКО вместе
  // со сменой статуса — единой транзакцией. Раньше сбой между deleteMany и
  // update оставлял матч без протокола, но ещё не WALKOVER (полу-состояние).
  await db.$transaction([
    db.matchEvent.deleteMany({ where: { matchId } }),
    db.lineupEntry.deleteMany({ where: { matchId } }),
    db.match.update({
      where: { id: matchId },
      data: { status: "WALKOVER", walkoverType, homeScore: null, awayScore: null, note: note ?? match.note },
    }),
  ]);

  await audit(user, "Match", matchId, "WO_ASSIGN", oldValue, { status: "WALKOVER", walkoverType, note });
}

// ============================================================
// v1.0.32 · УДАЛЕНИЕ МАТЧА С ПОЛНЫМ КАСКАДОМ (единая точка
// для одиночного и массового удаления).
//
// ПРАВИЛА (сформулированы владельцем, закреплены в ADMIN-GUIDE.md):
//   УДАЛЯЕТСЯ (детали матча): события (голы/карточки/замены), составы,
//     бригада, оценки судейства, файл протокола (Media), дисциплинарные
//     ПОСЛЕДСТВИЯ матча (авто-баны КК, накопление ЖК — пересчёт).
//   СОХРАНЯЕТСЯ (мастер-данные): игроки, команды, клубы, стадионы,
//     судьи, заявки на сезон (Registration) — они существуют вне матча.
//   Статистика (таблица/бомбардиры/дисциплина) считается движком на лету
//   из событий — удаление матча автоматически убирает его вклад.
// ============================================================

export interface MatchDeleteReport {
  events: number;
  lineups: number;
  ratings: number;
  officials: number;
  suspensionsDropped: number;
}

export async function deleteMatchCascade(matchId: string, user: SessionUser | null): Promise<MatchDeleteReport> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      stage: { select: { seasonId: true } },
      _count: { select: { events: true, lineups: true, ratings: true, officials: true } },
    },
  });
  if (!match) throw new HttpError(404, "Матч не найден");
  const seasonId = match.stage?.seasonId ?? null;

  let suspensionsDropped = 0;
  await db.$transaction(async (tx) => {
    if (seasonId) {
      // 1) авто-баны, порождённые этим матчем (КК → бан), — удалить
      const dropped = await tx.suspension.deleteMany({ where: { seasonId, triggeredByMatchId: matchId } });
      suspensionsDropped = dropped.count;
      // 2) снимок отсиженных авто-жёлтых (прогресс не теряем)
      const snapshot = await autoYellowServedSnapshot(seasonId, tx);
      // 3) сам матч — onDelete: Cascade уводит события/составы/бригаду/оценки
      await tx.match.delete({ where: { id: matchId } });
      // 4) пересчёт накопления ЖК по ОСТАВШИМСЯ завершённым матчам
      await tx.suspension.deleteMany({ where: { seasonId, source: "AUTO_YELLOW" } });
      await recomputeYellowAccrual(seasonId, tx, snapshot);
    } else {
      await tx.match.delete({ where: { id: matchId } });
    }
    // 5) файл протокола (Media) — деталь матча; ссылка «/api/media/<id>»
    if (match.protocolUrl) {
      const mediaId = match.protocolUrl.split("/").pop();
      if (mediaId) await tx.media.deleteMany({ where: { id: mediaId } });
    }
  });

  await audit(user, "Match", matchId, "DELETE", {
    kickoff: match.kickoff,
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
  }, { cascaded: true, ...match._count, suspensionsDropped });

  return { ...match._count, suspensionsDropped };
}
