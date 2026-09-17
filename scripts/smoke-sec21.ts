// SMOKE v1.0.21 · security-этап 0: BOLA-фиксы CLUB_ADMIN (clubs/teams)
// + инвалидация сессии при блокировке (isActive).
// Запуск: bun scripts/smoke-sec21.ts — нужен dev-сервер :3000 с сид-данными.
// Топ-level символы с префиксом SEC21 (грабля tsconfig из worklog Task 21).

const SEC21_BASE = "http://localhost:3000";
let SEC21_pass = 0;
const SEC21_fails: string[] = [];

function SEC21_check(name: string, cond: boolean, extra = "") {
  if (cond) {
    SEC21_pass++;
    console.log(`  ok  ${name}`);
  } else {
    SEC21_fails.push(name);
    console.log(`  FAIL ${name} ${extra}`);
  }
}

async function SEC21_api(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(SEC21_BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* пустое тело */ }
  return { status: res.status, json, cookie: res.headers.get("set-cookie")?.split(";")[0] };
}

async function SEC21_login(email: string, password: string) {
  const r = await SEC21_api("POST", "/api/auth/login", { email, password });
  return { cookie: r.cookie ?? "", status: r.status };
}

console.log("== SMOKE v1.0.21 security: BOLA + isActive ==");

// ---------- входы ----------
const SEC21_admin = await SEC21_login("admin@ff21.ru", "admin123");
SEC21_check("SUPER_ADMIN входит", SEC21_admin.status === 200);
const SEC21_clubAdmin = await SEC21_login("club@ff21.ru", "club123");
SEC21_check("CLUB_ADMIN входит", SEC21_clubAdmin.status === 200);
const SEC21_ca = SEC21_clubAdmin.cookie;

// ---------- подготовка: clubA (Урняк, клуб CLUB_ADMIN-а) и clubB ----------
const SEC21_clubsResp = await SEC21_api("GET", "/api/admin/clubs", undefined, SEC21_admin.cookie);
const SEC21_clubA = (SEC21_clubsResp.json?.clubs ?? []).find((c: any) => c.name.includes("Урняк"));
SEC21_check("клуб CLUB_ADMIN-а найден в списке", !!SEC21_clubA);
const SEC21_origDesc = SEC21_clubA?.description ?? null;

const SEC21_clubBResp = await SEC21_api("POST", "/api/admin/clubs", { name: "SEC21 Club B" }, SEC21_admin.cookie);
const SEC21_clubB = SEC21_clubBResp.json?.club;
SEC21_check("SUPER_ADMIN создаёт клуб (легитимный путь жив)", SEC21_clubBResp.status === 200 && !!SEC21_clubB?.id);

// ---------- ТЕСТ 1: CLUB_ADMIN не создаёт клубы ----------
const SEC21_t1 = await SEC21_api("POST", "/api/admin/clubs", { name: "SEC21 Hack Club" }, SEC21_ca);
SEC21_check("T1 CLUB_ADMIN POST /clubs -> 403", SEC21_t1.status === 403, `got ${SEC21_t1.status}`);

// ---------- ТЕСТ 2: CLUB_ADMIN не правит чужой клуб ----------
const SEC21_t2 = await SEC21_api("PATCH", `/api/admin/clubs/${SEC21_clubB.id}`, { description: "hack" }, SEC21_ca);
SEC21_check("T2 CLUB_ADMIN PATCH чужого клуба -> 403", SEC21_t2.status === 403, `got ${SEC21_t2.status}`);

// ---------- ТЕСТ 3: CLUB_ADMIN правит свой клуб ----------
const SEC21_t3 = await SEC21_api("PATCH", `/api/admin/clubs/${SEC21_clubA.id}`, { description: "sec21-ping" }, SEC21_ca);
SEC21_check("T3 CLUB_ADMIN PATCH своего клуба -> 200", SEC21_t3.status === 200, `got ${SEC21_t3.status}`);

// ---------- ТЕСТ 4: CLUB_ADMIN создаёт команду — clubId форсится в свой клуб ----------
const SEC21_t4 = await SEC21_api("POST", "/api/admin/teams", { name: "SEC21 Team", clubId: SEC21_clubB.id }, SEC21_ca);
const SEC21_team = SEC21_t4.json?.team;
SEC21_check(
  "T4a CLUB_ADMIN POST /teams с чужим clubId -> 200 (создание не ломаем)",
  SEC21_t4.status === 200 && !!SEC21_team?.id,
  `got ${SEC21_t4.status}`
);
SEC21_check(
  "T4b команда принудительно в СВОЁМ клубе",
  SEC21_team?.clubId === SEC21_clubA.id,
  `clubId=${SEC21_team?.clubId}, ожидали ${SEC21_clubA.id}`
);

// ---------- ТЕСТ 5: CLUB_ADMIN не переносит свою команду в чужой клуб ----------
const SEC21_t5 = await SEC21_api("PATCH", `/api/admin/teams/${SEC21_team.id}`, { clubId: SEC21_clubB.id }, SEC21_ca);
SEC21_check(
  "T5a CLUB_ADMIN PATCH команды с clubId чужого клуба -> 200 (без ошибки)",
  SEC21_t5.status === 200,
  `got ${SEC21_t5.status}`
);
SEC21_check(
  "T5b команда осталась в своём клубе (перенод проигнорирован)",
  SEC21_t5.json?.team?.clubId === SEC21_clubA.id,
  `clubId=${SEC21_t5.json?.team?.clubId}`
);

// ---------- ТЕСТ 6: LEAGUE/SUPER_ADMIN переносит команду (легитимный путь жив) ----------
const SEC21_t6 = await SEC21_api("PATCH", `/api/admin/teams/${SEC21_team.id}`, { clubId: SEC21_clubB.id }, SEC21_admin.cookie);
SEC21_check(
  "T6 SUPER_ADMIN переносит команду в другой клуб",
  SEC21_t6.status === 200 && SEC21_t6.json?.team?.clubId === SEC21_clubB.id,
  `clubId=${SEC21_t6.json?.team?.clubId}`
);

// ---------- ТЕСТ 7: блокировка убивает активную сессию ----------
const SEC21_usersResp = await SEC21_api("GET", "/api/admin/users", undefined, SEC21_admin.cookie);
const SEC21_caUser = (SEC21_usersResp.json?.users ?? []).find((u: any) => u.email === "club@ff21.ru");
SEC21_check("профиль CLUB_ADMIN найден", !!SEC21_caUser?.id);

const SEC21_block = await SEC21_api("PATCH", "/api/admin/users", { id: SEC21_caUser.id, action: "setActive", active: false }, SEC21_admin.cookie);
SEC21_check("T7a SUPER_ADMIN блокирует CLUB_ADMIN", SEC21_block.status === 200, `got ${SEC21_block.status}`);

const SEC21_t7 = await SEC21_api("GET", "/api/admin/clubs", undefined, SEC21_ca);
SEC21_check("T7b старая сессия заблокированного -> 401", SEC21_t7.status === 401, `got ${SEC21_t7.status}`);

const SEC21_relogin = await SEC21_login("club@ff21.ru", "club123");
SEC21_check("T7c повторный вход заблокированного -> 403", SEC21_relogin.status === 403, `got ${SEC21_relogin.status}`);

const SEC21_unblock = await SEC21_api("PATCH", "/api/admin/users", { id: SEC21_caUser.id, action: "setActive", active: true }, SEC21_admin.cookie);
SEC21_check("T7d разблокировка", SEC21_unblock.status === 200, `got ${SEC21_unblock.status}`);
const SEC21_finalLogin = await SEC21_login("club@ff21.ru", "club123");
SEC21_check("T7e после разблокировки вход работает", SEC21_finalLogin.status === 200, `got ${SEC21_finalLogin.status}`);

// ---------- уборка ----------
if (SEC21_team?.id) {
  const del = await SEC21_api("DELETE", `/api/admin/teams/${SEC21_team.id}`, {}, SEC21_admin.cookie);
  SEC21_check("уборка: команда удалена", del.status === 200, `got ${del.status}`);
}
if (SEC21_clubB?.id) {
  const del = await SEC21_api("DELETE", `/api/admin/clubs/${SEC21_clubB.id}`, undefined, SEC21_admin.cookie);
  SEC21_check("уборка: клуб B удалён", del.status === 200, `got ${del.status}`);
}
if (SEC21_clubA?.id) {
  const restore = await SEC21_api("PATCH", `/api/admin/clubs/${SEC21_clubA.id}`, { description: SEC21_origDesc }, SEC21_admin.cookie);
  SEC21_check("уборка: описание клуба A восстановлено", restore.status === 200, `got ${restore.status}`);
}

console.log(`\n== Итог: ${SEC21_pass} ok, ${SEC21_fails.length} FAIL ==`);
if (SEC21_fails.length > 0) {
  console.log("Провалены: " + SEC21_fails.join("; "));
  process.exit(1);
}
