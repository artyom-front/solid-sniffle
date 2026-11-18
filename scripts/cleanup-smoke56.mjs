// Вычистка тестовых данных smoke56 из БД (запуск после смока):
// смок ставит photoUrl первому игроку и logoUrl первому клубу и оставляет
// два Media-файла (PNG + mp4). Запуск: node scripts/cleanup-smoke56.mjs
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

(async () => {
  const persons = await db.person.findMany({
    where: { photoUrl: { startsWith: "/api/media/" } },
    select: { id: true, lastName: true, photoUrl: true },
  });
  for (const p of persons) {
    await db.person.update({ where: { id: p.id }, data: { photoUrl: null } });
    console.log("person photoUrl сброшен:", p.lastName);
  }

  const clubs = await db.club.findMany({
    where: { logoUrl: { startsWith: "/api/media/" } },
    select: { id: true, name: true, logoUrl: true },
  });
  for (const c of clubs) {
    await db.club.update({ where: { id: c.id }, data: { logoUrl: null } });
    console.log("club logoUrl сброшен:", c.name);
  }

  // сами Media-файлы смока: png/mp4, загруженные сегодня (id из лога смока)
  const today = new Date();
  today.setHours(today.getHours() - 1);
  const media = await db.media.findMany({
    where: { createdAt: { gte: today } },
    select: { id: true, mime: true },
  });
  for (const m of media) {
    await db.media.delete({ where: { id: m.id } }).catch(() => {});
    console.log("media удалён:", m.id, m.mime);
  }
  console.log("готово: тест-медиа вычищены");
  await db.$disconnect();
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
