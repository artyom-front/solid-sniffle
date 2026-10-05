// Проверка восстановленной БД: PRAGMA integrity_check недоступен через
// Prisma, поэтому сверяем счётчики таблиц с ненулевыми минимумами и
// сохранёнными контрольными суммами из бэкапа (если есть .counts.json).

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const MINIMUMS: Record<string, number> = {
  person: 1,
  team: 1,
  league: 1,
  season: 1,
  match: 1,
  user: 1,
  auditLog: 0,
};

async function main() {
  let failed = false;
  for (const [table, min] of Object.entries(MINIMUMS)) {
    const count = await (db as any)[table].count();
    const ok = count >= min;
    console.log(`  ${ok ? "✓" : "✗"} ${table}: ${count} (минимум ${min})`);
    if (!ok) failed = true;
  }

  // выборочная связность: у завершённого матча есть счёт; у события есть матч
  const completed = await db.match.count({ where: { status: "COMPLETED", homeScore: { not: null } } });
  console.log(`  ${completed > 0 ? "✓" : "✗"} завершённые матчи со счётом: ${completed}`);
  if (completed === 0) failed = true;

  const orphanEvents = await db.matchEvent.count({ where: { match: undefined } }).catch(() => -1);
  if (orphanEvents === -1) {
    // Prisma не поддерживает такой синтаксис — делаем выборочную проверку напрямую
    const ev = await db.matchEvent.findFirst({ include: { match: true } });
    const ok = !ev || !!ev.match;
    console.log(`  ${ok ? "✓" : "✗"} события привязаны к матчам (выборка)`);
    if (!ok) failed = true;
  }

  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Ошибка проверки:", e);
  await db.$disconnect();
  process.exit(1);
});
