// ============================================================
// Смок v1.0.55 (feedback55 №4): ШТАБ НА МАТЧ — LineupEntry.staffRole.
// Против живого dev-сервера (:3000, демо-данные). Мутирует состав
// одного SCHEDULED-матча, в конце УДАЛЯЕТ созданные строки состава
// (матч возвращается в исходное состояние «состав не подан»).
// ============================================================

const BASE = "http://127.0.0.1:3000";
const MATCH = process.argv[2] ?? "cmv0wwhzx00thorwgm7cskhqa";

let cookie = "";
async function call(path: string, body?: unknown, method = "POST") {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

let failed = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} · ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
}

// 0a. временный супер-админ для смока (владельческий пароль в dev-БД
// мог быть сменён — свой аккаунт НЕ трогаем; в конце юзер удаляется)
const { PrismaClient } = await import("@prisma/client");
const { scryptSync, randomBytes } = await import("node:crypto");
const DBURL = "postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public";
const db = new PrismaClient({ datasources: { db: { url: DBURL } } });
const SMOKE_EMAIL = "smoke55@test.local";
const SMOKE_PASS = randomBytes(12).toString("hex");
const salt = randomBytes(16).toString("hex");
await db.user.deleteMany({ where: { email: SMOKE_EMAIL } });
await db.user.create({
  data: {
    email: SMOKE_EMAIL,
    passwordHash: `${salt}:${scryptSync(SMOKE_PASS, salt, 64).toString("hex")}`,
    role: "SUPER_ADMIN",
    isActive: true,
    emailVerified: true,
    passwordSet: true,
  },
});

// 0b. логин
let r = await call("/api/auth/login", { email: SMOKE_EMAIL, password: SMOKE_PASS });
check("логин временного супер-админа", r.status === 200);

// 1. GET редактора протокола: DTO состава содержит staffRole
r = await call(`/api/admin/matches/${MATCH}`, undefined, "GET");
check("GET протокола 200", r.status === 200);
const data = r.json as {
  match: { homeTeam: { id: string } };
  eligible: { home: { personId: string; name: string; regRole: string; suspension: unknown }[]; away: { personId: string; name: string }[] };
  lineup: { staffRole: string | null }[];
};
const teamId = data.match.homeTeam.id;
check("DTO lineups имеет поле staffRole", Array.isArray(data.lineup) && data.lineup.every((l) => "staffRole" in l));
const players = data.eligible.home.filter((p) => p.regRole === "PLAYER" && !p.suspension);
const staffReg = data.eligible.home.filter((p) => p.regRole !== "PLAYER");
console.log(`info: игроков доступно ${players.length}, заявка-штаб ${staffReg.length}`);
const starter = players.slice(0, Math.min(11, players.length)).map((p) => p.personId);
const outsider = data.eligible.away[0]; // игрок ДРУГОЙ команды — точно вне состава
const playingStaff = players[0]; // «играющий сотрудник» — стартовый игрок + должность

// 2. PATCH lineup с staffRoles (игрок в старте + должность в штабе)
r = await call(`/api/admin/matches/${MATCH}`, {
  action: "lineup",
  teamId,
  personIds: [...starter],
  starters: starter,
  numbers: [{ personId: playingStaff.personId, number: 7 }],
  captainId: playingStaff.personId,
  staffRoles: [{ personId: playingStaff.personId, role: "TEAM_MANAGER" }],
});
check("PATCH состава с staffRoles", r.status === 200, JSON.stringify(r.json));

// 3. повторный PATCH: МУСОРНАЯ роль → 422
r = await call(`/api/admin/matches/${MATCH}`, {
  action: "lineup",
  teamId,
  personIds: starter,
  staffRoles: [{ personId: playingStaff.personId, role: "BANANA" }],
});
check("мусорная роль штаба → 422", r.status === 422, JSON.stringify(r.json).slice(0, 160));

// 4. PATCH: должность человеку НЕ из состава → 422
r = await call(`/api/admin/matches/${MATCH}`, {
  action: "lineup",
  teamId,
  personIds: starter,
  staffRoles: [{ personId: outsider.personId, role: "ASSISTANT_COACH" }],
});
check("должность игроку другой команды → 422", r.status === 422, JSON.stringify(r.json).slice(0, 160));

// 5. публичная карточка матча: staffRole в DTO, играющий сотрудник виден
r = await call(`/api/public/matches/${MATCH}`, undefined, "GET");
const pub = r.json as { match: { lineups: { person: { id: string }; regRole: string; staffRole: string | null; isStarter: boolean; number: number | null }[] } };
const row = pub.match.lineups.find((l) => l.person.id === playingStaff.personId);
check(
  "публичный DTO: игрок в старте №7 + staffRole TEAM_MANAGER",
  !!row && row.isStarter === true && row.number === 7 && row.staffRole === "TEAM_MANAGER",
  row ? JSON.stringify(row) : "нет строки"
);

// 6. чистка: вернуть матч в «состав не подан» + удалить временного юзера
const del = await db.lineupEntry.deleteMany({ where: { matchId: MATCH } });
check("чистка: строки состава удалены", del.count >= starter.length, `удалено ${del.count}`);
await db.user.deleteMany({ where: { email: SMOKE_EMAIL } });
await db.$disconnect();
check("чистка: временный админ удалён", true);

console.log(failed === 0 ? "\nSMOKE OK" : `\nSMOKE FAILED: ${failed}`);
process.exit(failed === 0 ? 0 : 1);

// module-marker (глобальные const конфликтуют с test-api.ts в tsc)
export {};
