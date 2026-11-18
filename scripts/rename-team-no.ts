// Тест-данные для проверки санитайзера «№N» (v1.0.40):
// переименовываем одну команду dev-БД в «Химик-НО №3», проверяем
// публичный API, затем возвращаем исходное имя.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TEAM_ID = process.argv[2] ?? "";

async function main() {
  const team = await db.team.findFirst({ where: { name: { contains: "Химик-НО" } } });
  if (!team) {
    console.log("NO TEAM with Химик-НО; list:");
    const t = await db.team.findMany({ take: 8 });
    console.log(t.map((x) => `${x.id} ${x.name}`).join("\n"));
    return;
  }
  console.log("team:", team.id, "«" + team.name + "»");
  await db.team.update({ where: { id: team.id }, data: { name: "Химик-НО №3" } });
  console.log("RENAMED to «Химик-НО №3» (original saved: " + team.name + ")");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
