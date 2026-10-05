// Проверка целостности PostgreSQL перед бэкапом (для backup-db.sh).
// v1.0.44 (аудит №19): до этого скрипт звал SQLite «PRAGMA
// integrity_check» — прод давно на PostgreSQL, и скрипт падал
// (или, хуже, кем-то не запускался вовсе). Эквивалент в PG:
//  - минимальная проверка движка/структуры через Prisma $queryRaw;
//  - счётчики ключевых таблиц (пустая база = подозрение);
//  - «зависшие» завершённые матчи без счёта (инвариант данных);
//  - pg дает целостность на уровне страниц сама (WAL/чек-суммы),
//    здесь — логические проверки приложения.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  let failed = false;

  // 1) БД отвечает и это PostgreSQL (SQLite-остатки недопустимы)
  const version = await db.$queryRawUnsafe("SELECT version() AS v") as { v: string }[];
  const isPg = /postgres/i.test(String(version?.[0]?.v ?? ""));
  console.log(isPg ? "✓ engine: PostgreSQL" : "✗ engine: НЕ PostgreSQL?!");
  if (!isPg) failed = true;

  // 2) ключевые таблицы не пустые (кроме журналов)
  const minimums: Record<string, number> = {
    person: 1, team: 1, league: 1, season: 1, match: 1, user: 1,
  };
  for (const [table, min] of Object.entries(minimums)) {
    const count = await (db as unknown as Record<string, { count(): Promise<number> }>)[table].count();
    const ok = count >= min;
    console.log(`${ok ? "✓" : "✗"} ${table}: ${count} (минимум ${min})`);
    if (!ok) failed = true;
  }

  // 3) завершённые матчи обязаны иметь счёт
  const noScore = await db.match.count({ where: { status: "COMPLETED", homeScore: null } });
  const okScore = noScore === 0;
  console.log(`${okScore ? "✓" : "✗"} завершённых матчей без счёта: ${noScore}`);
  if (!okScore) failed = true;

  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Проверка не выполнена:", e);
  await db.$disconnect();
  process.exit(1);
});
