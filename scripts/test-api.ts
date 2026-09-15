// Сквозной тест ключевых бизнес-правил PRD через API
// BASE можно переопределить: API_URL=http://localhost:3100 bun scripts/test-api.ts
const BASE = process.env.API_URL || "http://localhost:3000";
let cookie = "";

async function api(path, body, method = "POST") {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = r.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
async function get(path) {
  const r = await fetch(BASE + path, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}

let passed = 0, failed = 0;
function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}

(async () => {
  console.log("=== 1. Аутентификация (M1) ===");
  let r = await api("/api/auth/login", { email: "admin@ff21.ru", password: "wrong" });
  check("Неверный пароль отклоняется (401)", r.status === 401);
  r = await api("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
  check("Вход супер-админа", r.status === 200 && r.j.role === "SUPER_ADMIN");

  console.log("=== 2. Обзор и данные ===");
  const overview = (await get("/api/public/overview")).j;
  const season1 = overview.leagues.find((l) => l.format === "F11").seasons[0];
  const season2 = overview.leagues.find((l) => l.format === "FUTSAL").seasons[0];
  check("4 лиги (все форматы)", overview.leagues.length === 4);
  check("Матчи в сезоне есть", overview.stats.matches > 20);

  console.log("=== 3. Epic 2: Технические поражения ===");
  const matches1 = (await get(`/api/public/matches?seasonId=${season1.id}`)).j.matches;
  const wo = matches1.find((m) => m.status === "WALKOVER" && m.walkoverType === "HOME");
  check("WO_HOME существует", !!wo);
  check("WO_HOME: счёт null (COALESCE на чтении)", wo && wo.homeScore === null);
  const matches2 = (await get(`/api/public/matches?seasonId=${season2.id}`)).j.matches;
  const woBoth = matches2.find((m) => m.walkoverType === "BOTH");
  check("WO_BOTH в мини-футболе существует", !!woBoth);

  const standings1 = (await get(`/api/public/standings?seasonId=${season1.id}`)).j.standings;
  // WO-жертва и тех-победитель — динамически из матчей (не зависит от конкретного сида)
  const woTeam = standings1.find((t) => t.teamId === wo.homeTeam.id);
  const woRival = standings1.find((t) => t.teamId === wo.awayTeam.id);
  check(`${wo.homeTeam.name} (неявка): ТП=1`, woTeam && woTeam.techLosses === 1);
  check(`${wo.homeTeam.name}: счёт включает регламентные 0:3 (GA≥3)`, woTeam && woTeam.goalsAgainst >= 3);
  check(`${wo.awayTeam.name}: тех. победа (тВ) в форме`, woRival && woRival.form.includes("w") && woRival.techWins === 1);

  // Инвариант: голы WO не в статистике — WO матч не имеет событий
  const woDetail = (await get(`/api/public/matches/${wo.id}`)).j.match;
  check("WO-матч: события и составы очищены", woDetail.events.length === 0 && woDetail.lineups.length === 0);

  console.log("=== 4. Epic 1: Дисквалификации ===");
  const susp = (await get(`/api/public/suspensions?seasonId=${season1.id}`)).j.suspensions;
  const active = susp.filter((s) => s.isActive);
  check("Есть активные дисквалификации", active.length >= 2, `(${active.length})`);
  check("Красная карточка → AUTO_RED бан", active.some((s) => s.source === "AUTO_RED"));
  check("Накопление ЖК → AUTO_YELLOW бан", active.some((s) => s.source === "AUTO_YELLOW"));

  console.log("=== 5. Инвариант блокировки: судейский протокол ===");
  // предстоящий матч с участием команды дисквалифицированного игрока
  const upcoming = matches1.filter((m) => m.status === "SCHEDULED").sort((a, b) => a.round - b.round);
  const suspendedPlayer = active.find(
    (s) => s.team && upcoming.some((m) => m.homeTeam.id === s.team.id || m.awayTeam.id === s.team.id)
  ) ?? active[0];
  const target = upcoming.find(
    (m) => suspendedPlayer.team && (m.homeTeam.id === suspendedPlayer.team.id || m.awayTeam.id === suspendedPlayer.team.id)
  ) ?? upcoming[0];
  console.log(`  Матч: ${target.homeTeam.name} — ${target.awayTeam.name} (${target.round} тур)`);
  console.log(`  Дисквалифицирован: ${suspendedPlayer.person.name} (${suspendedPlayer.team?.name})`);

  // 5a. Событие от дисквалифицированного → 409
  r = await api(`/api/admin/matches/${target.id}`, {
    action: "event", minute: 10, type: "GOAL", personId: suspendedPlayer.person.id, teamId: suspendedPlayer.team.id,
  });
  check("Событие от дисквалифицированного игрока блокируется (409)", r.status === 409, JSON.stringify(r.j));

  // 5b. Состав с дисквалифицированным → 409
  r = await api(`/api/admin/matches/${target.id}`, {
    action: "lineup", teamId: suspendedPlayer.team.id, personIds: [suspendedPlayer.person.id],
  });
  check("Заявка состава с дисквалифицированным блокируется (409)", r.status === 409, JSON.stringify(r.j));

  // 5c. Данные протокола: флаги suspend
  const proto = (await get(`/api/admin/matches/${target.id}`)).j;
  const el = [...proto.eligible.home, ...proto.eligible.away];
  check("Список eligible помечает дисквалифицированных", el.some((p) => p.suspension));

  console.log("=== 6. Epic 3: Заявки и валидация по дате ===");
  // 6a. Событие от игрока за чужую команду → 409
  const homePlayer = proto.eligible.home.find((p) => !p.suspension);
  const awayTeamId = proto.match.awayTeam.id;
  r = await api(`/api/admin/matches/${target.id}`, {
    action: "event", minute: 5, type: "YELLOW_CARD", personId: homePlayer.personId, teamId: awayTeamId,
  });
  check("Событие за чужую команду блокируется (409)", r.status === 409, JSON.stringify(r.j));

  // 6b. Валидное событие проходит (игрок хозяев, команда хозяев)
  r = await api(`/api/admin/matches/${target.id}`, { action: "event", minute: 15, type: "GOAL", personId: homePlayer.personId, teamId: proto.match.homeTeam.id });
  check("Валидный гол принимается", r.status === 200, JSON.stringify(r.j));
  const eventId = r.j.event?.id;

  // 6c. Повторная оценка судьи → 409
  const completed = matches1.find((m) => m.status === "COMPLETED" && m.referee);
  r = await api("/api/admin/ratings", { matchId: completed.id, rating: 5 });
  const r2 = await api("/api/admin/ratings", { matchId: completed.id, rating: 4 });
  check("Первый рейтинг принимается", r.status === 200);
  check("Повторная оценка отклоняется (409)", r2.status === 409, JSON.stringify(r2.j));

  // 6d. Удаляем тестовое событие и возвращаем матч в SCHEDULED
  if (eventId) {
    r = await api(`/api/admin/matches/${target.id}`, { action: "deleteEvent", eventId });
    check("Тестовое событие удалено", r.status === 200);
    r = await api(`/api/admin/matches/${target.id}`, { action: "reset" });
    check("Матч возвращён в SCHEDULED", r.status === 200);
  }

  console.log("=== 7. Завершение без судьи (инвариант §4) ===");
  const adminMatches = (await get(`/api/admin/matches?seasonId=${season1.id}`)).j.matches;
  const noReferee = adminMatches.find((m) => !m.referee && m.status === "SCHEDULED");
  if (noReferee) {
    r = await api(`/api/admin/matches/${noReferee.id}`, { action: "complete" });
    check("Завершение без судьи блокируется (422)", r.status === 422, JSON.stringify(r.j));
  } else {
    console.log("  (все матчи с судьями — пропуск)");
  }

  console.log("=== 8. RBAC: судья не лезет в чужой матч ===");
  await api("/api/auth/logout", {});
  r = await api("/api/auth/login", { email: "sudya@ff21.ru", password: "sudya123" });
  check("Вход судьи", r.status === 200 && r.j.role === "REFEREE");
  const refMatches = (await get(`/api/admin/matches?seasonId=${season1.id}`)).j.matches;
  check("Судья видит только свои матчи", refMatches.every((m) => m.referee && m.referee.name.includes("Смирнов")));
  // судья не может редактировать чужой матч
  const foreign = matches1.find((m) => m.status === "SCHEDULED" && (!m.referee || !m.referee.name.includes("Смирнов")));
  if (foreign) {
    r = await api(`/api/admin/matches/${foreign.id}`, { action: "event", minute: 1, type: "YELLOW_CARD", personId: "x", teamId: foreign.homeTeam.id });
    check("Редактирование чужого матча запрещено (403/422)", r.status === 403 || r.status === 422);
  }
  // судья не может в КДК
  r = await get("/api/admin/suspensions?seasonId=" + season1.id);
  check("Судью не пускает в КДК (403)", r.status === 403);
  // судья не может merge
  r = await api("/api/admin/merge", { fromId: "a", toId: "b" });
  check("Судью не пускает в Merge (403)", r.status === 403);

  console.log("=== 9. Epic 4: Merge профилей ===");
  await api("/api/auth/logout", {});
  await api("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
  const persons = (await get("/api/admin/merge?q=")).j.persons;
  const dup = persons.find((p) => p.name.includes("."));
  check("Дубликат профиля найден (Иванов И.)", !!dup);
  if (dup) {
    const canonical = persons.find((p) => p.name.replace(/ .*/, "") === dup.name.replace(/ .*/, "") && p.id !== dup.id && p.links.registrations > 0);
    check("Канонический профиль найден", !!canonical);
    if (canonical) {
      const before = dup.links;
      r = await api("/api/admin/merge", { fromId: dup.id, toId: canonical.id });
      check("Merge выполняется", r.status === 200, JSON.stringify(r.j));
      check("Связи перепривязаны", r.j.transferred && Object.values(r.j.transferred).some((v) => Number(v) > 0));
      void before;
    }
  }
  // дубль удалён?
  const persons2 = (await get("/api/admin/merge?q=")).j.persons;
  check("Дубликат удалён после merge", !persons2.some((p) => p.id === dup?.id));

  console.log("=== 10. Аудит (инвариант №4) ===");
  const audit = (await get("/api/admin/audit?limit=50")).j.logs;
  check("Журнал аудита ведётся", audit.length > 10);
  check("В журнале есть MERGE", audit.some((l) => l.action === "MERGE"));
  check("В журнале есть CREATE событий", audit.some((l) => l.action === "CREATE" && l.entity === "MatchEvent"));

  console.log(`\n=============================`);
  console.log(`ИТОГО: ✅ ${passed} прошло, ❌ ${failed} упало`);
  process.exit(failed > 0 ? 1 : 0);
})();
