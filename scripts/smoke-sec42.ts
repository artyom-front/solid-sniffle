// ============================================================
// SMOKE-SEC42 · приёмка v1.0.42 (аудит 2026-10-05, анти-BOLA).
// Негативные и позитивные проверки RBAC на живом standalone-сервере.
// Запуск: BASE=http://localhost:3100 DATABASE_URL=... bun scripts/smoke-sec42.ts
// (из корня проекта; сервер должен быть поднят с тем же DATABASE_URL)
//
// Проверки (все — «знание чужого ID не даёт доступа»):
//  T1  скоуп-админ лиги A: GET протокола матча лиги B → 403, своего → 200
//  T1r судья: GET чужого матча → 403 (регресс старого правила)
//  T2  скоуп-админ: PATCH заявки лиги B → 403, своей (no-op) → 200
//  T3  скоуп-админ: КДК update/delete чужой лиги → 403, create в чужой сезон → 403
//  T4  оператор (LEAGUE_ADMIN без скоупа): контент сайта (banners/GET+POST,
//      statblocks, formats, merge) → 403; супер-админ banners → 200
//  T5  CLUB_ADMIN: PATCH чужой персоны → 403, своей (no-op) → 200,
//      своей с roles → 403 (глобальные поля — уровень лиги)
//  T6  дашборд: club/судья/скоуп-админ — recentAudit пуст; супер — массив
//  T7  media: DELETE от CLUB_ADMIN и оператора → 403; от супер несуществующего → 404
//  T8  позитив КДК: супер создаёт/правит/удаляет тестовую КДК; скоуп-админ
//      создаёт КДК в СВОЁМ сезоне и супер её удаляет
// ============================================================

import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE || "http://localhost:3100";
const db = new PrismaClient();

const PWD = {
  admin: "admin123",
  liga: "liga123",
  liga2: "liga2123",
  club: "club123",
  sudya: "sudya123",
};

// ---------- HTTP с cookie-банками ----------
const jars: Record<string, string> = {};
async function login(user: keyof typeof PWD) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${user}@ff21.ru`, password: PWD[user] }),
  });
  const sc = res.headers.get("set-cookie");
  if (!res.ok || !sc) throw new Error(`login ${user} failed: ${res.status}`);
  jars[user] = sc.split(";")[0];
}
async function call(
  user: keyof typeof PWD,
  path: string,
  body?: unknown,
  method: string = body === undefined ? "GET" : "POST"
) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(jars[user] ? { Cookie: jars[user] } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json } as { status: number; json: Record<string, unknown> };
}

// ---------- мини-репортёр ----------
let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  OK   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

// ---------- разведка данных ----------
const liga2User = await db.user.findUniqueOrThrow({ where: { email: "liga2@ff21.ru" } });
const clubUser = await db.user.findUniqueOrThrow({ where: { email: "club@ff21.ru" } });
const leagueA = liga2User.leagueId!; // Премьер-лига
const clubId = clubUser.clubId!; // ФК «Урняк»

const leagueBrow = await db.league.findFirst({ where: { id: { not: leagueA } } });
const leagueB = leagueBrow!.id;

const matchA = await db.match.findFirst({
  where: { stage: { season: { leagueId: leagueA } } },
  select: { id: true },
});
const matchB = await db.match.findFirst({
  where: { stage: { season: { leagueId: leagueB } } },
  select: { id: true },
});
const seasonB = await db.season.findFirst({ where: { leagueId: leagueB }, select: { id: true } });
const seasonA = await db.season.findFirst({ where: { leagueId: leagueA }, select: { id: true } });

// заявка чужой лиги (не клуб Урняка — чтобы и клубный скоуп не спасал)
const regB = await db.registration.findFirst({
  where: { season: { leagueId: leagueB }, team: { clubId: { not: clubId } } },
  select: { id: true },
});
// своя заявка скоуп-админа (лига A) и клуба Урняк
const regA = await db.registration.findFirst({
  where: { season: { leagueId: leagueA }, team: { clubId } },
  select: { id: true, number: true },
});
// чужая персона: заявки есть, но НИ ОДНОЙ в клубе Урняк
const alienRow = await db.registration.findFirst({
  where: { team: { clubId: { not: clubId } }, person: { registrations: { none: { team: { clubId } } } } },
  select: { personId: true },
});
// своя персона клуба
const ownRow = await db.registration.findFirst({
  where: { team: { clubId } },
  select: { personId: true, person: { select: { middleName: true } } },
});

let suspB = await db.suspension.findFirst({ where: { season: { leagueId: leagueB } }, select: { id: true } });
const tempSuspIds: string[] = [];

console.log("=== SMOKE-SEC42: подготовка данных");
console.log(`  leagueA=${leagueA.slice(-6)} leagueB=${leagueB.slice(-6)} matchA=${matchA?.id.slice(-6) ?? "—"} matchB=${matchB?.id.slice(-6) ?? "—"}`);
console.log(`  regB=${regB?.id.slice(-6) ?? "—"} regA=${regA?.id.slice(-6) ?? "—"} alien=${alienRow?.personId.slice(-6) ?? "—"} own=${ownRow?.personId.slice(-6) ?? "—"} suspB=${suspB?.id.slice(-6) ?? "—"}`);

// ---------- логины ----------
for (const u of Object.keys(PWD) as (keyof typeof PWD)[]) await login(u);
console.log("=== логины: OK (5 пользователей)");

// ================= T1: GET протокола матча =================
console.log("=== T1 · GET протокола матча (BOLA)");
if (matchB) {
  const r = await call("liga2", `/api/admin/matches/${matchB.id}`);
  check(`скоуп-админ A читает протокол матча лиги B → 403 (получено ${r.status})`, r.status === 403);
} else check("матч лиги B найден в дев-БД", false, "нет матчей другой лиги");
if (matchA) {
  const r = await call("liga2", `/api/admin/matches/${matchA.id}`);
  check(`скоуп-админ A читает свой матч → 200 (получено ${r.status})`, r.status === 200);
} else check("матч лиги A найден", false);

// ================= T1r: судья =================
console.log("=== T1r · судья (регресс)");
if (matchA) {
  const r = await call("sudya", `/api/admin/matches/${matchA.id}`);
  // судья сидя@ привязан к персоне; если матч не его — 403 «не назначен»
  check(`судья читает неназначенный матч → 403 (получено ${r.status})`, r.status === 403);
}

// ================= T2: заявки =================
console.log("=== T2 · заявки (PATCH no-op)");
if (regB) {
  const r = await call("liga2", `/api/admin/registrations/${regB.id}`, { number: 7 }, "PATCH");
  check(`скоуп-админ A правит заявку лиги B → 403 (получено ${r.status})`, r.status === 403);
} else check("заявка лиги B найдена", false);
if (regA) {
  const r = await call("liga2", `/api/admin/registrations/${regA.id}`, { number: regA.number }, "PATCH");
  check(`скоуп-админ A правит свою заявку (no-op) → 200 (получено ${r.status})`, r.status === 200);
}
if (regA) {
  const r = await call("club", `/api/admin/registrations/${regA.id}`, { number: regA.number }, "PATCH");
  check(`CLUB_ADMIN правит заявку своего клуба (no-op) → 200 (получено ${r.status})`, r.status === 200);
}

// ================= T3: КДК =================
console.log("=== T3 · КДК (create/update/delete)");
if (!suspB && seasonB && alienRow) {
  // сверх-админ создаёт временную КДК в лиге B для негативного теста
  const c = await call("admin", "/api/admin/suspensions", {
    action: "create", personId: alienRow.personId, seasonId: seasonB.id, matchesTotal: 1, reason: "sec42-temp",
  });
  if (c.status === 200) {
    suspB = { id: String((c.json.suspension as Record<string, unknown>).id) };
    tempSuspIds.push(suspB.id);
  }
}
if (suspB) {
  const u = await call("liga2", "/api/admin/suspensions", { action: "update", id: suspB.id, reason: "взлом?" });
  check(`скоуп-админ A меняет КДК лиги B → 403 (получено ${u.status})`, u.status === 403);
  const d = await call("liga2", "/api/admin/suspensions", { action: "delete", id: suspB.id });
  check(`скоуп-админ A удаляет КДК лиги B → 403 (получено ${d.status})`, d.status === 403);
} else check("КДК лиги B найдена/создана", false);
if (seasonB && alienRow) {
  const c = await call("liga2", "/api/admin/suspensions", {
    action: "create", personId: alienRow.personId, seasonId: seasonB.id, matchesTotal: 1,
  });
  check(`скоуп-админ A создаёт КДК в сезоне лиги B → 403 (получено ${c.status})`, c.status === 403);
  if (c.status === 200) {
    // страховка: если вдруг создалось (не должно) — убираем
    const sid = (c.json.suspension as Record<string, unknown>)?.id;
    if (sid) tempSuspIds.push(String(sid));
  }
}

// ================= T4: контент сайта =================
console.log("=== T4 · контент сайта (оператор vs супер)");
{
  const g = await call("liga", "/api/admin/banners");
  check(`оператор: GET banners → 403 (получено ${g.status})`, g.status === 403);
  const p = await call("liga", "/api/admin/banners", { title: "sec42", placement: "TOP" });
  check(`оператор: POST banners → 403 (получено ${p.status})`, p.status === 403);
  const s = await call("liga", "/api/admin/statblocks");
  check(`оператор: GET statblocks → 403 (получено ${s.status})`, s.status === 403);
  const f = await call("liga", "/api/admin/formats");
  check(`оператор: GET formats → 403 (получено ${f.status})`, f.status === 403);
  const m = await call("liga", "/api/admin/merge?type=person&q=%D0%B0");
  check(`оператор: GET merge → 403 (получено ${m.status})`, m.status === 403);
  const a = await call("admin", "/api/admin/banners");
  check(`супер: GET banners → 200 (получено ${a.status})`, a.status === 200);
}

// ================= T5: персоны =================
console.log("=== T5 · персоны (CLUB_ADMIN)");
if (alienRow) {
  const r = await call("club", `/api/admin/persons/${alienRow.personId}`, { middleName: null }, "PATCH");
  check(`CLUB_ADMIN правит чужую персону → 403 (получено ${r.status})`, r.status === 403);
} else check("чужая персона найдена", false);
if (ownRow) {
  const r = await call("club", `/api/admin/persons/${ownRow.personId}`, { middleName: ownRow.person.middleName ?? null }, "PATCH");
  check(`CLUB_ADMIN правит свою персону (no-op) → 200 (получено ${r.status})`, r.status === 200);
  const g = await call("club", `/api/admin/persons/${ownRow.personId}`, { roles: ["PLAYER"] }, "PATCH");
  check(`CLUB_ADMIN меняет roles своей персоны → 403 (получено ${g.status})`, g.status === 403);
}

// ================= T6: дашборд =================
console.log("=== T6 · дашборд (scope по роли + аудит)");
{
  const c = await call("club", "/api/admin/dashboard");
  const ra = (c.json.recentAudit as unknown[]) ?? [1];
  check(`CLUB_ADMIN: дашборд 200, recentAudit пуст (получено ${c.status}, записей ${ra.length})`, c.status === 200 && ra.length === 0);
  const s = await call("sudya", "/api/admin/dashboard");
  const ra2 = (s.json.recentAudit as unknown[]) ?? [1];
  check(`судья: дашборд 200, recentAudit пуст (получено ${s.status}, записей ${ra2.length})`, s.status === 200 && ra2.length === 0);
  const l = await call("liga2", "/api/admin/dashboard");
  const ra3 = (l.json.recentAudit as unknown[]) ?? [1];
  check(`скоуп-админ: дашборд 200, recentAudit пуст (записей ${ra3.length})`, l.status === 200 && ra3.length === 0);
  const a = await call("admin", "/api/admin/dashboard");
  const ra4 = a.json.recentAudit;
  check(`супер: recentAudit — массив (${Array.isArray(ra4) ? `${ra4.length} записей` : "не массив"})`, Array.isArray(ra4));
  if (Array.isArray(ra4) && ra4.length === 0) console.log("  note: журнал в дев-БД пуст — проверка только на тип");
}

// ================= T7: медиа =================
console.log("=== T7 · медиа (DELETE)");
{
  const c = await call("club", "/api/admin/media?url=/api/media/sec42-nonexistent", undefined, "DELETE");
  check(`CLUB_ADMIN: DELETE media → 403 (получено ${c.status})`, c.status === 403);
  const l = await call("liga", "/api/admin/media?url=/api/media/sec42-nonexistent", undefined, "DELETE");
  check(`оператор: DELETE media → 403 (получено ${l.status})`, l.status === 403);
  const a = await call("admin", "/api/admin/media?url=/api/media/sec42-nonexistent", undefined, "DELETE");
  check(`супер: DELETE несуществующего → 404, не 403 (получено ${a.status})`, a.status === 404);
}

// ================= T8: позитив КДК =================
console.log("=== T8 · КДК позитив (законные потоки живы)");
if (seasonA && ownRow) {
  const c = await call("liga2", "/api/admin/suspensions", {
    action: "create", personId: ownRow.personId, seasonId: seasonA.id, matchesTotal: 1, reason: "sec42-own-league",
  });
  check(`скоуп-админ A создаёт КДК в СВОЁМ сезоне → 200 (получено ${c.status})`, c.status === 200);
  if (c.status === 200) {
    const sid = String((c.json.suspension as Record<string, unknown>).id);
    tempSuspIds.push(sid);
    const u = await call("liga2", "/api/admin/suspensions", { action: "update", id: sid, matchesTotal: 2 });
    check(`скоуп-админ A правит свою КДК → 200 (получено ${u.status})`, u.status === 200);
    const d = await call("liga2", "/api/admin/suspensions", { action: "delete", id: sid });
    check(`скоуп-админ A удаляет свою КДК → 200 (получено ${d.status})`, d.status === 200);
    if (d.status !== 200) tempSuspIds.push(sid); // не удалилось — почистит супер
  }
}
if (suspB && tempSuspIds.includes(suspB.id)) {
  const d = await call("admin", "/api/admin/suspensions", { action: "delete", id: suspB.id });
  check(`супер удаляет временную КДК лиги B → 200 (получено ${d.status})`, d.status === 200);
}

// ---------- страховочная уборка (напрямую в БД, дев-песочница) ----------
for (const id of tempSuspIds) {
  await db.suspension.deleteMany({ where: { id } });
}

console.log("=== ИТОГО SMOKE-SEC42:", `${pass} OK / ${fail} FAIL`);
await db.$disconnect();
process.exit(fail > 0 ? 1 : 0);
