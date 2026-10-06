// ============================================================
// export-data.ts — выгрузка всех таблиц SQLite (демо/пром-старта)
// в JSON для переноса в PostgreSQL (scripts/import-data-pg.mjs).
//
// Запуск: bun scripts/export-data.ts
// Результат: prisma/export/data.json
// ============================================================

import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";

const db = new PrismaClient();

// порядок важен только для читаемости; импорт сам соблюдает FK
const TABLES = [
  "sportFormat",
  "ageGroup",
  "person",
  "user",
  "club",
  "team",
  "stadium",
  "league",
  "season",
  "stage",
  "match",
  "matchEvent",
  "matchOfficial",
  "lineupEntry",
  "registration",
  "suspension",
  "refereeRating",
  "customField",
  "customFieldValue",
  "banner",
  "auditLog",
] as const;

async function main() {
  mkdirSync("prisma/export", { recursive: true });
  const dump: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const rows = await (db as any)[t].findMany();
    // Dates → ISO-строки, чтобы JSON был переносимым
    dump[t] = rows.map((r: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) out[k] = v instanceof Date ? v.toISOString() : v;
      return out;
    });
    console.log(`  ${t}: ${dump[t].length}`);
  }
  writeFileSync("prisma/export/data.json", JSON.stringify(dump, null, 1), "utf-8");
  console.log(`✅ Выгружено в prisma/export/data.json (${TABLES.length} таблиц)`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
