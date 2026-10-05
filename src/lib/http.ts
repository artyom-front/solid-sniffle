// HTTP-ошибки доменного слоя (не зависят от next/headers — используются и в seed)

import { Prisma } from "@prisma/client";

export class HttpError extends Error {
  status: number;
  /** Машиночитаемая полезная нагрузка ошибки (код, счётчики зависимостей) —
   *  отдаётся в JSON рядом с error, чтобы UI мог предложить действие
   *  (каскадное удаление, переход к карточке) вместо тупика «нельзя удалить». */
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Человекочитаемая расшифровка целей P2002 (unique-конфликты) для частых сценариев.
 *  Список целей дополнялся по мере роста схемы; для прочих — универсальная формулировка. */
const P2002_HINTS: Record<string, string> = {
  User_email_key: "Пользователь с таким email уже существует",
  Person: "Персона с такими данными уже существует",
  Registration_active_person_team_season_key:
    "Игрок уже активно заявлен за эту команду в этом сезоне",
  MatchOfficial_matchId_personId_role_key:
    "Этот человек уже назначен на эту роль в матче",
  LineupEntry_matchId_personId_key: "Игрок уже в заявке на этот матч",
  RefereeRating_matchId_authorUserId_key: "Вы уже оценили судью этого матча",
};

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message, ...(e.extra ?? {}) }, { status: e.status });
  }
  // P2002 (unique violation) — конфликт данных, а не сбой сервера:
  // гонки и редкие пути (например, две одновременно созданные заявки) не должны
  // отдавать голый 500. Указатель цели у Prisma приходит в meta.target.
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = (e.meta?.target as string[] | string | undefined) ?? [];
    const key = Array.isArray(target) ? target.join("_") : String(target);
    const hint = P2002_HINTS[key] ?? P2002_HINTS[String(target)];
    console.warn("[api] P2002 unique conflict:", key);
    return Response.json(
      { error: hint ?? "Запись с таким уникальным значением уже существует", code: "DUPLICATE" },
      { status: 409 }
    );
  }
  console.error("[api]", e);
  return Response.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
}
