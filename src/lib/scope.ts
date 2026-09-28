// ============================================================
// v1.0.32 · Скоупы доступа LEAGUE_ADMIN (админ конкретной лиги).
//
// Модель доверия (полная матрица — в ADMIN-GUIDE.md):
//   SUPER_ADMIN          — весь сайт, все лиги, пользователи, контент
//   LEAGUE_ADMIN (null)  — оператор турнирного ядра: все лиги,
//                          справочники, протоколы (как было до v1.0.32)
//   LEAGUE_ADMIN (лига)  — ТОЛЬКО своя лига: сезоны, матчи, протоколы,
//                          заявки, КДК, расписание. Товарищеские матчи,
//                          контент сайта и пользователи — недоступны
//   CLUB_ADMIN (клуб)    — свой клуб: команды, заявки, импорт состава
//   REFEREE (персона)    — протоколы только назначенных ему матчей
//
// Гвард ниже — единая точка проверки для API: кидает 403 «Матч/операция
// вне вашей лиги». SUPER_ADMIN и LEAGUE_ADMIN без скоупа проходят всегда.
// Вызывается ДО мутаций, чтобы заблокировать и чтение, и запись.
// ============================================================

import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { SessionUser } from "@/lib/auth";

const OUT_OF_SCOPE = "Операция вне вашей лиги: попросите супер-администратора расширить доступ";

/** Ограничен ли пользователь одной лигой (true = нужно проверять каждый запрос) */
export function isLeagueScoped(user: SessionUser): boolean {
  return user.role === "LEAGUE_ADMIN" && user.leagueId !== null;
}

/** Сезон входит в скоуп пользователя? (null-сезон = товарищеские — вне скоупа) */
export async function assertSeasonInScope(user: SessionUser, seasonId: string | null | undefined): Promise<void> {
  if (!isLeagueScoped(user)) return;
  if (!seasonId) throw new HttpError(403, OUT_OF_SCOPE);
  const season = await db.season.findUnique({ where: { id: seasonId }, select: { leagueId: true } });
  if (!season || season.leagueId !== user.leagueId) throw new HttpError(403, OUT_OF_SCOPE);
}

/** Матч входит в скоуп пользователя? (товарищеские — вне скоупа лиги) */
export async function assertMatchInScope(user: SessionUser, matchId: string): Promise<void> {
  if (!isLeagueScoped(user)) return;
  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { stage: { select: { season: { select: { leagueId: true } } } } },
  });
  const leagueId = match?.stage?.season.leagueId ?? null;
  if (leagueId !== user.leagueId) throw new HttpError(403, OUT_OF_SCOPE);
}

/** Товарищеские матчи для скоуп-админа: создавать/удалять нельзя (они вне лиг) */
export function assertCanTouchFriendly(user: SessionUser): void {
  if (isLeagueScoped(user)) throw new HttpError(403, "Товарищеские матчи ведёт оператор сайта или супер-администратор");
}
