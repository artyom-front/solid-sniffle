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
