import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const name = (p) => `${p.lastName} ${p.firstName}`.trim();
async function main() {
  // Демьян anywhere?
  const dem = await prisma.person.findMany({ where: { OR: [{ firstName: { contains: 'Демьян' } }, { lastName: { contains: 'Демьян' } }] }, select: { id: true, firstName: true, lastName: true, roles: true } });
  console.log('ДЕМЬЯН persons:', JSON.stringify(dem.map(d => ({ id: d.id, n: name(d), roles: d.roles }))));
  // events of Демьян
  for (const d of dem) {
    const ev = await prisma.matchEvent.findMany({ where: { OR: [{ personId: d.id }, { assistPersonId: d.id }] } });
    console.log(`events of ${name(d)}: ${ev.length}`);
  }
  // all Артемьев
  const arts = await prisma.person.findMany({ where: { lastName: { contains: 'Артемьев' } }, select: { id: true, firstName: true, lastName: true } });
  console.log('АРТЕМЬЕВ all:', JSON.stringify(arts.map(a => ({ id: a.id, n: name(a) }))));
  // matches with their stage/season/league
  const matches = await prisma.match.findMany({ select: { id: true, status: true, homeScore: true, awayScore: true, isImportant: true, round: true, isFriendly: true, homeTeamId: true, awayTeamId: true, stageId: true, kickoff: true } });
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const tmap = Object.fromEntries(teams.map(t => [t.id, t.name]));
  const stages = await prisma.stage.findMany({ select: { id: true, name: true, seasonId: true } });
  const smap = Object.fromEntries(stages.map(s => [s.id, s]));
  const seasons = await prisma.season.findMany({ select: { id: true, name: true, leagueId: true } });
  const seasonmap = Object.fromEntries(seasons.map(s => [s.id, s]));
  const leagues = await prisma.league.findMany({ select: { id: true, name: true } });
  const lmap = Object.fromEntries(leagues.map(l => [l.id, l.name]));
  for (const m of matches) {
    const st = smap[m.stageId]; const se = st ? seasonmap[st.seasonId] : null;
    console.log(`  [${m.id.slice(-6)}] ${tmap[m.homeTeamId]||'?'} vs ${tmap[m.awayTeamId]||'?'} status=${m.status} ${m.homeScore??'-'}:${m.awayScore??'-'} rnd=${m.round} imp=${m.isImportant} | league=${se?lmap[se.leagueId]:'?'} (${se?.name}) kickoff=${m.kickoff?.toISOString?.().slice(0,16)}`);
  }
  console.log('\nLEAGUES:', JSON.stringify(lmap));
}
main().catch(e => console.error(String(e).slice(0, 800))).finally(() => prisma.$disconnect());
