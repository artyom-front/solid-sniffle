import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // 1) пометить первый матч важным
  const seasons = await prisma.season.findMany({ select: { id: true, name: true } });
  const s = seasons[0];
  const matches = await prisma.match.findMany({ where: { stage: { seasonId: s.id } }, orderBy: { kickoff: 'asc' }, take: 3, select: { id: true, status: true } });
  const target = matches[0];
  await prisma.match.update({ where: { id: target.id }, data: { isImportant: true } });
  console.log('SMOKE1: isImportant=true на матче', target.id.slice(-6), target.status);

  // 2) сезон с заявками: сколько команд по заявкам vs по матчам
  for (const se of seasons) {
    const regTeams = await prisma.registration.findMany({ where: { seasonId: se.id, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] }, select: { teamId: true }, distinct: ['teamId'] });
    const ms = await prisma.match.findMany({ where: { stage: { seasonId: se.id } }, select: { homeTeamId: true, awayTeamId: true } });
    const matchTeams = new Set(ms.flatMap(m => [m.homeTeamId, m.awayTeamId]));
    const zeroGame = regTeams.filter(r => !matchTeams.has(r.teamId));
    console.log(`SMOKE2: сезон ${se.name.slice(0, 20)} — команд по заявкам: ${regTeams.length}, по матчам: ${matchTeams.size}, команд БЕЗ матчей: ${zeroGame.length}`);
  }

  // 3) SUBSTITUTION события с assistPersonId — кандидаты в фантомные ассисты
  const subs = await prisma.matchEvent.findMany({ where: { type: 'SUBSTITUTION', assistPersonId: { not: null } }, select: { id: true, matchId: true, assistPersonId: true } });
  console.log('SMOKE3: SUBSTITUTION с assistPersonId в БД:', subs.length);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
