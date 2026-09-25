// Дымовой тест релиза v1.0.20 «реклама + хронология + составы»:
//  1. Баннеры: TOP/BOTTOM/BACKGROUND через API, рендер на сайте (SSR HTML),
//     маркировка «Реклама», настройки масштаба/кегля.
//  2. Хронология: «Перерыв» после 45+X, маркеры завершённого матча.
//  3. Бригада: одна роль на персону (главный ≠ сам себе помощник).
//  4. Составы: starters/bench через action=lineup, публичные данные.
//  5. Импорт: однофамилец без ДР/отчества → отдельный профиль.
// Запуск: bun scripts/smoke-v1020.ts [BASE_URL]

const SB20 = process.argv[2] || "http://localhost:3000";
const AP20 = `${SB20}/api`;

let sc20 = "";
let ps20 = 0, fl20 = 0;
function sck20(name: string, ok: boolean, extra = "") {
  if (ok) { ps20++; console.log(`(pass) ${name}`); }
  else { fl20++; console.log(`(FAIL) ${name} ${extra}`); }
}

async function sp20(path: string, body?: unknown, method = "GET") {
  const hasBody = body !== undefined && method !== "GET" && method !== "HEAD";
  const r = await fetch(`${AP20}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(sc20 ? { cookie: sc20 } : {}) },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  const setCookie = r.headers.get("set-cookie");
  if (setCookie) sc20 = setCookie.split(";")[0];
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

/** крошечный PNG 1×1 для загрузки в медиатеку */
function tinyPng(): Blob {
  const bytes = Uint8Array.from(atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  ), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

async function uploadMedia(): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", tinyPng(), "smoke-banner.png");
  const r = await fetch(`${AP20}/admin/media`, { method: "POST", headers: sc20 ? { cookie: sc20 } : {}, body: fd });
  const j = await r.json().catch(() => ({}));
  return r.ok ? (j?.url ?? null) : null;
}

async function main() {
  // ---------- вход ----------
  let r = await sp20("/auth/login", { email: "admin@ff21.ru", password: "admin123" }, "POST");
  sck20("Вход супер-админа", r.status === 200);

  // ---------- загрузка картинки ----------
  const imageUrl = await uploadMedia();
  sck20("Картинка загружена в медиатеку", !!imageUrl);

  // ---------- баннеры: TOP / BOTTOM / BACKGROUND ----------
  const stamp = Date.now();
  r = await sp20("/admin/banners", { title: `SMOKE-TOP ${stamp}`, placement: "TOP", imageUrl, linkUrl: "https://example.com", imageFit: "cover", imagePos: "center", markSize: 8, markOpacity: 60, isActive: true }, "POST");
  const topId = r.j?.banner?.id;
  sck20("Баннер TOP создан (одним нажатием: текст+фото сразу)", !!topId && r.j?.banner?.imageUrl === imageUrl);

  r = await sp20("/admin/banners", { title: `SMOKE-BOTTOM ${stamp}`, placement: "BOTTOM", imageUrl, markSize: 10, markOpacity: 80 }, "POST");
  const bottomId = r.j?.banner?.id;
  sck20("Баннер BOTTOM создан", !!bottomId);

  r = await sp20("/admin/banners", { title: `SMOKE-BG ${stamp}`, placement: "BACKGROUND", imageUrl, linkUrl: "https://example.com", imageFit: "cover" }, "POST");
  const bgId = r.j?.banner?.id;
  sck20("Фоновый баннер BACKGROUND создан", !!bgId);

  r = await sp20("/admin/banners", { title: "x", placement: "BACKGROUND" }, "POST");
  sck20("BACKGROUND без картинки → 422", r.status === 422, `got ${r.status}`);

  r = await sp20("/admin/banners", { title: "x", placement: "TOP", markSize: 40 }, "POST");
  sck20("Кегль маркировки вне 6–16 → 422", r.status === 422, `got ${r.status}`);

  // ---------- рендер на публичном сайте (SSR) ----------
  const html = await (await fetch(`${SB20}/`)).text();
  sck20("Главная: колонка 800px (нет 1440)", html.includes("max-w-[800px]") && !html.includes("max-w-[1440px]"));
  sck20("Главная: фоновый слой с маркировкой", html.includes("fixed inset-0 z-0") && (html.match(/Реклама/g) ?? []).length >= 2);
  sck20("Главная: нижний баннер отрендерен", html.includes(`alt="SMOKE-BOTTOM ${stamp}"`));
  sck20("Главная: маркировка с кеглем 10px (BOTTOM)", html.includes('style="font-size:10px'));

  // ---------- находим матч с событиями ----------
  const day = await sp20("/public/matches/day?date=all");
  const allMatches = (day.j?.leagues ?? []).flatMap((l: { matches: unknown[] }) => l.matches) as { id: string; status: string; homeTeam: { id: string }; awayTeam: { id: string } }[];
  sck20("Матчи в системе есть", allMatches.length > 0);
  const someMatch = allMatches.find((m) => m.status === "SCHEDULED" || m.status === "LIVE") ?? allMatches[0];

  // ---------- бригада: одна роль на персону ----------
  const referees = await sp20("/public/referees");
  const refList = (referees.j?.referees ?? []) as { personId: string; name: string }[];
  const refPerson = refList[0];
  if (refPerson && someMatch) {
    const savedDetail = await sp20(`/admin/matches/${someMatch.id}`);
    const savedOfficials = (savedDetail.j?.officials ?? []) as { role: string; person: { id: string } }[];
    const savedRefereeId = savedDetail.j?.match?.referee?.id ?? null;

    // главный судья + он же помощник → 422
    r = await sp20(`/admin/matches/${someMatch.id}`, { officials: [
      { role: "REFEREE", personId: refPerson.personId },
      { role: "ASSISTANT_REFEREE", personId: refPerson.personId },
    ] }, "PATCH");
    sck20("Главный судья ≠ сам себе помощник (422)", r.status === 422, `got ${r.status} ${JSON.stringify(r.j).slice(0, 120)}`);

    // чистая бригада: главный + ДРУГОЙ помощник → ок
    const ref2 = refList[1];
    if (ref2) {
      r = await sp20(`/admin/matches/${someMatch.id}`, { officials: [
        { role: "REFEREE", personId: refPerson.personId },
        { role: "ASSISTANT_REFEREE", personId: ref2.personId },
      ] }, "PATCH");
      sck20("Бригада главный+помощник (разные люди) сохраняется", r.status === 200, `got ${r.status} ${JSON.stringify(r.j).slice(0, 120)}`);
      // бригада видна в публичных данных матча
      const pub = await sp20(`/public/matches/${someMatch.id}`);
      const officials = pub.j?.match?.officials ?? [];
      sck20("Публично: бригада с ролями видна", officials.length >= 2, JSON.stringify(officials).slice(0, 120));
      // возвращаем исходную бригаду (смоук не должен портить демо-данные)
      const restore = savedOfficials.map((o) => ({ role: o.role, personId: o.person.id }));
      if (savedRefereeId && !restore.some((o: { role: string }) => o.role === "REFEREE")) {
        restore.unshift({ role: "REFEREE", personId: savedRefereeId });
      }
      await sp20(`/admin/matches/${someMatch.id}`, { officials: restore, refereeId: savedRefereeId }, "PATCH");
    }
  }

  // ---------- составы: starters/bench ----------
  if (someMatch && someMatch.status === "SCHEDULED") {
    const detail = await sp20(`/admin/matches/${someMatch.id}`);
    const homeTeam = detail.j?.match?.homeTeam;
    const eligibleHome = (detail.j?.eligible?.home ?? []) as { personId: string; name: string; suspension: unknown }[];
    const free = eligibleHome.filter((p) => !p.suspension);
    if (homeTeam && free.length >= 2) {
      const personIds = free.slice(0, 4).map((p) => p.personId);
      const starters = personIds.slice(0, 2);
      r = await sp20(`/admin/matches/${someMatch.id}`, { action: "lineup", teamId: homeTeam.id, personIds, starters }, "POST");
      sck20("Подача состава со стартовыми (4 в протоколе, 2 в старте)", r.status === 200 && r.j?.starters === 2 && r.j?.bench === 2, JSON.stringify(r.j).slice(0, 120));
      const pub = await sp20(`/public/matches/${someMatch.id}`);
      const lineups = pub.j?.match?.lineups ?? [];
      const st = lineups.filter((l: { teamId: string; isStarter: boolean }) => l.teamId === homeTeam.id && l.isStarter);
      const bn = lineups.filter((l: { teamId: string; isStarter: boolean }) => l.teamId === homeTeam.id && !l.isStarter);
      sck20("Публично: 2 стартовых и 2 запасных", st.length === 2 && bn.length === 2, `st=${st.length} bn=${bn.length}`);
      // откат: возвращаем пустой состав (как было у незаполненного матча)
      await sp20(`/admin/matches/${someMatch.id}`, { action: "lineup", teamId: homeTeam.id, personIds: [] }, "POST");
    }
  }

  // ---------- хронология: 45+X и маркеры (юнит-уровень уже покрыт,
  //  здесь — статус-кво рендера страницы матча) ----------
  if (someMatch) {
    const page = await (await fetch(`${SB20}/match/${someMatch.id}`)).text();
    sck20("Страница матча: рендерится", page.includes("id=\"__next\"") || page.length > 5000);
  }

  // ---------- импорт: однофамилец без ДР → отдельный профиль ----------
  const teams = await sp20("/admin/teams");
  const teamA = (teams.j?.teams ?? [])[0] as { id: string; name: string } | undefined;
  const teamB = (teams.j?.teams ?? [])[1] as { id: string; name: string } | undefined;
  const someMatchPub = someMatch ? await sp20(`/public/matches/${someMatch.id}`) : null;
  const seasonId = someMatchPub?.j?.match?.season?.id as string | undefined;
  if (teamA && seasonId) {
    const surname = `Однофамилец${stamp}`;
    // первый профиль — в команде A
    r = await sp20("/admin/import", { entity: "players", csv: `Фамилия;Имя\n${surname};Первый`, teamId: teamA.id, seasonId, dryRun: false }, "POST");
    sck20("Импорт 1: профиль создан в команде A", (r.j?.rows ?? []).some((x: { status: string }) => x.status === "created"), JSON.stringify(r.j).slice(0, 200));
    // вторая команда, тот же ФИО без ДР/отчества → отдельный профиль, не склейка
    if (teamB) {
      r = await sp20("/admin/import", { entity: "players", csv: `Фамилия;Имя\n${surname};Первый`, teamId: teamB.id, seasonId, dryRun: false }, "POST");
      const row = (r.j?.rows ?? [])[0] as { status?: string; message?: string } | undefined;
      sck20(
        "Импорт 2: однофамилец — отдельный профиль (не склейка с командой A)",
        row?.status === "created" && (row.message ?? "").includes("однофамилец"),
        JSON.stringify(r.j).slice(0, 240)
      );
    }
  }

  // ---------- уборка ----------
  for (const id of [topId, bottomId, bgId].filter(Boolean) as string[]) {
    await sp20(`/admin/banners/${id}`, null, "DELETE");
  }
  const left = await sp20("/admin/banners");
  const smokeLeft = (left.j?.banners ?? []).filter((b: { title: string }) => b.title.includes("SMOKE-"));
  sck20("Тестовые баннеры удалены", smokeLeft.length === 0, `осталось ${smokeLeft.length}`);

  console.log(`\n=== SMOKE v1.0.20: ${ps20} pass, ${fl20} fail ===`);
  process.exit(fl20 > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
