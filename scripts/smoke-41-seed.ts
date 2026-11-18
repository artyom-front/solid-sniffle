// ============================================================
// smoke-41-seed.ts — дев-данные для приёмки v1.0.41 (ТОЛЬКО локальная
// БД песочницы, прод не трогаем). Матч cmus3g1kw00splzwbwuiyf2e3
// (FUTSAL, 16 событий, 12 в заявке): 5 стартовых вместо 6 (лимит
// формата FUTSAL=5 → секции «Основной состав»/«Запасные» вместо
// легаси-группы) + одна замена SUBSTITUTION 30' (вышел — из запаса,
// ушёл — стартовый) для проверки зеркальных строк замен в «Протоколе»
// и значков/приглушения в «Составах».
// Запуск: DATABASE_URL=… bun run scripts/smoke-41-seed.ts
// ============================================================
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const MATCH_ID = "cmus3g1kw00splzwbwuiyf2e3";

async function main() {
  const m = await db.match.findUnique({ where: { id: MATCH_ID } });
  if (!m) throw new Error("матч не найден — БД пересеяна, обнови MATCH_ID");
  const entries = await db.lineupEntry.findMany({ where: { matchId: MATCH_ID }, include: { person: true } });
  console.log("lineup:", entries.length, "старт:", entries.filter((e) => e.isStarter).length);

  // уже патчили?
  const hasSub = await db.matchEvent.findFirst({ where: { matchId: MATCH_ID, type: "SUBSTITUTION" } });
  if (hasSub) {
    console.log("уже засеяно — выходим без изменений");
    return;
  }

  // команда с наибольшей заявкой
  const byTeam = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byTeam.get(e.teamId) ?? [];
    list.push(e);
    byTeam.set(e.teamId, list);
  }
  const teamId = [...byTeam.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
  const teamEntries = byTeam.get(teamId)!;
  const evCount = new Map<string, number>();
  for (const e of await db.matchEvent.findMany({ where: { matchId: MATCH_ID } })) {
    evCount.set(e.personId, (evCount.get(e.personId) ?? 0) + 1);
    if (e.assistPersonId) evCount.set(e.assistPersonId, (evCount.get(e.assistPersonId) ?? 0) + 1);
  }
  // стартовый БЕЗ событий → уйдёт с поля (приглушение в составах)
  const starterOut = teamEntries.find((e) => e.isStarter && !evCount.get(e.personId)) ?? teamEntries.find((e) => e.isStarter);
  // запасной — выйдет (↑, выделен)
  const benchIn = teamEntries.find((e) => !e.isStarter) ?? teamEntries.find((e) => e.id !== starterOut?.id);
  if (!starterOut || !benchIn) throw new Error("не хватает игроков для замены");

  // 1) старт/запас: 5 стартовых у этой команды (лимит FUTSAL)
  const teamStarters = teamEntries.filter((e) => e.isStarter);
  if (teamStarters.length > 5) {
    for (const s of teamStarters) {
      if (s.id !== starterOut.id && teamStarters.filter((x) => x.isStarter).length > 5) {
        // если после бенчинга out-стартера всё ещё >5 — бенчим лишних
      }
    }
    // бенчим всех сверх 5, кроме out-игрока (он стартовый и уйдёт по ходу)
    let cur = teamStarters.length;
    for (const s of teamStarters) {
      if (cur <= 5) break;
      if (s.id === starterOut.id) continue;
      await db.lineupEntry.update({ where: { id: s.id }, data: { isStarter: false } });
      cur--;
    }
  }

  // 2) замена 30': вышел benchIn, ушёл starterOut
  await db.matchEvent.create({
    data: {
      matchId: MATCH_ID,
      minute: 30,
      type: "SUBSTITUTION",
      personId: benchIn.personId,
      teamId,
      assistPersonId: starterOut.personId,
    },
  });

  const after = await db.lineupEntry.findMany({ where: { matchId: MATCH_ID } });
  console.log(
    "OK: стартовые после патча:",
    after.filter((e) => e.isStarter).length,
    "| замена:",
    `${benchIn.person.lastName} ↑30' ← ${starterOut.person.lastName} ↓30'`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
