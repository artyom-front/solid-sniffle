// ============================================================
// Интеграционные тесты домена (запускаются против живого сервера):
//   API_URL=http://localhost:3000 bun test tests/integration
// Сначала прогоняется scripts/test-api.ts (36 проверок инвариантов
// PRD: дисквалификации, WO, merge, RBAC, аудит), затем —
// полный жизненный цикл 2FA (TOTP) и smoke SSR/SEO.
// Внимание: тесты мутируют БД — в CI поднимается чистая база + сид.
// ============================================================

import { beforeAll, describe, expect, test } from "bun:test";
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

  test("setup выдаёт base32-секрет и QR data-URL", async () => {
    const { status, json } = await call("/api/admin/totp", { action: "setup" });
    expect(status).toBe(200);
    expect(json.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(json.otpauth).toContain("otpauth://totp/");
    expect(json.qr.startsWith("data:image/png")).toBe(true);
  });

  let secret = "";
  let recovery: string[] = [];

  test("enable подтверждается кодом, выдаёт 8 резервных кодов", async () => {
    const setup = await call("/api/admin/totp", { action: "setup" });
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
