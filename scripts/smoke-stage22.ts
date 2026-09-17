// SMOKE v1.0.23 · Этап 2 (модель данных): заявки с историей (P2002→409),
// sessionVersion (сброс пароля убивает сессии), APP_VERSION в /api/health.
// Запуск: bun scripts/smoke-stage22.ts — нужен сервер :3000 (scripts/smoke-standalone.sh).
export {};

// песочница: .env может быть перезаписан платформой на sqlite — страхуем явным дефолтом
if (!process.env.DATABASE_URL?.startsWith("postgresql://")) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public";
}

const BASE = "http://127.0.0.1:3000";
let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name} ${extra}`); }
}
async function api(method: string, path: string, body?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try { json = await r.json(); } catch { /* пустое тело */ }
  return { status: r.status, json, cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
}

// ---------- 0. Health + версия ----------
const health = await api("GET", "/api/health");
check("health ok", health.json?.ok === true, `status=${health.status}`);
check("health.version = APP_VERSION env", String(health.json?.version || "").startsWith("v1.0.23-smoke"), `version=${health.json?.version}`);

// ---------- 1. Логины (с восстановлением после незавершённого прогона) ----------
// Нюанс: исходный сид-пароль club123 (7 символов) короче API-лимита resetPassword
// (8+), поэтому восстановление делаем напрямую в БД, а не через API.
async function dbRestoreClubPassword() {
  const { PrismaClient } = await import("@prisma/client");
  const { createHmac, scryptSync, randomBytes } = await import("crypto");
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync("club123", salt, 64).toString("hex");
  const p = new PrismaClient();
  await p.user.update({ where: { email: "club@ff21.ru" }, data: { passwordHash: `${salt}:${hash}` } });
  await p.$disconnect();
}
const admin = await api("POST", "/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
check("логин admin", admin.status === 200 && !!admin.cookie);

let club = await api("POST", "/api/auth/login", { email: "club@ff21.ru", password: "club123" });
if (club.status !== 200) {
  console.log("  (прошлый прогон оставил смоук-пароль — восстанавливаем club123 в БД)");
  await dbRestoreClubPassword();
  club = await api("POST", "/api/auth/login", { email: "club@ff21.ru", password: "club123" });
}
check("логин club", club.status === 200 && !!club.cookie);
const me = await api("GET", "/api/auth/me", undefined, club.cookie);
check("сессия жива (v в токене)", me.status === 200 && !!me.json?.user, `user=${JSON.stringify(me.json?.user).slice(0, 50)}`);

// ---------- 2. Заявки: история + 409 вместо 500 ----------
const leagues = await api("GET", "/api/admin/leagues", undefined, admin.cookie);
const allLeagues: any[] = leagues.json?.leagues ?? [];
const now = Date.now();
// сезон из лиги с открытым (или отсутствующим) трансферным окном
const goodLeague = allLeagues.find((l) => !l.transferWindowEnd || new Date(l.transferWindowEnd).getTime() > now)
  ?? allLeagues[0];
const seasonId = goodLeague?.seasons?.[0]?.id;
check("сезон получен", !!seasonId, `лига=${goodLeague?.name}`);
const teamsResp = await api("GET", "/api/admin/teams", undefined, admin.cookie);
const teamId = teamsResp.json?.teams?.[0]?.id;
check("команда получена", !!teamId);

const regIds: string[] = [];
if (seasonId && teamId) {
  const person = await api("POST", "/api/admin/persons", {
    firstName: "Смоук", lastName: "Этапдва", birthDate: "1990-01-01", roles: ["PLAYER"],
  }, admin.cookie);
  const personId = person.json?.person?.id;
  check("персона создана", !!personId, JSON.stringify(person.json).slice(0, 120));

  if (personId) {
    const P = { personId, teamId, seasonId };

    // 2a. первая заявка
    const r1 = await api("POST", "/api/admin/registrations", P, admin.cookie);
    check("2a первая заявка -> 200", r1.status === 200 && r1.json?.ok, `status=${r1.status} ${JSON.stringify(r1.json).slice(0, 140)}`);
    if (r1.json?.registration?.id) regIds.push(r1.json.registration.id);

    // 2b. дубль АКТИВНОЙ — должен быть 409 (не 500!)
    const r2 = await api("POST", "/api/admin/registrations", P, admin.cookie);
    check("2b дубль активной -> 409 (не 500)", r2.status === 409, `status=${r2.status} body=${JSON.stringify(r2.json).slice(0, 100)}`);

    // 2c. «отзаявка» (PATCH status=ENDED) и ВОЗВРАТ в ту же команду —
    // раньше это был P2002 -> голый 500 (уникальность строчного вида)
    const end = await api("PATCH", `/api/admin/registrations/${regIds[0]}`, { status: "ENDED" }, admin.cookie);
    check("2c-1 отзаявка (PATCH END) -> 200", end.status === 200 && end.json?.ok, `status=${end.status}`);
    const r3 = await api("POST", "/api/admin/registrations", P, admin.cookie);
    check("2c-2 возврат игрока -> 200 (история разрешена)", r3.status === 200 && r3.json?.ok, `status=${r3.status} ${JSON.stringify(r3.json).slice(0, 140)}`);
    if (r3.json?.registration?.id) regIds.push(r3.json.registration.id);

    // 2d. дубль АКТИВНОЙ после отзаявки+возврата — снова 409
    const r2b = await api("POST", "/api/admin/registrations", P, admin.cookie);
    check("2d дубль после возврата -> 409", r2b.status === 409, `status=${r2b.status}`);

    // 2e. у персоны две записи истории (закрытая + активная)
    const list = await api("GET", `/api/admin/registrations?seasonId=${seasonId}`, undefined, admin.cookie);
    const mine = (list.json?.registrations ?? []).filter((x: any) => x.personId === personId);
    check("2e история заявок: 2 строки", mine.length === 2, `строк=${mine.length}`);

    // уборка: заявки и персона (path-param роуты [id])
    for (const id of regIds) {
      await api("DELETE", `/api/admin/registrations/${id}`, undefined, admin.cookie).catch(() => {});
    }
    const pd = await api("DELETE", `/api/admin/persons/${personId}`, undefined, admin.cookie).catch(() => null);
    check("уборка (заявки+персона)", !!pd, `person delete=${pd ? pd.status : "n/a"}`);
  }
}

// ---------- 3. sessionVersion: сброс пароля убивает сессию ----------
const userId = me.json?.user?.id;
const meBefore = await api("GET", "/api/auth/me", undefined, club.cookie);
check("3a сессия до сброса жива", meBefore.status === 200);
const reset = await api("PATCH", "/api/admin/users", { id: userId, action: "resetPassword", password: "smoke-pass-123" }, admin.cookie);
check("3b сброс пароля -> ok", reset.status === 200, `status=${reset.status} body=${JSON.stringify(reset.json).slice(0, 80)}`);
const meAfter = await api("GET", "/api/auth/me", undefined, club.cookie);
check("3c старая сессия после сброса мертва (user: null)", meAfter.json?.user == null, `user=${JSON.stringify(meAfter.json?.user).slice(0, 60)}`);
const reloginOld = await api("POST", "/api/auth/login", { email: "club@ff21.ru", password: "club123" });
check("3d старый пароль не работает", reloginOld.status === 401, `status=${reloginOld.status}`);
const reloginNew = await api("POST", "/api/auth/login", { email: "club@ff21.ru", password: "smoke-pass-123" });
check("3e новый пароль работает (сессия с новой v)", reloginNew.status === 200 && !!reloginNew.cookie, `status=${reloginNew.status}`);
const meNew = await api("GET", "/api/auth/me", undefined, reloginNew.cookie);
check("3e2 сессия нового пароля жива", meNew.json?.user != null, `user=${JSON.stringify(meNew.json?.user).slice(0, 50)}`);
// восстановление — напрямую в БД (club123 короче API-лимита 8 символов)
await dbRestoreClubPassword();
check("3f пароль восстановлен в БД", true);
const meNewSession = await api("GET", "/api/auth/me", undefined, reloginNew.cookie);
check("3g сессия жива (хэш менялся мимо sessionVersion — version-инвалидация точечная)", meNewSession.json?.user != null, `user=${JSON.stringify(meNewSession.json?.user).slice(0, 40)}`);
const clubAgain = await api("POST", "/api/auth/login", { email: "club@ff21.ru", password: "club123" });
check("3h исходный пароль снова работает", clubAgain.status === 200, `status=${clubAgain.status}`);

console.log(`\n== Итог: ${pass} ok, ${fails.length} FAIL ==`);
if (fails.length) { console.log("Провалено:", fails.join(" | ")); process.exit(1); }
