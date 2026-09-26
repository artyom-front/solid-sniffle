// ============================================================
// Инвариант «нейтральные роли ≠ игрок» — проверки СЕЗОННОГО УРОВНЯ (с БД).
//
// Два уровня защиты:
//  1) КАРТОЧКА ПЕРСОНЫ (чистая проверка, без БД) — assertNoCardRoleConflict
//     в lib/roles.ts: роль «Игрок» несовместима с судейским корпусом
//     (REFEREE / ASSISTANT_REFEREE / FOURTH_OFFICIAL / VAR / AVAR /
//     INSPECTOR / DELEGATE) и с врачом.
//     Представитель команды может быть кем угодно ещё в своей группе
//     («играющий тренер») — это НЕ конфликт.
//  2) ЧЕМПИОНАТ+СЕЗОН (этот файл): участники судейской бригады матча
//     не могут иметь действующую заявку ИГРОКА в этом же сезоне, и
//     наоборот — заявку игрока нельзя оформить человеку, который уже
//     назначен в бригаду матчей сезона. Плюс конфликт интересов:
//     НИКАКАЯ заявка (включая тренерскую и врачебную) в командах-
//     участницах — нейтральное лицо не обслуживает матч своей команды.
//     Человек играет в лиге A и судит лигу B — это разные сезоны,
//     поэтому проверка скоупится конкретным seasonId.
//     Товарищеские матчи (без сезона) не проверяются — вне чемпионатов.
//
// Статистика при этом всегда раздельная: игрок — по событиям и составам
// (seasonPlayerStats), судья — по назначенным матчам (refereeStats),
// тренер — по заявкам COACH (см. services/profiles.ts). «Каша» исключена.
// ============================================================

import { HttpError } from "@/lib/http";
import type { Prisma } from "@prisma/client";

type Client = Prisma.TransactionClient;

/** Коды ролей, для которых действует полный запрет «не игрок в этом сезоне»
 *  (судейский корпус). Врач — только конфликт интересов с командами-участницами. */
export const STRICT_NEUTRAL_ROLE_CODES = new Set([
  "REFEREE", "ASSISTANT_REFEREE", "FOURTH_OFFICIAL", "VAR", "AVAR", "INSPECTOR", "DELEGATE",
]);

/** ---------- Уровень 2: чемпионат + сезон ---------- */

/**
 * Оформление заявки ИГРОКА (Registration.role=PLAYER):
 * человек не должен быть назначен в судейскую бригаду матчей этого сезона.
 */
export async function assertPlayerRegistrationAllowed(
  client: Client,
  personId: string,
  seasonId: string
): Promise<void> {
  const refMatches = await client.match.findMany({
    where: { refereeId: personId, stage: { seasonId } },
    select: { kickoff: true, stage: { select: { season: { select: { league: { select: { name: true } } } } } } },
    take: 3,
    orderBy: { kickoff: "desc" },
  });
  if (refMatches.length === 0) return;

  const total = await client.match.count({ where: { refereeId: personId, stage: { seasonId } } });
  const leagueName = refMatches[0].stage?.season.league.name ?? "чемпионат";
  throw new HttpError(
    409,
    `Нельзя заявить игроком: человек назначен судьёй на ${total} ${pluralMatches(total)} этого сезона (${leagueName}). ` +
      "Судья и игрок несовместимы в одном чемпионате. Он может играть в ДРУГОМ чемпионате — оформите заявку там."
  );
}

/**
 * Назначение в судейскую бригаду матча (судья/помощник/VAR/инспектор/делегат/врач):
 * • судейский корпус — не должен иметь заявку ИГРОКА в сезоне матча;
 • ЛЮБАЯ нейтральная роль (включая врача) — не должна иметь НИКАКОЙ
 *   заявки в командах-участницах: нейтральное лицо не обслуживает
 *   матч своей команды (конфликт интересов).
 * Товарищеский матч (seasonId=null) — вне чемпионатов, не проверяется.
 */
export async function assertRefereeAssignmentAllowed(
  client: Client,
  refereeId: string,
  seasonId: string | null,
  matchTeamIds: readonly string[] = [],
  role: string = "REFEREE"
): Promise<void> {
  if (!seasonId) return; // товарищеский матч — без чемпионата и сезона

  // Судейский корпус: полный запрет действующей заявки ИГРОКА в сезоне
  if (STRICT_NEUTRAL_ROLE_CODES.has(role)) {
    const reg = await client.registration.findFirst({
      where: {
        personId: refereeId,
        seasonId,
        role: "PLAYER",
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      include: { team: { select: { name: true } }, season: { select: { league: { select: { name: true } } } } },
    });
    if (reg) {
      throw new HttpError(
        409,
        `Нельзя назначить в бригаду: человек заявлен игроком за «${reg.team.name}» в этом сезоне (${reg.season.league.name}). ` +
          "Нейтральная роль и игрок несовместимы в одном чемпионате. Сначала закройте заявку игрока — или назначьте человека из другой лиги."
      );
    }
  }

  // Конфликт интересов: любая заявка (тренер/администратор/врач…) в команде-участнице
  if (matchTeamIds.length > 0) {
    const ownTeamReg = await client.registration.findFirst({
      where: {
        personId: refereeId,
        seasonId,
        teamId: { in: [...matchTeamIds] },
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      include: { team: { select: { name: true } } },
    });
    if (ownTeamReg) {
      const roleLabel =
        ownTeamReg.role === "COACH" ? "тренером" :
        ownTeamReg.role === "PLAYER" ? "игроком" : "в штабе";
      throw new HttpError(
        409,
        `Нельзя назначить в бригаду: человек заявлен ${roleLabel} за «${ownTeamReg.team.name}» — участника этого матча. ` +
          "Нейтральное лицо не может обслуживать матчи своей команды (даже как тренер). Назначьте независимого специалиста."
      );
    }
  }
}

/** Совместимое имя для мест, где проверяется только главный судья */
export const assertOfficialAssignmentAllowed = assertRefereeAssignmentAllowed;

/** Склонение «матч/матча/матчей» для сообщений */
function pluralMatches(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "матч";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "матча";
  return "матчей";
}
