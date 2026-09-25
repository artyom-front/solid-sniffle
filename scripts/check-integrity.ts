// Проверка целостности SQLite-базы перед копированием (для backup-db.sh).
// PRAGMA integrity_check через $queryRawUnsafe — статичный SQL без шаблона.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const r = (await db.$queryRawUnsafe("PRAGMA integrity_check")) as { integrity_check: string }[];
  const ok = String(r?.[0]?.integrity_check ?? "").includes("ok");
  console.log(ok ? "integrity_check: ok" : "integrity_check: FAILED");
  await db.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Проверка не выполнена:", e);
  await db.$disconnect();
  process.exit(1);
});
