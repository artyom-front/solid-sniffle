// v1.0.34: проверка данных после миграции 05 (нормализация корпуса)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const NARROW = ["ASSISTANT_REFEREE", "FOURTH_OFFICIAL", "VAR", "AVAR", "INSPECTOR", "DELEGATE"];

const [
  narrowOnCards,
  isrefNoRole,
  roleNoFlag,
  total,
  captains,
  rolesSamples,
] = await Promise.all([
  db.person.count({ where: { roles: { hasSome: NARROW } } }),
  db.person.count({ where: { isReferee: true, NOT: { roles: { has: "REFEREE" } } } }),
  db.person.count({ where: { isReferee: false, roles: { has: "REFEREE" } } }),
  db.person.count(),
  db.lineupEntry.count({ where: { isCaptain: true } }),
  db.person.findMany({ where: { isReferee: true }, select: { lastName: true, firstName: true, roles: true }, take: 3 }),
]);

console.log("узкие должности на карточках (должно быть 0):", narrowOnCards);
console.log("isReferee=true без роли REFEREE (должно быть 0):", isrefNoRole);
console.log("REFEREE без флага (должно быть 0):", roleNoFlag);
console.log("всего персон:", total);
console.log("LineupEntry.isCaptain доступен, капитанов:", captains);
console.log("пример судей:", rolesSamples);
await db.$disconnect();
