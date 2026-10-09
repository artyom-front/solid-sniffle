import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const name = (p) => `${p.lastName} ${p.firstName}`.trim();
async function main() {
  const allEvents = await prisma.matchEvent.findMany({ select: { id: true, matchId: true, type: true, minute: true, personId: true, teamId: true, assistPersonId: true } });
  console.log(`ALL EVENTS: ${allEvents.length}`);
  const ids = [...new Set(allEvents.flatMap(e => [e.personId, e.assistPersonId].filter(x => !!x)))];
  const people = await prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } });
  const pmap = Object.fromEntries(people.map(p => [p.id, name(p)]));
  for (const e of allEvents) console.log(`  [${e.matchId.slice(-6)}] ${e.type} ${e.minute}' p=${pmap[e.personId]||'?'} assist=${e.assistPersonId?(pmap[e.assistPersonId]||'?'):'-'}`);
  const matches = await prisma.match.findMany({ select: { id: true, status: true, homeGoals: true, awayGoals: true, isImportant: true, round: true } });
  console.log(`\nALL MATCHES: ${matches.length}`);
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const tmap = Object.fromEntries(teams.map(t => [t.id, t.name]));
  for (const m of matches) console.log(`  [${m.id.slice(-6)}] ${tmap[m.id]||''} status=${m.status} score=${m.homeGoals}-${m.awayGoals} round=${m.round} important=${m.isImportant}`);
  const art = await prisma.person.findMany({ where: { lastName: { contains: 'Артемьев' } }, select: { id: true, firstName: true, lastName: true } });
  console.log('\nАРТЕМЬЕВ:', JSON.stringify(art.map(a => ({ id: a.id, n: name(a) }))));
}
main().catch(e => console.error(String(e).slice(0, 500))).finally(() => prisma.$disconnect());
