// Пересоздание чистой тестовой БД (интеграционные тесты мутируют данные).
// Использование: bun scripts/reset-test-db.ts [dbname]
import { PrismaClient } from "@prisma/client";

const name = process.argv[2] ?? "scoresbox_test";
const admin = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public" } },
});

async function main() {
  await admin.$queryRawUnsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`);
  await admin.$queryRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.$queryRawUnsafe(`CREATE DATABASE "${name}"`);
  console.log(`recreated clean: ${name}`);
}

main()
  .catch((e) => {
    console.error("FAIL:", String(e.message).slice(0, 300));
    process.exitCode = 1;
  })
  .finally(() => admin.$disconnect());
