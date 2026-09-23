// Публичный глобальный поиск: лиги, команды, персоны (игроки/судьи/тренеры), стадионы.
// Регистронезависимый фильтр в JS — единое поведение на любом движке БД (датасет мал).

import { db } from "@/lib/db";
import { FORMAT_LABELS } from "@/lib/labels";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();

  if (q.length < 2) {
    return Response.json({ leagues: [], teams: [], players: [], stadiums: [] });
  }

  const [leagues, teams, persons, stadiums] = await Promise.all([
    db.league.findMany({ select: { id: true, name: true, shortName: true, format: true } }),
    db.team.findMany({ select: { id: true, name: true, city: true, club: { select: { name: true } } } }),
    db.person.findMany({ select: { id: true, firstName: true, lastName: true, position: true, isReferee: true } }),
    db.stadium.findMany({ select: { id: true, name: true, city: true } }),
  ]);

  const match = (s: string) => s.toLowerCase().includes(q);

  return Response.json({
    leagues: leagues
      .filter((l) => match(l.name) || (l.shortName ?? "").toLowerCase().includes(q))
      .slice(0, 5)
      .map((l) => ({ id: l.id, label: l.name, sub: FORMAT_LABELS[l.format] ?? l.format })),
    teams: teams
      .filter((t) => match(t.name) || (t.club?.name ?? "").toLowerCase().includes(q))
      .slice(0, 6)
      .map((t) => ({ id: t.id, label: t.name, sub: [t.club?.name, t.city].filter(Boolean).join(", ") || "команда" })),
    players: persons
      .filter((p) => match(`${p.lastName} ${p.firstName}`) || match(`${p.firstName} ${p.lastName}`))
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        label: `${p.lastName} ${p.firstName}`,
        sub: p.isReferee ? "судья" : p.position === "GK" ? "вратарь" : "персона портала",
      })),
    stadiums: stadiums
      .filter((s) => match(s.name) || (s.city ?? "").toLowerCase().includes(q))
      .slice(0, 4)
      .map((s) => ({ id: s.id, label: s.name, sub: s.city ?? "стадион" })),
  });
}

export const dynamic = "force-dynamic";
