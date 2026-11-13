// Тест: игрок с 5+ значками событий в составе (проверка анти-коллапса
// имени v1.0.40). Добавляем события Денисову Кириллу в тестовый матч.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const MATCH_ID = "cmupfoukk00r3qcw4vcuvmrsa";

async function main() {
  const match = await db.match.findUnique({ where: { id: MATCH_ID }, include: { homeTeam: true, awayTeam: true } });
  if (!match) throw new Error("no match");
  // Денисов Кирилл — уже есть событие 79'; найдём его id и teamId
  const any = await db.matchEvent.findFirst({ where: { matchId: MATCH_ID, person: { is: { lastName: "Денисов" } } }, include: { person: true } });
  if (!any) throw new Error("no person");
  const pid = any.personId;
  const tid = any.teamId;
  console.log("person:", any.person.lastName, any.person.firstName, "team:", tid);
  const add = [
    { minute: 12, type: "GOAL" },
    { minute: 34, type: "YELLOW_CARD" },
    { minute: 38, type: "GOAL" },
    { minute: 55, type: "YELLOW_CARD" },
  ];
  for (const a of add) {
    await db.matchEvent.create({
      data: { matchId: MATCH_ID, personId: pid, teamId: tid, minute: a.minute, type: a.type },
    });
  }
  console.log("added", add.length, "events; total for player now 5");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
