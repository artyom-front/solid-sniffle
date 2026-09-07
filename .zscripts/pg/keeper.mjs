// ============================================================
// .zscripts/pg/keeper.mjs — хранитель embedded PostgreSQL 16 (песочница z.ai)
// Запускает postgres на 127.0.0.1:5432 и живёт, пока жив сервер.
// При SIGTERM/SIGINT аккуратно останавливает базу.
// Не часть проекта: .zscripts/ в .gitignore.
// ============================================================
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PGDATA = path.join(__dirname, "pgdata");
const PORT = 5432;
const USER = "postgres";
const PASSWORD = "postgres";
const DB = "scoresbox";

// ICU60 для бинарников postgres (система песочницы — Debian 13 с ICU 76,
// а сборка @embedded-postgres/linux-x64 слинкована с ICU 60; libicu60
// подложена в native/lib, здесь лишь указываем путь поиска)
const LIBDIR = path.join(
  __dirname,
  "node_modules/@embedded-postgres/linux-x64/native/lib",
);
process.env.LD_LIBRARY_PATH = `${LIBDIR}:${process.env.LD_LIBRARY_PATH || ""}`;

const { default: EmbeddedPostgres } = await import("embedded-postgres");

// ---------- утилита: ждём, пока порт начнёт принимать соединения ----------
const waitPort = (port, host, timeoutMs) =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tryOnce = () => {
      const s = createConnection({ port, host }, () => {
        s.destroy();
        resolve(true);
      });
      s.on("error", () => {
        if (Date.now() - t0 > timeoutMs) reject(new Error(`порт ${port} не отвечает`));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });

// ---------- уже запущен? (перезапуск dev.sh при живой базе) ----------
try {
  await waitPort(PORT, "127.0.0.1", 1500);
  console.log("[pg-keeper] PostgreSQL уже работает на 5432 — ничего не делаем");
  process.exit(0);
} catch {
  /* не запущен — стартуем ниже */
}

const pg = new EmbeddedPostgres({
  databaseDir: PGDATA,
  port: PORT,
  user: USER,
  password: PASSWORD,
  authMethod: "password",
  persistent: true,
  onLog: (m) => {
    const s = String(m).trim();
    if (s) console.log("[pg]", s);
  },
  onError: (e) => console.error("[pg-err]", e?.message || e),
});

if (!existsSync(path.join(PGDATA, "PG_VERSION"))) {
  console.log("[pg-keeper] первый запуск: initdb...");
  await pg.initialise();
}

console.log("[pg-keeper] старт postgres...");
await pg.start();
console.log(`[pg-keeper] PostgreSQL 16 поднялся на 127.0.0.1:${PORT}`);

try {
  await pg.createDatabase(DB);
  console.log(`[pg-keeper] база «${DB}» создана`);
} catch (e) {
  if (!String(e?.message || "").includes("already exists")) throw e;
  console.log(`[pg-keeper] база «${DB}» уже существует`);
}

// ---------- держим процесс живым (postgres — наш child) ----------
const bye = async () => {
  console.log("[pg-keeper] останавливаю postgres...");
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
};
process.on("SIGTERM", bye);
process.on("SIGINT", bye);
setInterval(() => {}, 1 << 30);
console.log("[pg-keeper] keeper работает; DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public");
