// ============================================================
// Регистронезависимый поиск по-русски на ЛЮБОЙ PostgreSQL.
//
// ГРАБЛЯ (найдена в v1.0.34): postgres:16-alpine без явных настроек
// создаёт БД с locale=C и encoding=SQL_ASCII. LOWER()/UPPER() в таком
// PostgreSQL складывают ТОЛЬКО ASCII — кириллица не меняется, поэтому
// Prisma mode:"insensitive" (который внутри генерирует LOWER(x) LIKE
// LOWER(y)) МОЛЧА не находит «мамонтов» в «Мамонтов». Симптом владельца:
// «вписываю в поиск — не находятся, поиск не работает».
//
// ЗОЛОТОЙ СТАНДАРТ здесь: сворачивать регистр НА СТОРОНЕ JS (движок V8
// умеет Unicode независимо от БД) и искать ПО ВАРИАНТАМ НАПИСАНИЯ:
// как ввёл пользователь, нижний, верхний, Капитализированный. LIKE по
// байтам сравнивает честно — регистр уже совпадает. Работает и на
// правильно настроенной UTF8-БД (варианты просто дублируются).
//
// Полное излечение на проде (опционально, см. ADMIN-GUIDE): пересоздать
// БД с --encoding=UTF8 (pg_dump → recreate → restore) — тогда заработают
// и штатные insensitive/ILIKE. Приложение от этого не зависит.
// ============================================================

/** Варианты написания строки: [как есть, нижний, ВЕРХНИЙ, Капитализованный]
 *  Дедуплицировано, пустые отброшены. */
export function caseVariants(q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLocaleLowerCase("ru");
  const upper = trimmed.toLocaleUpperCase("ru");
  const cap = capitalizeRu(lower);
  return [...new Set([trimmed, lower, upper, cap].filter(Boolean))];
}

/** «мамонтов виктор» → «Мамонтов Виктор» (первая буква каждого слова) */
export function capitalizeRu(s: string): string {
  return s
    .split(/(\s+)/)
    .map((w) => (/^\s+$/.test(w) ? w : w.charAt(0).toLocaleUpperCase("ru") + w.slice(1)))
    .join("");
}

import type { Prisma } from "@prisma/client";

// ============================================================
// Публичное отображение имени команды (фидбек владельца 2026-10-01):
// суффикс «№N» («Химик-НО №3») читателю непонятен — достаточно
// названия клуба. Санитайзер живёт на уровне DTO публичного API/SSR:
// все виджеты сайта получают чистое имя автоматически, а АДМИНКА
// продолжает видеть и редактировать реальные имена из БД.
// ============================================================

/** «Химик-НО №3» → «Химик-НО»; «Команда № 12» → «Команда».
 *  Убирает ТОЛЬКО хвостовой «№N» (с пробелами); если после чистки
 *  ничего не осталось (команда названа одним «№3») — имя как было. */
const TEAM_NO_SUFFIX = /\s*№\s*\d+\s*$/u;

export function displayTeamName(name: string): string {
  const clean = name.replace(TEAM_NO_SUFFIX, "").trim().replace(/[-–—]\s*$/u, "").trim();
  return clean || name;
}

/** WHERE-условие: поле содержит запрос в любом регистре (contains
 *  по вариантам). Применяется к строковым полям Person/Team/Club. */
export function containsCi(
  field: "lastName" | "firstName" | "middleName" | "name",
  q: string
): Prisma.PersonWhereInput | Prisma.TeamWhereInput | Prisma.ClubWhereInput {
  const variants = caseVariants(q);
  if (variants.length === 0) return {};
  // mode:"insensitive" оставлен сознательно: на UTF8-БД (прод после
  // пересоздания) он сработает сам; на locale=C не мешает вариантам
  const or: unknown[] = variants.flatMap((v) => [
    { [field]: { contains: v, mode: "insensitive" as const } },
  ]);
  return { OR: or } as Prisma.PersonWhereInput;
}

/** WHERE-условие: поле РАВНО строке в любом регистре (equals по вариантам
 *  — для проверок дублей «МАМОНТОВ Виктор» = «Мамонтов Виктор»). */
export function equalsCi(field: string, value: string): Record<string, unknown> {
  const variants = caseVariants(value);
  if (variants.length === 0) return {};
  return {
    OR: variants.map((v) => ({ [field]: { equals: v, mode: "insensitive" as const } })),
  };
}
