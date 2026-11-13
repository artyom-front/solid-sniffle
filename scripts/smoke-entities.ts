// Дымовой тест новых эндпоинтов состава/удаления (Task 19):
// /api/admin/teams/[id], /api/admin/persons/[id], /api/admin/registrations*,
// каскадное удаление и структурированные 409.
// Запуск: bun scripts/smoke-entities.ts [BASE_URL]

const SBASE = process.argv[2] || "http://localhost:3000";
const API = `${SBASE}/api`;

let scookie = "";
let pass = 0, fail = 0;
function scheck(name: string, ok: boolean, extra = "") {
  if (ok) { pass++; console.log(`(pass) ${name}`); }
  else { fail++; console.log(`(FAIL) ${name} ${extra}`); }
}

async function sapi(path: string, body?: unknown, method = "GET") {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(scookie ? { cookie: scookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = r.headers.get("set-cookie");
  if (setCookie) scookie = setCookie.split(";")[0];
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

async function smokeMain() {
  // ---------- вход ----------
  let r = await sapi("/auth/login", { email: "admin@ff21.ru", password: "admin123" }, "POST");
  scheck("Вход супер-админа", r.status === 200);

  // ---------- подготовка: лига+сезон+команда+персоны ----------
  r = await sapi("/admin/leagues", { name: `SMOKE-ЛИГА ${Date.now()}`, format: "F11" }, "POST");
  const leagueId = r.j?.league?.id;
  scheck("Лига создана", !!leagueId);

  r = await sapi("/admin/seasons", { leagueId, name: "Смоук-сезон", startDate: "2026-09-01", isCurrent: false }, "POST");
  const seasonId = r.j?.season?.id;
  scheck("Сезон создан", !!seasonId);

  r = await sapi("/admin/teams", { name: `SMOKE-КОМАНДА ${Date.now()}` }, "POST");
  const teamId = r.j?.team?.id;
  scheck("Команда создана", !!teamId);

  const persons: string[] = [];
  for (let i = 0; i < 3; i++) {
    r = await sapi("/admin/persons", { firstName: "Смоук", lastName: `Тестов ${Date.now()} ${i}`, roles: ["PLAYER"], force: true }, "POST");
    persons.push(r.j?.person?.id);
  }
  scheck("Персоны созданы (3)", persons.every(Boolean));

  // заявки: 2 активных + 1 закрытая
  r = await sapi("/admin/registrations", { personId: persons[0], teamId, seasonId, number: 10, role: "PLAYER" }, "POST");
  scheck("Заявка 1 оформлена", r.status === 200 && !!r.j?.registration?.id);
  const reg1 = r.j?.registration?.id;
  r = await sapi("/admin/registrations", { personId: persons[1], teamId, seasonId, number: 7, role: "COACH" }, "POST");
  scheck("Заявка 2 (тренер) оформлена", r.status === 200);
  const reg2 = r.j?.registration?.id;
  r = await sapi("/admin/registrations", { personId: persons[2], teamId, seasonId, number: 99 }, "POST");
  const reg3 = r.j?.registration?.id;
  scheck("Заявка 3 оформлена", r.status === 200);

  // ---------- GET /api/admin/registrations?seasonId ----------
  r = await sapi(`/admin/registrations?seasonId=${seasonId}`);
  scheck("Список заявок сезона", r.status === 200 && Array.isArray(r.j?.registrations) && r.j.registrations.length >= 3, JSON.stringify(r.j).slice(0, 200));

  // ---------- PATCH /api/admin/registrations/[id]: номер+роль ----------
  r = await sapi(`/admin/registrations/${reg1}`, { number: 11, role: "PLAYER" }, "PATCH");
  scheck("Правка номера заявки (10→11)", r.status === 200 && r.j?.registration?.number === 11);

  // ---------- PATCH: отзаявка (endDate) ----------
  r = await sapi(`/admin/registrations/${reg3}`, { endDate: new Date().toISOString() }, "PATCH");
  scheck("Отзаявка закрывает заявку", r.status === 200 && !!r.j?.registration?.endDate && r.j?.registration?.status === "ENDED");

  // ---------- PATCH: вернуть в заявку ----------
  r = await sapi(`/admin/registrations/${reg3}`, { status: "ACTIVE" }, "PATCH");
  scheck("Возврат в заявку (endDate=null)", r.status === 200 && r.j?.registration?.endDate === null);

  // ---------- GET /api/admin/teams/[id]: карточка ----------
  r = await sapi(`/admin/teams/${teamId}`);
  scheck("Карточка команды: состав", r.status === 200 && r.j?.registrations?.length === 3);
  scheck("Карточка команды: зависимости", r.j?.team?.deleteBlockers?.registrations === 3 && r.j?.team?.deleteBlockers?.matches === 0 && r.j?.team?.canDelete === true);

  // ---------- DELETE команды без каскада: структурированный 409 ----------
  r = await sapi(`/admin/teams/${teamId}`, {}, "DELETE");
  scheck("409 TEAM_HAS_REGISTRATIONS (структура)", r.status === 409 && r.j?.code === "TEAM_HAS_REGISTRATIONS" && r.j?.cascadeAllowed === true, JSON.stringify(r.j).slice(0, 300));

  // ---------- DELETE персоны без каскада: 409 ----------
  r = await sapi(`/admin/persons/${persons[0]}`, {}, "DELETE");
  scheck("409 PERSON_HAS_REGISTRATIONS (структура)", r.status === 409 && r.j?.code === "PERSON_HAS_REGISTRATIONS" && r.j?.cascadeAllowed === true, JSON.stringify(r.j).slice(0, 300));

  // ---------- GET /api/admin/persons/[id]: карточка ----------
  r = await sapi(`/admin/persons/${persons[0]}`);
  scheck("Карточка персоны: заявки", r.status === 200 && r.j?.registrations?.length === 1);
  scheck("Карточка персоны: статистика", typeof r.j?.stats?.goals === "number");

  // ---------- каскадное удаление персоны с заявкой ----------
  r = await sapi(`/admin/persons/${persons[2]}`, { cascade: true }, "DELETE");
  scheck("Каскадное удаление персоны + 1 заявка", r.status === 200);
  r = await sapi(`/admin/registrations?seasonId=${seasonId}`);
  scheck("Заявка удалённой персоны исчезла", (r.j?.registrations ?? []).every((x: { personId: string}) => x.personId !== persons[2]));

  // ---------- каскадное удаление команды с заявками ----------
  r = await sapi(`/admin/teams/${teamId}`, { cascade: true }, "DELETE");
  scheck("Каскадное удаление команды + 2 заявки", r.status === 200);
  r = await sapi(`/admin/registrations?seasonId=${seasonId}`);
  scheck("Заявки команды исчезли", (r.j?.registrations ?? []).every((x: { teamId: string }) => x.teamId !== teamId));

  // ---------- DELETE заявки напрямую (регрессия REGISTRATION_HAS_LINEUPS не нужна — составов нет) ----------
  r = await sapi("/admin/registrations", { personId: persons[1], teamId, seasonId }, "POST"); // команда удалена — ожидаем 404
  scheck("Заявка в удалённую команду → 404", r.status === 404);

  // ---------- чистка ----------
  for (const pid of [persons[0], persons[1]]) {
    await sapi(`/admin/persons/${pid}`, { cascade: true }, "DELETE");
  }
  await sapi(`/admin/seasons/${seasonId}`, null, "DELETE");
  await sapi(`/admin/leagues/${leagueId}`, null, "DELETE");
  r = await sapi("/admin/teams");
  scheck("Чистка: смоук-команды не осталось", (r.j?.teams ?? []).every((t: { id: string }) => t.id !== teamId));

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

void smokeMain().catch((e) => { console.error(e); process.exit(1); });
