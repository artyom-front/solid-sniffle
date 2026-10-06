import { db } from "@/lib/db";

/** Health-check для балансировщика/мониторинга: БД + версия + uptime. */
export async function GET() {
  try {
    await db.user.count(); // лёгкий запрос — проверяет доступность БД
    return Response.json({
      ok: true,
      db: "up",
      version: process.env.APP_VERSION ?? "1.0.0",
      uptime: Math.floor(process.uptime()),
      time: new Date().toISOString(),
    });
  } catch {
    return Response.json(
      { ok: false, db: "down", time: new Date().toISOString() },
      { status: 503 }
    );
  }
}
