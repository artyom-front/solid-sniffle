// ============================================================
// .zscripts/seed-if-empty.mjs — залить демо-данные, только если
// база пуста (сид не идемпотентен, повторный запуск задублировал бы).
// Запускается из .zscripts/dev.sh при буте песочницы.
// ============================================================
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new PrismaClient();

try {
  const n = await db.person.count();
  if (n > 0) {
    console.log(`[seed-if-empty] база не пуста (${n} персон) — сид пропущен`);
  } else {
    console.log("[seed-if-empty] база пуста — заливаем демо-данные...");
    const p = Bun.spawn(["bun", "prisma/seed.ts"], {
      cwd: ROOT,
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await p.exited;
    console.log(`[seed-if-empty] seed завершён (код ${code})`);
  }
} catch (e) {
  console.error("[seed-if-empty] ошибка проверки базы:", e?.message || e);
} finally {
  await db.$disconnect();
}
