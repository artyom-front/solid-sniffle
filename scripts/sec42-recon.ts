// Разведка дев-БД для SMOKE-SEC42: какие сущности есть для негативных RBAC-тестов
// Запуск: DATABASE_URL=... bun scripts/sec42-recon.ts (из корня проекта)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const leagues = await db.league.findMany({ select: { id: true, name: true, shortName: true } });
console.log("LEAGUES:", leagues.map((l) => `${l.id} ${l.shortName ?? l.name}`).join(" | "));

const seasons = await db.season.findMany({ select: { id: true, name: true, leagueId: true }, orderBy: { leagueId: "asc" } });
console.log("SEASONS:", seasons.map((s) => `${s.id} (${s.name}, league=${s.leagueId})`).join("\n  "));

const matches = await db.match.findMany({
  select: { id: true, status: true, homeTeamId: true, awayTeamId: true, stage: { select: { season: { select: { leagueId: true, name: true } } } } },
  take: 12,
});
console.log("MATCHES (12):");
for (const m of matches) console.log(`  ${m.id} ${m.status} league=${m.stage?.season.leagueId ?? "friendly"}`);

const clubs = await db.club.findMany({ select: { id: true, name: true } });
console.log("CLUBS:", clubs.map((c) => `${c.id} ${c.name}`).join(" | "));

const teams = await db.team.findMany({ select: { id: true, name: true, clubId: true }, take: 14 });
console.log("TEAMS (14):", teams.map((t) => `${t.id} ${t.name} club=${t.clubId}`).join("\n  "));

const users = await db.user.findMany({ select: { email: true, role: true, leagueId: true, clubId: true, personId: true, isActive: true } });
console.log("USERS:", users.map((u) => `${u.email} ${u.role} league=${u.leagueId} club=${u.clubId}`).join("\n  "));

const regs = await db.registration.findMany({ select: { id: true, personId: true, teamId: true, seasonId: true, team: { select: { clubId: true, name: true } } }, take: 10 });
console.log("REGISTRATIONS (10):");
for (const r of regs) console.log(`  ${r.id} person=${r.personId} team=${r.team.name} club=${r.team.clubId} season=${r.seasonId}`);

const susp = await db.suspension.findMany({ select: { id: true, seasonId: true, personId: true, isActive: true } });
console.log("SUSPENSIONS:", susp.map((s) => `${s.id} season=${s.seasonId} active=${s.isActive}`).join("\n  "));

await db.$disconnect();
