import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const API = 'http://localhost:3000';
async function main() {
  // матч с известием isImportant — проверяем фид
  const day = await (await fetch(API + '/api/public/matches/day?date=all')).json();
  const m0 = day.leagues.flatMap(l => l.matches).find(m => m.signals.important.flag);
  console.log('FEED important:', m0 ? `${m0.homeTeam.name} vs ${m0.awayTeam.name} → ${m0.signals.important.reason}` : 'НЕ НАЙДЕН');

  // SUBSTITUTION-тест: возьмём завершённый матч со стартовым составом
  const match = await prisma.match.findFirst({
    where: { status: 'COMPLETED' },
    include: { lineups: true, events: true, stage: { include: { season: true } } },
  });
  const starter = match.lineups.find(l => l.isStarter);
  const bench = match.lineups.find(l => !l.isStarter);
  if (!starter || !bench) { console.log('нет старта/запаса для замены'); return; }
  const sub = await prisma.matchEvent.create({
    data: {
      matchId: match.id, minute: 40, type: 'SUBSTITUTION',
      personId: bench.personId, teamId: bench.teamId, assistPersonId: starter.personId,
    },
  });
  console.log('TEST-EVENT: SUBSTITUTION создан (вышел=' + bench.personId.slice(-4) + ', ушёл=' + starter.personId.slice(-4) + ') в матче ' + match.id.slice(-6));

  // ассисты сезона ДО/ПОСЛЕ: ушедший НЕ должен получить ассист
  const scorers = await (await fetch(API + `/api/public/scorers?seasonId=${match.stage.seasonId}`)).json();
  const assister = scorers.assisters.find(a => a.personId === starter.personId);
  console.log('УШЕДШИЙ в ассистентах:', assister ? 'НАЙДЕН (голов ' + assister.goals + ', ассистов ' + assister.assists + ')' : 'нет (ассист не начислен — ОК)');
  const inPlayer = scorers.assisters.find(a => a.personId === bench.personId);
  console.log('ВЫШЕДШИЙ в ассистентах:', inPlayer ? 'НАЙДЕН' : 'нет — ОК');

  // профиль ушедшего: события без isAssist-маскировки
  const prof = await (await fetch(API + `/api/public/players/${starter.personId}`)).json();
  const subEvents = prof.player.events.filter(e => e.type === 'SUBSTITUTION');
  console.log('ПРОФИЛЬ: SUBSTITUTION-событий у ушедшего:', subEvents.length, '| isAssist у них:', subEvents.map(e => e.isAssist).join(',') || '—');

  // 0-игровые команды в таблице: создадим сезон без матчей? — проверим пустой сезон через standings
  // (локальная база сырая; главное — API не падает)
  const standings = await (await fetch(API + `/api/public/standings?seasonId=${match.stage.seasonId}`)).json();
  console.log('STANDINGS: строк =', standings.standings.length, '| игр у первой =', standings.standings[0]?.games);

  // чистим тест-событие и снимаем important
  await prisma.matchEvent.delete({ where: { id: sub.id } });
  await prisma.match.update({ where: { id: match.id }, data: { isImportant: false } });
  console.log('CLEANUP: тест-событие удалено, isImportant снят');
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
