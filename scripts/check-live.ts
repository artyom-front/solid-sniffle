import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const live = await db.match.findFirst({ where: { status: "LIVE" } });
if (!live) { console.log("нет LIVE"); process.exit(0); }
console.log("LIVE id:", live.id);
const r = await fetch(`http://localhost:3000/api/public/matches/${live.id}`);
const d = await r.json();
const m = d["match"];
console.log("матч:", m.homeTeam.name, "vs", m.awayTeam.name, "| статус:", m.status, "| тур:", m.round);
console.log("важность:", JSON.stringify(d.signals.important));
for (const side of ["home", "away"]) {
  const s = d.signals[side]; const ins = d.insights[side];
  console.log(`${side}: pos=${s.position} pts=${s.points} games=${s.games} streak=${JSON.stringify(s.streak)} scorerOut=${s.topScorerOut} newCoach=${s.newCoach ? s.newCoach.name : null}`);
  console.log(`  last5=${JSON.stringify(ins.last5)} rout=${JSON.stringify(ins.rout)} collapse=${JSON.stringify(ins.collapse)}`);
}
console.log("missing:", JSON.stringify(d.missing.map((x: any) => ({ team: x.teamId.slice(0, 8), entries: x.entries.map((e: any) => [e.name, e.kind, e.detail.slice(0, 50)]) }))));
console.log("h2h:", JSON.stringify(d.h2h.summary), "список:", d.h2h.list.length);
console.log("standings топ-3:", d.standings.slice(0, 3).map((x: any) => [x.position, x.teamName, x.points]));
console.log("events:", m.events.map((e: any) => `${e.minute}' ${e.type} ${e.person.name}${e.assist ? " (ассист " + e.assist.name + ")" : ""}`).join(" | "));
await db.$disconnect();
