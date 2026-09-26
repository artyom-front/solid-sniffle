// ============================================================
// Интеграционные тесты домена (запускаются против живого сервера):
//   API_URL=http://localhost:3000 bun test tests/integration
// Сначала прогоняется scripts/test-api.ts (36 проверок инвариантов
// PRD: дисквалификации, WO, merge, RBAC, аудит), затем —
// полный жизненный цикл 2FA (TOTP) и smoke SSR/SEO.
// Внимание: тесты мутируют БД — в CI поднимается чистая база + сид.
// ============================================================

import { beforeAll, beforeEach, afterAll, describe, expect, test } from "bun:test";
import { totpCode, currentStep } from "@/lib/totp";
import { db } from "@/lib/db";

const BASE = process.env.API_URL || "http://localhost:3000";
const RUNNING = BASE.includes("localhost");

let cookie = "";

async function call(path: string, body?: unknown, method = "POST", extraHeaders: Record<string, string> = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function get(path: string) {
  const res = await fetch(BASE + path, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Матчи мутируют данные — 2FA-тест сбрасывает своё состояние сам */
async function resetTotp(email: string) {
  await db.user.update({ where: { email }, data: { totpSecret: null, totpEnabled: false, totpLastStep: 0, recoveryCodes: null } });
}

describe.skipIf(!RUNNING)("Интеграция · бизнес-правила PRD (scripts/test-api.ts)", () => {
  test("36 проверок инвариантов проходят (auth, RBAC, WO, КДК, merge, аудит)", async () => {
    const proc = Bun.spawn(["bun", "scripts/test-api.ts"], {
      env: { ...process.env, API_URL: BASE },
      stdout: "pipe",
      stderr: "inherit",
    });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    console.log(out.split("\n").filter((l) => l.startsWith("===") || l.includes("ИТОГО")).join("\n"));
    expect(code).toBe(0);
    expect(out).toContain("0 упало");
  }, { timeout: 120_000 });
});

describe.skipIf(!RUNNING)("Интеграция · 2FA (TOTP): полный жизненный цикл", () => {
  const EMAIL = "admin@ff21.ru";
  const PASSWORD = "admin123";

  beforeAll(async () => {
    await resetTotp(EMAIL);
  });

  test("логин без 2FA выдаёт сессию", async () => {
    const { status, json } = await call("/api/auth/login", { email: EMAIL, password: PASSWORD });
    expect(status).toBe(200);
    expect(json.role).toBe("SUPER_ADMIN");
    expect(json.otpRequired).toBeUndefined();
  });

  test("setup выдаёт base32-секрет и QR data-URL (v1.0.28: только с паролем)", async () => {
    // без пароля — отказ (🟡-6: перегенерация не отключает защиту тихо)
    const denied = await call("/api/admin/totp", { action: "setup" });
    expect(denied.status).toBe(401);
    const { status, json } = await call("/api/admin/totp", { action: "setup", password: PASSWORD });
    expect(status).toBe(200);
    expect(json.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(json.otpauth).toContain("otpauth://totp/");
    expect(json.qr.startsWith("data:image/png")).toBe(true);
  });

  let secret = "";
  let recovery: string[] = [];

  test("enable подтверждается кодом, выдаёт 8 резервных кодов", async () => {
    const setup = await call("/api/admin/totp", { action: "setup", password: PASSWORD });
    secret = setup.json.secret;
    const { status, json } = await call("/api/admin/totp", { action: "enable", code: totpCode(secret, currentStep()) });
    expect(status).toBe(200);
    recovery = json.recoveryCodes;
    expect(recovery).toHaveLength(8);
  });

  test("логин при включённой 2FA не выдаёт сессию, возвращает челлендж", async () => {
    const { status, json } = await call("/api/auth/login", { email: EMAIL, password: PASSWORD });
    expect(status).toBe(200);
    expect(json.otpRequired).toBe(true);
    expect(json.challenge).toBeTruthy();
  });

  test("неверный код отклоняется (401)", async () => {
    const login = await call("/api/auth/login", { email: EMAIL, password: PASSWORD });
    const { status } = await call("/api/auth/otp", { challenge: login.json.challenge, code: "000000" });
    expect(status).toBe(401);
  });

  test("верный код выдаёт сессию; повтор того же кода отклоняется", async () => {
    const login = await call("/api/auth/login", { email: EMAIL, password: PASSWORD });
    const code = totpCode(secret, currentStep());
    const ok = await call("/api/auth/otp", { challenge: login.json.challenge, code });
    expect(ok.status).toBe(200);
    expect(ok.json.role).toBe("SUPER_ADMIN");

    const login2 = await call("/api/auth/login", { email: EMAIL, password: PASSWORD });
    const replay = await call("/api/auth/otp", { challenge: login2.json.challenge, code });
    expect(replay.status).toBe(401);
  });

  test("резервный код работает один раз", async () => {
    const login = await call("/api/auth/login", { email: EMAIL, password: PASSWORD });
    const ok = await call("/api/auth/otp", { challenge: login.json.challenge, recoveryCode: recovery[0] });
    expect(ok.status).toBe(200);

    const login2 = await call("/api/auth/login", { email: EMAIL, password: PASSWORD });
    const replay = await call("/api/auth/otp", { challenge: login2.json.challenge, recoveryCode: recovery[0] });
    expect(replay.status).toBe(401);
  });

  test("status отражает 7 оставшихся кодов; disable по паролю возвращает обычный вход", async () => {
    const st = await get("/api/admin/totp");
    expect(st.json.enabled).toBe(true);
    expect(st.json.recoveryLeft).toBe(7);

    const off = await call("/api/admin/totp", { action: "disable", password: PASSWORD });
    expect(off.status).toBe(200);
    expect(off.json.enabled).toBe(false);

    const login = await call("/api/auth/login", { email: EMAIL, password: PASSWORD });
    expect(login.json.otpRequired).toBeUndefined();
  });
});

describe.skipIf(!RUNNING)("Интеграция · безопасность и SSR/SEO", () => {
  test("security-заголовки присутствуют (CSP, X-Frame-Options, nosniff)", async () => {
    const res = await fetch(BASE + "/");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("CSRF: мутация с чужим Origin отклоняется (403)", async () => {
    const res = await fetch(BASE + "/api/admin/totp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: '{"action":"setup"}',
    });
    expect(res.status).toBe(403);
  });

  test("/admin и /api не индексируются (X-Robots-Tag)", async () => {
    expect((await fetch(BASE + "/admin")).headers.get("x-robots-tag")).toContain("noindex");
    expect((await fetch(BASE + "/api/health")).headers.get("x-robots-tag")).toContain("noindex");
  });

  test("robots.txt запрещает /admin и /api, отдаёт sitemap", async () => {
    const res = await fetch(BASE + "/robots.txt");
    const text = await res.text();
    expect(text).toContain("Disallow: /admin");
    expect(text).toContain("Disallow: /api/");
    expect(text).toContain("Sitemap:");
  });

  test("sitemap.xml содержит матча/лиги/команды", async () => {
    const text = await (await fetch(BASE + "/sitemap.xml")).text();
    expect(text).toContain("/match/");
    expect(text).toContain("/league/");
    expect(text).toContain("/team/");
  });

  test("SSR: HTML матча содержит JSON-LD и данные (SEO видит контент)", async () => {
    const day = await get("/api/public/matches/day?date=all");
    const matchId = day.json.leagues[0].matches[0].id;
    const html = await (await fetch(BASE + "/match/" + matchId)).text();
    expect(html).toContain("SportsEvent");
    expect(html).toContain("BreadcrumbList");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain("<title>");
    expect(html).toContain("Превью");
  });

  test("404 страница для несуществующих сущностей", async () => {
    const res = await fetch(BASE + "/match/nonexistent-id");
    expect(res.status).toBe(404);
    const html = await res.text();
    const notFoundMarked = html.includes("не найдена") || html.includes("не найден") || html.includes("404");
    expect(notFoundMarked).toBe(true);
  });
});

describe.skipIf(!RUNNING)("Интеграция · хотфикс v1.0.24 (аудит Task 27)", () => {
  const EMAIL = "admin@ff21.ru";
  const PASSWORD = "admin123";

  beforeAll(async () => {
    await call("/api/auth/login", { email: EMAIL, password: PASSWORD });
  });

  // 🟠-2 Stored XSS через Banner.linkUrl / imageUrl
  test("баннер: javascript:/data:/мусор в linkUrl и imageUrl отклоняются (анти-XSS)", async () => {
    const xss1 = await call("/api/admin/banners", { title: "XSS", placement: "TOP", linkUrl: "javascript:alert(document.cookie)" });
    expect(xss1.status).toBe(422);

    const xss2 = await call("/api/admin/banners", { title: "XSS", placement: "TOP", linkUrl: "JaVaScRiPt:alert(1)" });
    expect(xss2.status).toBe(422);

    const xss3 = await call("/api/admin/banners", { title: "XSS", placement: "TOP", imageUrl: "data:image/svg+xml,<svg onload=alert(1)>" });
    expect(xss3.status).toBe(422);

    const xss4 = await call("/api/admin/banners", { title: "XSS", placement: "TOP", linkUrl: "https://ok.example\njavascript:x" });
    expect(xss4.status).toBe(422);

    // легитимный https + путь сайта проходят; чистим за собой
    const ok = await call("/api/admin/banners", {
      title: "Юнит v1.0.24", placement: "TOP",
      linkUrl: "https://sportcity.example", imageUrl: "/api/media/abc123",
    });
    expect(ok.status).toBe(200);
    expect(ok.json.banner.linkUrl).toBe("https://sportcity.example");
    const del = await call(`/api/admin/banners/${ok.json.banner.id}`, undefined, "DELETE");
    expect(del.status).toBe(200);
  });

  test("баннер: битые даты показа отклоняются (Invalid Date не уезжает в БД)", async () => {
    const bad1 = await call("/api/admin/banners", { title: "Даты", placement: "TOP", startsAt: "не-дата" });
    expect(bad1.status).toBe(422);
    const bad2 = await call("/api/admin/banners", { title: "Даты", placement: "TOP", startsAt: "2030-01-02", endsAt: "2030-01-01" });
    expect(bad2.status).toBe(422);
  });

  // 🟠-1 BOLA: CLUB_ADMIN через импорт лезет в чужие команды/клубы
  test("импорт: CLUB_ADMIN не заводит заявки в чужую команду (BOLA, верхний уровень)", async () => {
    await call("/api/auth/login", { email: "club@ff21.ru", password: "club123" });
    const clubAdmin = await db.user.findUniqueOrThrow({ where: { email: "club@ff21.ru" } });
    expect(clubAdmin.clubId).toBeTruthy();
    const foreignTeam = await db.team.findFirstOrThrow({
      where: { OR: [{ clubId: { not: clubAdmin.clubId } }, { clubId: null }] },
      select: { id: true },
    });
    const season = await db.season.findFirstOrThrow({ select: { id: true } });
    const r = await call("/api/admin/import", {
      entity: "players", teamId: foreignTeam.id, seasonId: season.id, dryRun: true,
      csv: "фамилия;имя\nТестов;Тест",
    });
    expect(r.status).toBe(403);
  });

  test("импорт: CLUB_ADMIN не создаёт клубы (привилегия лиги)", async () => {
    const r = await call("/api/admin/import", { entity: "clubs", dryRun: true, csv: "название\nТестклуб" });
    expect(r.status).toBe(403);
  });

  test("импорт: CLUB_ADMIN создаёт команды только в своём клубе; чужой клуб в CSV — ошибка строки", async () => {
    const clubAdmin = await db.user.findUniqueOrThrow({ where: { email: "club@ff21.ru" } });
    const ownClub = await db.club.findUniqueOrThrow({ where: { id: clubAdmin.clubId! } });
    // чужой клуб в строке → строка падает с 403-сообщением, команда не создаётся
    const foreignClub = await db.club.findFirstOrThrow({ where: { id: { not: ownClub.id } }, select: { name: true } });
    const bad = await call("/api/admin/import", {
      entity: "teams", dryRun: true,
      csv: `название;клуб\nХФ Тесткоманда;${foreignClub.name}`,
    });
    expect(bad.status).toBe(200);
    expect(bad.json.ok).toBe(false);
    expect(bad.json.rows[0].message).toContain("своём клубе");

    // свой клуб (dryRun) — проходит, ничего не создаётся
    const ok = await call("/api/admin/import", {
      entity: "teams", dryRun: true,
      csv: `название;клуб\nХФ Тесткоманда;${ownClub.name}`,
    });
    expect(ok.status).toBe(200);
    expect(ok.json.dryRun).toBe(true);
    expect(ok.json.errors).toBe(0);
    const leaked = await db.team.findFirst({ where: { name: "ХФ Тесткоманда" } });
    expect(leaked).toBeNull();
  });

  // 🟠-3 атомарность: дубликаты personIds не роняют заявку состава
  test("состав: дубли personIds дедуплицируются, состав не теряется", async () => {
    await call("/api/auth/login", { email: EMAIL, password: PASSWORD });
    // ищем SCHEDULED матч с этапом и ≥2 «чистыми» игроками хозяев
    const candidates = await db.match.findMany({
      where: { status: "SCHEDULED", stageId: { not: null } },
      orderBy: { kickoff: "asc" },
      select: { id: true, homeTeamId: true },
    });
    let target: { id: string; homeTeamId: string } | null = null;
    let players: { personId: string }[] = [];
    for (const m of candidates) {
      const proto = await get(`/api/admin/matches/${m.id}`);
      const clean = proto.json.eligible?.home?.filter((p: { suspension: unknown; registrationOk: boolean }) => !p.suspension && p.registrationOk) ?? [];
      if (clean.length >= 2) {
        target = m;
        players = clean.slice(0, 2);
        break;
      }
    }
    expect(target).not.toBeNull();
    if (!target) return;

    const dupIds = [players[0].personId, players[1].personId, players[0].personId];
    const r = await call(`/api/admin/matches/${target.id}`, { action: "lineup", teamId: target.homeTeamId, personIds: dupIds });
    expect(r.status).toBe(200);
    expect(r.json.bench + r.json.starters).toBe(2);
    const count = await db.lineupEntry.count({ where: { matchId: target.id, teamId: target.homeTeamId } });
    expect(count).toBe(2);
  });

  // 🟠-3 атомарность: complete/reset в транзакции (двойной complete — 409)
  test("complete → двойной complete (409) → reset: транзакции не ломают цикл", async () => {
    const match = await db.match.findFirst({
      where: { status: "SCHEDULED", refereeId: { not: null }, events: { none: {} } },
      select: { id: true },
    });
    if (!match) {
      console.log("  (нет SCHEDULED-матча с судьёй без событий — пропуск)");
      return;
    }
    const c1 = await call(`/api/admin/matches/${match.id}`, { action: "complete" });
    expect(c1.status).toBe(200);
    const m1 = await db.match.findUniqueOrThrow({ where: { id: match.id }, select: { status: true } });
    expect(m1.status).toBe("COMPLETED");

    // двойной complete из «второй вкладки» — свежая проверка статуса в tx
    const c2 = await call(`/api/admin/matches/${match.id}`, { action: "complete" });
    expect(c2.status).toBe(409);

    const r1 = await call(`/api/admin/matches/${match.id}`, { action: "reset" });
    expect(r1.status).toBe(200);
    const m2 = await db.match.findUniqueOrThrow({ where: { id: match.id }, select: { status: true } });
    expect(m2.status).toBe("SCHEDULED");
  });

  // 🟡-5 media DELETE: несуществующий файл — 404, не 500
  test("медиа: DELETE несуществующего файла — 404 (P2025 замаплен)", async () => {
    const r = await call("/api/admin/media?url=/api/media/nonexistent-id-42", undefined, "DELETE");
    expect(r.status).toBe(404);
  });
});

describe.skipIf(!RUNNING)("Интеграция · v1.0.28: заявка состава старт→№→запас→штаб", () => {
  beforeAll(async () => {
    await call("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
  });

  test("номера на матч: дубли в одной команде → 422 с именами; валидные — сохраняются", async () => {
    // ищем SCHEDULED матч с этапом и ≥2 «чистыми» игроками хозяев
    const candidates = await db.match.findMany({
      where: { status: "SCHEDULED", stageId: { not: null } },
      orderBy: { kickoff: "asc" },
      select: { id: true, homeTeamId: true },
    });
    let target: { id: string; homeTeamId: string } | null = null;
    let players: { personId: string; name: string }[] = [];
    for (const m of candidates) {
      const proto = await get(`/api/admin/matches/${m.id}`);
      const clean = proto.json.eligible?.home?.filter(
        (p: { suspension: unknown; registrationOk: boolean; regRole: string }) =>
          !p.suspension && p.registrationOk && p.regRole === "PLAYER"
      ) ?? [];
      if (clean.length >= 2) {
        target = m;
        players = clean.slice(0, 2);
        break;
      }
    }
    expect(target).not.toBeNull();
    if (!target) return;

    // дубль номеров — 422 с именами
    const dup = await call(`/api/admin/matches/${target.id}`, {
      action: "lineup",
      teamId: target.homeTeamId,
      personIds: [players[0].personId, players[1].personId],
      starters: [players[0].personId],
      numbers: [
        { personId: players[0].personId, number: 7 },
        { personId: players[1].personId, number: 7 },
      ],
    });
    expect(dup.status).toBe(422);
    expect(dup.json.error).toContain("№7");
    expect(dup.json.error).toContain(players[0].name);

    // валидные номера — сохраняются точечно, без автонумерации
    const ok = await call(`/api/admin/matches/${target.id}`, {
      action: "lineup",
      teamId: target.homeTeamId,
      personIds: [players[0].personId, players[1].personId],
      starters: [players[0].personId],
      numbers: [
        { personId: players[0].personId, number: 9 },
        { personId: players[1].personId, number: 14 },
      ],
    });
    expect(ok.status).toBe(200);
    expect(ok.json.numbered).toBe(2);
    const entries = await db.lineupEntry.findMany({
      where: { matchId: target.id, teamId: target.homeTeamId },
    });
    const nums = new Map(entries.map((e) => [e.personId, e.number]));
    expect(nums.get(players[0].personId)).toBe(9);
    expect(nums.get(players[1].personId)).toBe(14);

    // GET протокола: eligible несёт роли и lastNumber для предзаполнения —
    // это номер из ПОСЛЕДНЕГО ПРОШЛОГО матча команды (не текущего)
    const proto = await get(`/api/admin/matches/${target.id}`);
    const row = proto.json.eligible.home.find((p: { personId: string }) => p.personId === players[0].personId);
    expect(row.regRole).toBe("PLAYER");
    const thisMatch = await db.match.findUniqueOrThrow({ where: { id: target.id }, select: { kickoff: true } });
    const prior = await db.lineupEntry.findFirst({
      where: {
        personId: players[0].personId,
        teamId: target.homeTeamId,
        number: { not: null },
        match: { kickoff: { lt: thisMatch.kickoff } },
      },
      orderBy: { match: { kickoff: "desc" } },
      select: { number: true },
    });
    expect(row.lastNumber).toBe(prior?.number ?? null);
    expect(proto.json.match.league.format).toBeTruthy();

    // уборка: возвращаем матч без состава
    await call(`/api/admin/matches/${target.id}`, {
      action: "lineup",
      teamId: target.homeTeamId,
      personIds: [players[0].personId],
      starters: [],
      numbers: [],
    });
  });

  test("публичный поиск: rate-limit — 429 после серии запросов", async () => {
    let saw429 = false;
    for (let i = 0; i < 35; i++) {
      const res = await fetch(`${BASE}/api/public/search?q=те`);
      if (res.status === 429) { saw429 = true; break; }
    }
    expect(saw429).toBe(true);
  });
});

describe.skipIf(!RUNNING)("Интеграция · v1.0.29: контент сайта из админки", () => {
  test("виды футбола: сид миграции виден в публичном обзоре", async () => {
    const { status, json } = await get("/api/public/overview");
    expect(status).toBe(200);
    const codes = (json.formats ?? []).map((f: { code: string }) => f.code);
    expect(codes).toContain("F11");
    expect(codes).toContain("F8");
    expect(codes).toContain("FUTSAL");
  });

  test("форматы: мусорные коды и дубли отклоняются; кастомный — CRUD + скрытие из меню", async () => {
    // мусорный код (кириллица/символы)
    const bad = await call("/api/admin/formats", { code: "ф7!", label: "Плохой" });
    expect(bad.status).toBe(422);
    // дубликат базового формата
    const dup = await call("/api/admin/formats", { code: "F11", label: "Дубль" });
    expect(dup.status).toBe(422);
    // кастомный формат
    const created = await call("/api/admin/formats", { code: "F7", label: "7×7", sortOrder: 25 });
    expect(created.status).toBe(200);
    const id: string = created.json.format.id;
    const ov = await get("/api/public/overview");
    expect(ov.json.formats.map((f: { code: string }) => f.code)).toContain("F7");
    // скрытие: из меню пропал, в админ-списке остался
    const hide = await call(`/api/admin/formats/${id}`, { isVisible: false }, "PATCH");
    expect(hide.status).toBe(200);
    const ov2 = await get("/api/public/overview");
    expect(ov2.json.formats.map((f: { code: string }) => f.code)).not.toContain("F7");
    const adminList = await get("/api/admin/formats");
    expect(adminList.json.formats.map((f: { code: string }) => f.code)).toContain("F7");
    // удаление
    const del = await call(`/api/admin/formats/${id}`, null, "DELETE");
    expect(del.status).toBe(200);
  });

  test("лига с кастомным форматом создаётся; лента фильтруется по формату", async () => {
    await call("/api/admin/formats", { code: "F7", label: "7×7", sortOrder: 25 });
    const created = await call("/api/admin/leagues", { name: "Тест-лига 7×7 (v1.0.29)", format: "F7" });
    expect(created.status).toBe(200);
    const leagueId: string = created.json.league.id;
    // лента по кастомному формату отвечает (лига без сезонов — пустой список)
    const feed = await get("/api/public/matches/day?date=all&format=F7");
    expect(feed.status).toBe(200);
    expect(feed.json.leagues).toHaveLength(0);
    // мусорный формат в ленте — не 500 (фильтр просто не срабатывает)
    const junk = await get("/api/public/matches/day?date=all&format=drop%20table");
    expect(junk.status).toBe(200);
    // уборка: лига без сезонов и заявок удаляется
    const del = await call(`/api/admin/leagues/${leagueId}`, null, "DELETE");
    expect(del.status).toBe(200);
    const fmts = await get("/api/admin/formats");
    const f7 = fmts.json.formats.find((f: { code: string }) => f.code === "F7");
    if (f7) await call(`/api/admin/formats/${f7.id}`, null, "DELETE");
  });

  test("стат-карточки: XSS-ссылки отклоняются; валидная видна публично и в SSR, выключенная — нет", async () => {
    const xss = await call("/api/admin/statblocks", { title: "XSS", linkUrl: "javascript:alert(1)" });
    expect(xss.status).toBe(422);
    const ok = await call("/api/admin/statblocks", {
      title: "Бомбардир тура", value: "12", text: "голов · тест-карточка",
      linkUrl: "/player/test", priority: 5,
    });
    expect(ok.status).toBe(200);
    const id: string = ok.json.statBlock.id;
    const pub = await get("/api/public/statblocks");
    expect(pub.json.statBlocks.some((b: { id: string }) => b.id === id)).toBe(true);
    // SSR: карточка в HTML сразу (анти-CLS, без клиентской догрузки)
    const html = await fetch(`${BASE}/`).then((r) => r.text());
    expect(html).toContain("Бомбардир тура");
    // выключение — полная замена (как у баннеров)
    const off = await call(`/api/admin/statblocks/${id}`, {
      title: "Бомбардир тура", value: "12", text: "голов · тест-карточка",
      linkUrl: "/player/test", priority: 5, isActive: false,
    }, "PATCH");
    expect(off.status).toBe(200);
    const pub2 = await get("/api/public/statblocks");
    expect(pub2.json.statBlocks.some((b: { id: string }) => b.id === id)).toBe(false);
    // удаление
    await call(`/api/admin/statblocks/${id}`, null, "DELETE");
    const pub3 = await get("/api/public/statblocks");
    expect(pub3.json.statBlocks.some((b: { id: string }) => b.id === id)).toBe(false);
  });
});

// ============================================================
// v1.0.32 · Удаление матча (полный каскад), пароли (золотой
// стандарт), скоуп лиги для LEAGUE_ADMIN
// ============================================================
describe.skipIf(!RUNNING)("Интеграция · v1.0.32: удаление, пароли, скоупы", () => {
  beforeAll(async () => {
    await call("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
  });

  test("удаление матча с протоколом: каскад чистит детали, мастер-данные остаются", async () => {
    // --- готовим матч с протоколом на реальных данных сезона ---
    const season = await db.season.findFirst({
      where: { league: { format: "F11" } },
      include: { league: true, stages: true },
    });
    expect(season).not.toBeNull();
    if (!season) return;
    const teams = await db.team.findMany({ take: 2, orderBy: { id: "asc" } });
    if (teams.length < 2) return; // нет двух команд — выходим без падения
    const referee = await db.person.findFirst({ where: { isReferee: true } });
    expect(referee).not.toBeNull();
    const created = await call("/api/admin/matches", {
      seasonId: season.id, homeTeamId: teams[0].id, awayTeamId: teams[1].id,
      kickoff: new Date(Date.now() + 86400000).toISOString(),
      refereeId: referee!.id,
    });
    expect(created.status).toBe(200);
    const matchId: string = created.json.match.id;

    // заявка состава (1 стартовый игрок из тех, кто заявлен за команду в этом сезоне)
    const reg = await db.registration.findFirst({
      where: { teamId: teams[0].id, seasonId: season.id, status: "ACTIVE", role: "PLAYER" },
    });
    expect(reg).not.toBeNull();
    const lineup = await call(`/api/admin/matches/${matchId}`, {
      action: "lineup", teamId: teams[0].id,
      personIds: [reg!.personId], starters: [reg!.personId],
    });
    expect(lineup.status).toBe(200);

    // событие: гол
    const event = await call(`/api/admin/matches/${matchId}`, {
      action: "event", type: "GOAL", minute: 10,
      personId: reg!.personId, teamId: teams[0].id,
    });
    expect(event.status).toBe(200);

    // завершение
    const done = await call(`/api/admin/matches/${matchId}`, { action: "complete" });
    expect(done.status).toBe(200);
    expect(await db.match.findUnique({ where: { id: matchId } })).not.toBeNull();
    expect(await db.matchEvent.count({ where: { matchId } })).toBe(1);
    expect(await db.lineupEntry.count({ where: { matchId } })).toBe(1);

    // --- УДАЛЕНИЕ (раньше здесь был 409 «сначала очистите протокол») ---
    const del = await call(`/api/admin/matches/${matchId}`, null, "DELETE");
    expect(del.status).toBe(200);
    expect(del.json.removed.events).toBe(1);
    expect(del.json.removed.lineups).toBe(1);

    // детали матча ушли (каскад), мастер-данные остались
    expect(await db.match.findUnique({ where: { id: matchId } })).toBeNull();
    expect(await db.matchEvent.count({ where: { matchId } })).toBe(0);
    expect(await db.lineupEntry.count({ where: { matchId } })).toBe(0);
    expect(await db.team.findUnique({ where: { id: teams[0].id } })).not.toBeNull();
    expect(await db.person.findUnique({ where: { id: reg!.personId } })).not.toBeNull();
    expect(await db.registration.findUnique({ where: { id: reg!.id } })).not.toBeNull();
    // аудит зафиксировал удаление
    const log = await db.auditLog.findFirst({
      where: { entity: "Match", entityId: matchId, action: "DELETE" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
  });

  test("массовое удаление: матчи с протоколом больше не «пропускаются»", async () => {
    const season = await db.season.findFirst({ include: { stages: true } });
    if (!season) return;
    const teams = await db.team.findMany({ take: 2, orderBy: { id: "desc" } });
    if (teams.length < 2) return;
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await call("/api/admin/matches", {
        seasonId: season.id, homeTeamId: teams[0].id, awayTeamId: teams[1].id,
        kickoff: new Date(Date.now() + 2 * 86400000 + i * 3600000).toISOString(),
      });
      if (res.status === 200) ids.push(res.json.match.id);
    }
    expect(ids.length).toBe(2);
    // одному добавим «протокол» — lineup (достаточно, чтобы старый код его пропустил)
    const reg = await db.registration.findFirst({
      where: { teamId: teams[0].id, seasonId: season.id, status: "ACTIVE", role: "PLAYER" },
    });
    if (reg) {
      const lineup = await call(`/api/admin/matches/${ids[0]}`, {
        action: "lineup", teamId: teams[0].id, personIds: [reg.personId], starters: [reg.personId],
      });
      expect(lineup.status).toBe(200);
    }
    const bulk = await call("/api/admin/matches", { action: "bulk-delete", ids });
    expect(bulk.status).toBe(200);
    expect(bulk.json.deleted).toBe(2);
    expect(bulk.json.withProtocol).toBe(reg ? 1 : 0);
    expect(await db.match.count({ where: { id: { in: ids } } })).toBe(0);
  });

  test("пароли: смена требует текущий; чужая сессия умирает; супер-админ выдаёт ссылку, а не пароль", async () => {
    const email = "pwtest@ff21.ru";
    // самовосстановление: даже при падении в середине — пароль админа и
    // тестовый пользователь возвращаются в исходное состояние
    let adminPw = "admin123";
    try {
      const wrong = await call("/api/auth/password", { currentPassword: "nope", newPassword: "12345678x" });
      expect(wrong.status).toBe(401);
      const short = await call("/api/auth/password", { currentPassword: adminPw, newPassword: "123" });
      expect(short.status).toBe(422);
      const same = await call("/api/auth/password", { currentPassword: adminPw, newPassword: adminPw });
      expect(same.status).toBe(422);
      // вторая «чужая» сессия (эмуляция другого браузера)
      const other = await fetch(BASE + "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@ff21.ru", password: adminPw }),
      });
      const otherCookie = (other.headers.get("set-cookie") ?? "").split(";")[0];
      expect(otherCookie).toBeTruthy();

      const ok = await call("/api/auth/password", { currentPassword: adminPw, newPassword: "admin123-new" });
      expect(ok.status).toBe(200);
      adminPw = "admin123-new";
      // чужая сессия умерла (sessionVersion++)
      const dead = await fetch(BASE + "/api/auth/me", { headers: { Cookie: otherCookie } });
      expect((await dead.json()).user).toBeNull();
      // вход со старым паролем невозможен, с новым — работает
      const oldLogin = await call("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
      expect(oldLogin.status).toBe(401);
      const newLogin = await call("/api/auth/login", { email: "admin@ff21.ru", password: adminPw });
      expect(newLogin.status).toBe(200);

      // --- одноразовая ссылка: создание пользователя без пароля ---
      // v1.0.33: новый пользователь — почта НЕ подтверждена (manual-режим:
      // ссылку передаёт админ) → установка требует подтверждения адреса
      const created = await call("/api/admin/users", { email, role: "CLUB_ADMIN" });
      expect(created.status).toBe(200);
      const setupToken: string = created.json.setupToken;
      expect(setupToken).toBeTruthy();
      expect(created.json.delivered).toBe("manual");
      // предпросмотр: email для подтверждения + вид ссылки
      const preview = await get(`/api/auth/password/set?token=${encodeURIComponent(setupToken)}`);
      expect(preview.status).toBe(200);
      expect(preview.json.email).toBe(email);
      expect(preview.json.kind).toBe("invite");
      expect(preview.json.emailVerified).toBe(false);
      // без подтверждения адреса — отказ
      const noConfirm = await call("/api/auth/password/set", { token: setupToken, newPassword: "clubpw-12345" });
      expect(noConfirm.status).toBe(422);
      // войти по паролю-заглушке нельзя
      const stub = await call("/api/auth/login", { email, password: "anything-12345" });
      expect(stub.status).toBe(401);
      // установка пароля по токену + подтверждение почты — автовход
      // (глобальная сессия = тестовый юзер!)
      const setPw = await call("/api/auth/password/set", { token: setupToken, newPassword: "clubpw-12345", emailConfirmed: true });
      expect(setPw.status).toBe(200);
      expect(setPw.json.email).toBe(email);
      // токен ОДНОРАЗОВЫЙ: повторная установка по нему — отказ
      const reuse = await call("/api/auth/password/set", { token: setupToken, newPassword: "clubpw-67890", emailConfirmed: true });
      expect(reuse.status).toBe(401);
      // новый пароль работает
      const loginPw = await call("/api/auth/login", { email, password: "clubpw-12345" });
      expect(loginPw.status).toBe(200);

      // --- супер-админ сбрасывает: выдаёт ссылку, пароля не знает ---
      await call("/api/auth/login", { email: "admin@ff21.ru", password: adminPw });
      const reset = await call("/api/admin/users", { id: setPw.json.id, action: "requestPasswordReset" }, "PATCH");
      expect(reset.status).toBe(200);
      const resetToken: string = reset.json.resetToken;
      expect(resetToken).toBeTruthy();
      // сброс снова переключает сессию на тестового юзера (автовход по ссылке)
      const resetPw = await call("/api/auth/password/set", { token: resetToken, newPassword: "clubpw-54321" });
      expect(resetPw.status).toBe(200);
      // старый пароль умер
      const oldPw = await call("/api/auth/login", { email, password: "clubpw-12345" });
      expect(oldPw.status).toBe(401);
    } finally {
      // уборка ВСЕГДА: удалить тестового пользователя, вернуть пароль админа
      await db.user.deleteMany({ where: { email } });
      await call("/api/auth/login", { email: "admin@ff21.ru", password: adminPw });
      const back = await call("/api/auth/password", { currentPassword: adminPw, newPassword: "admin123" });
      expect(back.status).toBe(200);
    }
  });

  test("скоуп лиги: админ конкретной лиги не выходит за её границы", async () => {
    // две лиги (если в сиде одна — создаём вторую, в конце удалим)
    const leagueA = await db.league.findFirst({ orderBy: { createdAt: "asc" } });
    const createdB = await call("/api/admin/leagues", { name: "Скоуп-тест лига B (v1.0.32)", format: "F8" });
    expect(createdB.status).toBe(200);
    const leagueB: { id: string } = createdB.json.league;
    expect(leagueA).not.toBeNull();
    if (!leagueA) return;

    // создать скоуп-админа лиги A (подтверждение почты — сразу, manual-режим)
    const email = "scope@ff21.ru";
    const created = await call("/api/admin/users", { email, role: "LEAGUE_ADMIN", leagueId: leagueA.id });
    expect(created.status).toBe(200);
    const token: string = created.json.setupToken;
    const setPw = await call("/api/auth/password/set", { token, newPassword: "scope-12345", emailConfirmed: true });
    expect(setPw.status).toBe(200);
    // cookie теперь — сессия скоуп-админа

    // свой сезон — можно; чужой — 403
    const seasonA = await db.season.findFirst({ where: { leagueId: leagueA.id } });
    const myMatches = await get(`/api/admin/matches?seasonId=${seasonA?.id ?? "none"}`);
    expect(myMatches.status).toBe(200);
    const otherSeason = await db.season.findFirst({ where: { leagueId: leagueB.id } });
    if (!otherSeason) {
      const s = await call("/api/admin/seasons", { leagueId: leagueB.id, name: "Скоуп-тест сезон", startDate: "2026-01-01" });
      expect(s.status).toBe(403); // скоуп-админ не создаёт сезоны в чужой лиге
    } else {
      const forbidden = await get(`/api/admin/matches?seasonId=${otherSeason.id}`);
      expect(forbidden.status).toBe(403);
    }
    // создание лиг — только оператор/супер
    const createLeague = await call("/api/admin/leagues", { name: "Лига скоуп-админа", format: "F11" });
    expect(createLeague.status).toBe(403);
    // список пользователей — только супер
    const users = await get("/api/admin/users");
    expect(users.status).toBe(403);
    // журнал аудита — только супер
    const auditRes = await get("/api/admin/audit?limit=5");
    expect(auditRes.status).toBe(403);
    // список лиг для него — только своя
    const leaguesList = await get("/api/admin/leagues");
    expect(leaguesList.status).toBe(200);
    expect(leaguesList.json.leagues.map((l: { id: string }) => l.id)).toEqual([leagueA.id]);

    // скоуп можно снять (setLeague null) и назначить другой
    const userId: string = setPw.json.id;
    await call("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
    const setScopeB = await call("/api/admin/users", { id: userId, action: "setLeague", leagueId: leagueB.id }, "PATCH");
    expect(setScopeB.status).toBe(200);
    // теперь лига A недоступна, лига B — доступна
    await call("/api/auth/login", { email, password: "scope-12345" });
    const nowA = await get(`/api/admin/matches?seasonId=${seasonA?.id ?? "none"}`);
    expect(nowA.status).toBe(403);
    const seasonsB = await get("/api/admin/leagues");
    expect(seasonsB.json.leagues.map((l: { id: string }) => l.id)).toEqual([leagueB.id]);

    // уборка
    await call("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
    await db.user.delete({ where: { email } });
    await call(`/api/admin/leagues/${leagueB.id}`, null, "DELETE");
  });
});

// v1.0.33 · Приглашения и подтверждение почты (сервер в ci/локально
// запущен БЕЗ SMTP_HOST → manual-режим: ссылки возвращаются в API,
// получатель подтверждает/исправляет адрес при установке пароля).
// SMTP-режим проверяет отдельный скрипт scripts/test-invites.ts
// (мок-SMTP + сервер с SMTP-переменными).
describe.skipIf(!RUNNING)("Интеграция · v1.0.33: приглашения и подтверждение почты (manual)", () => {
  const PREFIX = "inv33";
  const admin = { email: "admin@ff21.ru", password: "admin123" };

  // password/set автовходит за приглашённого — каждый тест начинает админом
  beforeEach(async () => {
    await call("/api/auth/login", admin);
  });

  beforeAll(async () => {
    await db.user.deleteMany({ where: { email: { contains: PREFIX } } });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { contains: PREFIX } } });
  });

  test("создание: manual-ссылка 48 ч, флаги «без пароля» и «почта не подтверждена»", async () => {
    const email = `${PREFIX}1@ff21.ru`;
    const created = await call("/api/admin/users", { email, role: "LEAGUE_ADMIN" });
    expect(created.status).toBe(200);
    expect(created.json.delivered).toBe("manual");
    expect(created.json.ttlHours).toBe(48);
    // список отдаёт режим доставки и статусы
    const list = await get("/api/admin/users");
    expect(list.json.mailMode).toBe("manual");
    const row = list.json.users.find((u: { email: string }) => u.email === email);
    expect(row.passwordSet).toBe(false);
    expect(row.emailVerified).toBe(false);
    // invite-токен: проверяем TTL по payload (48 ч, а не 15 мин)
    const payload = JSON.parse(Buffer.from(String(created.json.setupToken).split(".")[0], "base64url").toString("utf8"));
    expect(payload.kind).toBe("invite");
    expect(payload.exp - Date.now()).toBeGreaterThan(47 * 60 * 60 * 1000);
  });

  test("исправление опечатки в адресе при установке пароля", async () => {
    const wrongEmail = `${PREFIX}2typo@ff21.ru`;
    const rightEmail = `${PREFIX}2right@ff21.ru`;
    const created = await call("/api/admin/users", { email: wrongEmail, role: "REFEREE" });
    expect(created.status).toBe(200);
    const token: string = created.json.setupToken;
    // предпросмотр показывает неверный адрес
    const preview = await get(`/api/auth/password/set?token=${encodeURIComponent(token)}`);
    expect(preview.json.email).toBe(wrongEmail);
    // получатель исправляет + ставит пароль одним запросом
    const setPw = await call("/api/auth/password/set", { token, newPassword: "inv33-12345", email: rightEmail });
    expect(setPw.status).toBe(200);
    expect(setPw.json.email).toBe(rightEmail);
    // в БД: адрес заменён, почта НЕ подтверждена (юзер сам исправил —
    // админ должен перепроверить), пароль установлен
    const dbUser = await db.user.findUnique({ where: { email: rightEmail } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.passwordSet).toBe(true);
    expect(dbUser!.emailVerified).toBe(false);
    // по старому адресу пользователя больше нет
    const gone = await db.user.findUnique({ where: { email: wrongEmail } });
    expect(gone).toBeNull();
  });

  test("повторное приглашение — только тем, кто ещё без пароля; сброс — только принявшим", async () => {
    const email = `${PREFIX}3@ff21.ru`;
    const created = await call("/api/admin/users", { email, role: "PLAYER" });
    const token: string = created.json.setupToken;
    const userId: string = created.json.id;

    // ещё без пароля: resendInvite работает, requestPasswordReset — нет
    const resetDenied = await call("/api/admin/users", { id: userId, action: "requestPasswordReset" }, "PATCH");
    expect(resetDenied.status).toBe(422);
    const resend = await call("/api/admin/users", { id: userId, action: "resendInvite" }, "PATCH");
    expect(resend.status).toBe(200);
    expect(resend.json.delivered).toBe("manual");

    // принял приглашение (подтвердил адрес) — resendInvite закрыт
    const setPw = await call("/api/auth/password/set", { token, newPassword: "inv33-12345", emailConfirmed: true });
    expect(setPw.status).toBe(200);
    await call("/api/auth/login", admin); // автовход за приглашённого — возвращаемся админом
    const resendDenied = await call("/api/admin/users", { id: userId, action: "resendInvite" }, "PATCH");
    expect(resendDenied.status).toBe(422);
    const reset = await call("/api/admin/users", { id: userId, action: "requestPasswordReset" }, "PATCH");
    expect(reset.status).toBe(200);
    expect(reset.json.delivered).toBe("manual");

    // подтверждённая почта видна в списке
    const list = await get("/api/admin/users");
    const row = list.json.users.find((u: { email: string }) => u.email === email);
    expect(row.passwordSet).toBe(true);
    expect(row.emailVerified).toBe(true);
  });

  test("смена почты админом: подтверждение сбрасывается, логин меняется сразу", async () => {
    const oldEmail = `${PREFIX}4old@ff21.ru`;
    const newEmail = `${PREFIX}4new@ff21.ru`;
    const created = await call("/api/admin/users", { email: oldEmail, role: "CLUB_ADMIN" });
    const token: string = created.json.setupToken;
    // принял приглашение, подтвердил адрес
    await call("/api/auth/password/set", { token, newPassword: "inv33-12345", emailConfirmed: true });
    await call("/api/auth/login", admin);

    // админ меняет почту — ручной режим вернёт ссылку подтверждения
    const change = await call("/api/admin/users", { id: created.json.id, action: "setEmail", email: newEmail }, "PATCH");
    expect(change.status).toBe(200);
    expect(change.json.email).toBe(newEmail);
    expect(change.json.delivered).toBe("manual");
    expect(change.json.token).toBeTruthy();
    // старый адрес больше не логин, новый — работает
    const oldLogin = await call("/api/auth/login", { email: oldEmail, password: "inv33-12345" });
    expect(oldLogin.status).toBe(401);
    const newLogin = await call("/api/auth/login", { email: newEmail, password: "inv33-12345" });
    expect(newLogin.status).toBe(200);
    // подтверждение сброшено — виден бейдж «почта не подтверждена»
    await call("/api/auth/login", admin);
    const list = await get("/api/admin/users");
    const row = list.json.users.find((u: { email: string }) => u.email === newEmail);
    expect(row.emailVerified).toBe(false);

    // дубликат чужого адреса — 409
    const dup = await call("/api/admin/users", { id: created.json.id, action: "setEmail", email: "admin@ff21.ru" }, "PATCH");
    expect(dup.status).toBe(409);
  });
});
