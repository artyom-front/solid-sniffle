import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const API = 'http://localhost:3000';
async function main() {
  // Создаём тест-сезон без матчей + 2 заявки
  const league = await prisma.league.findFirst();
  const teams = await prisma.team.findMany({ take: 2 });
  const stage = await prisma.season.create({
    data: {
      leagueId: league.id, name: 'SMOKE54-пре-сезон',
      startDate: new Date('2026-10-01'), endDate: null, isCurrent: false,
    },
  });
  const st = await prisma.stage.create({ data: { seasonId: stage.id, name: 'Регулярный чемпионат', type: 'ROUND_ROBIN' } });
  const person = await prisma.person.findFirst();
  const regs = [];
  for (const t of teams) {
    regs.push(await prisma.registration.create({
      data: { personId: person.id, teamId: t.id, seasonId: stage.id, startDate: new Date('2026-10-01'), role: 'PLAYER' },
    }));
  }
  const stRes = await (await fetch(API + `/api/public/standings?seasonId=${stage.id}`)).json();
  console.log('ПРЕДВАРИТЕЛЬНАЯ ТАБЛИЦА (0 матчей): команд =', stRes.standings.length);
  for (const r of stRes.standings) console.log(`  ${r.position}. ${r.teamName} — И${r.games} О${r.points} МФ${r.goalsFor}-${r.goalsAgainst}`);

  // страницы рендерятся
  const match = await prisma.match.findFirst({ where: { status: 'COMPLETED' } });
  for (const path of ['/', `/match/${match.id}`, `/player/${person.id}`, '/league/' + league.id]) {
    const res = await fetch(API + path);
    console.log('PAGE', path, '→', res.status);
  }

  // чистим
  await prisma.registration.deleteMany({ where: { id: { in: regs.map(r => r.id) } } });
  await prisma.stage.delete({ where: { id: st.id } });
  await prisma.season.delete({ where: { id: stage.id } });
  console.log('CLEANUP: тест-сезон удалён');
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
