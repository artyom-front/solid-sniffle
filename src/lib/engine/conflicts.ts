// ============================================================
// Инвариант «судья ≠ игрок» — проверки СЕЗОННОГО УРОВНЯ (с БД).
//
// Два уровня защиты:
//  1) КАРТОЧКА ПЕРСОНЫ (чистая проверка, без БД) — assertNoCardRoleConflict
//     в lib/roles.ts: роль «Игрок» несовместима с судейским корпусом
//     (REFEREE / ASSISTANT_REFEREE / FOURTH_OFFICIAL / VAR / AVAR / INSPECTOR).
//     Игрок может быть тренером (играющий тренер), администратором,
//     президентом — это НЕ конфликт.
//  2) ЧЕМПИОНТ+СЕЗОН (этот файл): судья матча не может иметь действующую
//     заявку ИГРОКА в этом же сезоне, и наоборот — заявку игрока нельзя
//     оформить человеку, который уже назначен судьёй на матчи сезона.
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

/** ---------- Уровень 2: чемпионат + сезон ---------- */

/**
 * Оформление заявки ИГРОКА (Registration.role=PLAYER):
 * человек не должен быть назначен судьёй на матчи этого сезона.
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
    `Нельзя заявить игроком: человек назначен судььёй на ${total} ${pluralMatches(total)} этого сезона (${leagueName}). ` +
      "Судья и игрок несовместимы в одном чемпионате. Он может играть в ДРУГОМ чемпионате — оформите заявку там."
  );
}

/**
 * Назначение судьёй на матч: человек не должен иметь действующую
 * заявку ИГРОКА в сезоне, к которому относится матч, а также НИКАКОЙ
 * заявки (включая тренерскую) в командах-участницах — судья не может
 * обслуживать матч своей команды (конфликт интересов).
 * Товарищеский матч (seasonId=null) — вне чемпионатов, не проверяется.
 */
export async function assertRefereeAssignmentAllowed(
  client: Client,
  refereeId: string,
  seasonId: string | null,
  matchTeamIds: readonly string[] = []
): Promise<void> {
  if (!seasonId) return; // товарищеский матч — без чемпионата и сезона

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
      `Нельзя назначить судьёй: человек заявлен игроком за «${reg.team.name}» в этом сезоне (${reg.season.league.name}). ` +
        "Судья не может быть игроком в том же чемпионате. Сначала закройте заявку игрока — или назначьте судью из другой лиги."
    );
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
        `Нельзя назначить судьёй: человек заявлен ${roleLabel} за «${ownTeamReg.team.name}» — участника этого матча. ` +
          "Судья не может обслуживать матчи своей команды (даже как тренер). Назначьте независимого арбитра."
      );
    }
  }
}

/** Склонение «матч/матча/матчей» для сообщений */
function pluralMatches(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "матч";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "матча";
  return "матчей";
}
