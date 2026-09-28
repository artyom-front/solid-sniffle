// Публичный глобальный поиск: лиги, команды, персоны (игроки/судьи/тренеры), стадионы.
// v1.0.28 (аудит Task 27 🟡-4): rate-limit по IP (30/мин) — до запросов к БД;
// фильтрация contains-insensitive В БД + take — больше не грузим все строки
// 4 таблиц в память на каждый запрос. Точный мэтч «Фамилия Имя» и «Имя
// Фамилия» досевается в JS по короткой выборке (масштаб регионального
// портала — десятки, не тысячи).

import { db } from "@/lib/db";
import { FORMAT_LABELS } from "@/lib/labels";
import { clientIp, overRate, recordHit } from "@/lib/ratelimit";
import { caseVariants } from "@/lib/text";

const LIMIT_PER_MIN = 30;

export async function GET(req: Request) {
  // лимит ПЕРВЫМ: DoS-вектор закрывается до касания БД
  const ip = clientIp(req);
  if (overRate(`search:${ip}`, LIMIT_PER_MIN, 60_000)) {
    return Response.json(
      { error: "Слишком много поисковых запросов. Подождите минуту и попробуйте снова" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  recordHit(`search:${ip}`);

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const ql = q.toLowerCase();

  if (q.length < 2) {
    return Response.json({ leagues: [], teams: [], players: [], stadiums: [] });
  }

  // v1.0.34: вариантный поиск (грабля locale=C/SQL_ASCII: insensitive
  // не складывает кириллицу — публичный поиск по-русски не находил людей)
  const vars = caseVariants(q);
  const [leagues, teams, persons, stadiums] = await Promise.all([
    db.league.findMany({
      where: { OR: vars.flatMap((v) => [{ name: { contains: v } }, { shortName: { contains: v } }]) },
      select: { id: true, name: true, shortName: true, format: true },
      take: 12,
    }),
    db.team.findMany({
      where: { OR: vars.flatMap((v) => [{ name: { contains: v } }, { club: { name: { contains: v } } }]) },
      select: { id: true, name: true, city: true, club: { select: { name: true } } },
      take: 16,
    }),
    db.person.findMany({
      where: { OR: vars.flatMap((v) => [{ lastName: { contains: v } }, { firstName: { contains: v } }]) },
      select: { id: true, firstName: true, lastName: true, position: true, isReferee: true },
      take: 40,
    }),
    db.stadium.findMany({
      where: { OR: vars.flatMap((v) => [{ name: { contains: v } }, { city: { contains: v } }]) },
      select: { id: true, name: true, city: true },
      take: 12,
    }),
  ]);

  return Response.json({
    leagues: leagues
      .slice(0, 5)
      .map((l) => ({ id: l.id, label: l.name, sub: FORMAT_LABELS[l.format] ?? l.format })),
    teams: teams
      .slice(0, 6)
      .map((t) => ({ id: t.id, label: t.name, sub: [t.club?.name, t.city].filter(Boolean).join(", ") || "команда" })),
    players: persons
      .filter((p) =>
        `${p.lastName} ${p.firstName}`.toLowerCase().includes(ql) ||
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(ql)
      )
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        label: `${p.lastName} ${p.firstName}`,
        sub: p.isReferee ? "судья" : p.position === "GK" ? "вратарь" : "персона портала",
      })),
    stadiums: stadiums
      .slice(0, 4)
      .map((s) => ({ id: s.id, label: s.name, sub: s.city ?? "стадион" })),
  });
}

export const dynamic = "force-dynamic";
