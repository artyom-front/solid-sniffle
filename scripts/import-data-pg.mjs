// ============================================================
// import-data-pg.mjs — перенос данных из prisma/export/data.json
// в PostgreSQL через Prisma-клиент, сгенерированный из
// prisma/postgres/schema.prisma (output: generated/pg-client).
//
// Запуск (после make-pg-schema.sh + prisma generate):
//   DATABASE_URL_PG=postgresql://user:pass@localhost:5432/scoresbox \
//     node scripts/import-data-pg.mjs
//
// Идемпотентность: перед импортом таблицы очищаются в правильном
// порядке (FK), поэтому повторный запуск безопасен.
// ============================================================

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// клиент PG-схемы живёт в generated/pg-client (см. make-pg-schema.sh)
const { PrismaClient } = require("../generated/pg-client/index.js");
const db = new PrismaClient();

// порядок вставки — родители раньше детей (FK)
const ORDER = [
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
];

// ISO-строки → Date обратно
const revive = (rows) =>
  rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v) ? new Date(v) : v;
    }
    return out;
  });

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function main() {
  const dump = JSON.parse(readFileSync("prisma/export/data.json", "utf-8"));

  // очистка в обратном порядке (дети раньше родителей)
  for (const t of [...ORDER].reverse()) {
    await db[t].deleteMany();
  }

  for (const t of ORDER) {
    const rows = revive(dump[t] ?? []);
    // SQLite не держал последовательности для int PK — все id cuid-строки,
    // поэтому createMany без skipDuplicates безопасен
    for (const part of chunk(rows, 200)) {
      await db[t].createMany({ data: part });
    }
    console.log(`  ${t}: ${rows.length}`);
  }

  const counts = {
    persons: await db.person.count(),
    matches: await db.match.count(),
    events: await db.matchEvent.count(),
  };
  console.log("✅ Импорт в PostgreSQL завершён:", counts);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
