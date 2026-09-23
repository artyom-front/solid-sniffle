// Разовое обновление текста баннера в старых локальных БД (SCORES21 → SCORESBOX).
// Свежий prisma/seed.ts уже содержит SCORESBOX — скрипт нужен, только если вы
// засеивали базу до переименования.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const res = await db.banner.updateMany({
    where: { text: { contains: "SCORES21" } },
    data: { text: "Футбольная форма, бутсы и вратарские перчатки со скидкой 15% по промокоду SCORESBOX" },
  });
  console.log("Обновлено баннеров:", res.count);
}

main().finally(() => db.$disconnect());
