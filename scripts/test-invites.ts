#!/usr/bin/env bun
// ============================================================
// SCORESBOX · v1.0.33 · SMTP-режим приглашений: интеграционный
// прогон (золотой стандарт доставки писем).
//
// Поднимает:
//   1) мок-SMTP (127.0.0.1:2525) — собирает все письма в память;
//   2) standalone-сервер (порт 3120) с SMTP_HOST=127.0.0.1 →
//      mailMode()=smtp.
// Проверяет: приглашение уходит письмом (ссылки НЕТ в ответе API),
// клик по ссылке из письма подтверждает ящик автоматически, сброс
// пароля — письмом, смена почты — письмом на новый адрес, а при
// недоступном SMTP создание пользователя откатывается (502).
//
// Запуск (нужна прод-сборка и БД с сидом):
//   DATABASE_URL=… bun scripts/test-invites.ts
// CI: шаг после основных интеграционных тестов.
// ============================================================

import net from "node:net";
import { PrismaClient } from "@prisma/client";

const DB = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/scoresbox?schema=public";
const db = new PrismaClient();

const SMTP_PORT = 2525;
const APP_PORT = 3120;
const APP_PORT_DEAD_SMTP = 3121;
const BASE = `http://localhost:${APP_PORT}`;
const PREFIX = "smtp33";

interface CapturedMail { from: string; to: string; subject: string; body: string }

// ---------------- декодирование писем (nodemailer кодирует части) ----------------

/** quoted-printable → текст (учитывая мягкие переносы "=\r\n") */
function qpDecode(s: string): string {
  return s
    .replace(/=\r\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** RFC 2047 (=?UTF-8?B?...?=) → человекочитаемая тема/адрес */
function rfc2047(s: string): string {
  return s
    .replace(/\r\n /g, "") // схлопывание продолжений закодированных слов
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/gi, (_, b: string) => Buffer.from(b, "base64").toString("utf8"));
}

function decodePart(partHeaders: string, content: string): string {
  if (/base64/i.test(partHeaders)) return Buffer.from(content.replace(/\s+/g, ""), "base64").toString("utf8");
  if (/quoted-printable/i.test(partHeaders)) return qpDecode(content);
  return content;
}

/** Сырой DATA (SMTP) → { to, subject, body(декодированный, text+html) }:
 *  nodemailer шлёт multipart/alternative — text/plain в base64,
 *  text/html в quoted-printable (ссылка видна только после декода —
 *  в сыром виде токен выглядит как «pwset=3DeyJ…» с мягкими переносами). */
function parseMail(raw: string): CapturedMail {
  const headerEnd = raw.indexOf("\r\n\r\n");
  const headers = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw;
  const body = headerEnd >= 0 ? raw.slice(headerEnd + 4) : "";
  const to = rfc2047(/(^|\r\n)To:\s*([^\r\n]+)/i.exec(headers)?.[2] ?? "");
  const subject = rfc2047(/(^|\r\n)Subject:\s*([^\r\n]+)/i.exec(headers)?.[2] ?? "");
  const from = rfc2047(/(^|\r\n)From:\s*([^\r\n]+)/i.exec(headers)?.[2] ?? "");
  let decoded = "";
  const bm = /boundary="?([^";\r\n]+)/i.exec(headers);
  if (bm) {
    for (const part of body.split(`--${bm[1]}`)) {
      const pe = part.indexOf("\r\n\r\n");
      if (pe < 0) continue;
      const ph = part.slice(0, pe);
      if (/content-transfer-encoding/i.test(ph)) decoded += decodePart(ph, part.slice(pe + 4)) + "\n";
    }
  } else {
    decoded = decodePart(headers, body);
  }
  return { from, to, subject, body: decoded };
}

// ---------------- мок-SMTP ----------------

const mails: CapturedMail[] = [];

function startSmtpMock(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((sock) => {
      let buffer = "";
      let inData = false;
      let data = "";
      sock.write("220 mock-smtp SCORESBOX-test\r\n");
      sock.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        if (inData) {
          data += buffer;
          buffer = "";
          if (data.endsWith("\r\n.\r\n")) {
            const raw = data.slice(0, -5).replace(/\r\n\.\./g, "\r\n.");
            mails.push(parseMail(raw));
            data = "";
            inData = false;
            sock.write("250 queued\r\n");
          }
          return;
        }
        // командный режим — обрабатываем построчно
        let idx: number;
        while ((idx = buffer.indexOf("\r\n")) >= 0) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const cmd = line.toUpperCase();
          if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) {
            sock.write("250-mock greets you\r\n250 8BITMIME\r\n");
          } else if (cmd.startsWith("MAIL FROM")) {
            sock.write("250 ok\r\n");
          } else if (cmd.startsWith("RCPT TO")) {
            sock.write("250 ok\r\n");
          } else if (cmd === "DATA") {
            inData = true;
            sock.write("354 end with <CRLF>.<CRLF>\r\n");
          } else if (cmd === "QUIT") {
            sock.write("221 bye\r\n");
            sock.end();
          } else {
            sock.write("250 ok\r\n");
          }
        }
      });
      sock.on("error", () => {});
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

// ---------------- HTTP-клиент (как в интеграционных тестах) ----------------

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
async function get(path: string) {
  const res = await fetch(BASE + path, { headers: cookie ? { Cookie: cookie } : {} });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function spawnServer(port: number, env: Record<string, string>) {
  return Bun.spawn(["bun", ".next/standalone/server.js"], {
    env: {
      ...process.env,
      DATABASE_URL: DB,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "ci-secret-not-for-production",
      SITE_URL: `http://localhost:${port}`,
      SHOW_DEMO_ACCOUNTS: "1",
      NODE_ENV: "production",
      PORT: String(port),
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

/** Ждём health; 30 с без ответа — ошибка (proc.exited НЕ ждём: живой
 *  процесс не завершается, await повиснет — грабля первого прогона). */
async function waitHealthy(port: number, secs = 30) {
  for (let i = 0; i < secs * 2; i++) {
    const ok = await fetch(`http://localhost:${port}/api/health`).then((r) => r.ok).catch(() => false);
    if (ok) return;
    await Bun.sleep(500);
  }
  throw new Error(`сервер :${port} не поднялся (health timeout)`);
}

function extractToken(mail: CapturedMail): string {
  const m = /pwset=([A-Za-z0-9._-]+)/.exec(mail.body) ?? /pwset=([A-Za-z0-9._-]+)/.exec(mail.subject);
  if (!m) throw new Error("в письме нет ссылки ?pwset=");
  return m[1]!;
}

// ---------------- прогон ----------------

let FAILS = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) console.log(`  ✓ ${name}`);
  else {
    FAILS++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function main() {
  const smtp = await startSmtpMock(SMTP_PORT);
  const app = spawnServer(APP_PORT, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(SMTP_PORT), SMTP_SECURE: "false" });
  const killed = { smtp: false, app: false };
  try {
    await waitHealthy(APP_PORT);
    await db.user.deleteMany({ where: { email: { contains: PREFIX } } });
    console.log("==> SMTP-режим: приглашения письмами (сервер :3120 + мок-SMTP :2525)");

    // --- вход админом ---
    const login = await call("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
    check("вход супер-админа", login.status === 200);

    // --- создание: ссылка НЕ возвращается, письмо ушло ---
    const email = `${PREFIX}1@ff21.ru`;
    mails.length = 0;
    const created = await call("/api/admin/users", { email, role: "LEAGUE_ADMIN" });
    check("создание пользователя — 200, delivered=email", created.status === 200 && created.json.delivered === "email");
    check("ссылки в ответе НЕТ (админ её не видит)", !created.json.setupToken && !created.json.token && !created.json.resetToken);
    check("письмо-приглашение пришло на адрес", mails.length === 1 && mails[0]!.to.includes(email), JSON.stringify(mails.map((m) => m.to)));
    check("в письме есть ссылка установки", mails[0] ? /pwset=/.test(mails[0].body) : false);

    // --- клик по ссылке из письма: подтверждение ящика автоматически ---
    const token = mails[0] ? extractToken(mails[0]!) : "";
    const preview = await get(`/api/auth/password/set?token=${encodeURIComponent(token)}`);
    check("предпросмотр: адрес и вид ссылки", preview.status === 200 && preview.json.email === email && preview.json.kind === "invite");
    // SMTP-режим: подтверждать адрес вручную НЕ нужно — клик по письму уже
    // доказал владение ящиком
    const setPw = await call("/api/auth/password/set", { token, newPassword: "smtp33-12345" });
    check("установка парола без ручного подтверждения (авто-верификация)", setPw.status === 200);
    const dbUser = await db.user.findUnique({ where: { email } });
    check("БД: пароль установлен, почта подтверждена", !!dbUser?.passwordSet && !!dbUser?.emailVerified);

    // --- вход новым пользователем ---
    await call("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
    const newUserLogin = await call("/api/auth/login", { email, password: "smtp33-12345" });
    check("вход по установленному паролю", newUserLogin.status === 200);

    // --- список: mailMode=smtp, статусы ---
    await call("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
    const list = await get("/api/admin/users");
    const row = list.json.users?.find((u: { email: string }) => u.email === email);
    check("список: mailMode=smtp, флаги подтверждены", list.json.mailMode === "smtp" && row?.emailVerified === true && row?.passwordSet === true);

    // --- сброс пароля: письмо, а не ссылка в API ---
    mails.length = 0;
    const reset = await call("/api/admin/users", { id: dbUser!.id, action: "requestPasswordReset" }, "PATCH");
    check("сброс — 200, delivered=email, токена в ответе нет", reset.status === 200 && reset.json.delivered === "email" && !reset.json.resetToken);
    check("письмо-сброс пришло", mails.length === 1 && /сброс/i.test(mails[0]!.subject));
    const resetToken = mails[0] ? extractToken(mails[0]!) : "";
    const setAgain = await call("/api/auth/password/set", { token: resetToken, newPassword: "smtp33-67890" });
    check("новый пароль по ссылке из письма", setAgain.status === 200);
    await call("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });
    const relogin = await call("/api/auth/login", { email, password: "smtp33-67890" });
    check("вход с новым паролем", relogin.status === 200);
    // автовход/входы переключали сессию на приглашённого — возвращаемся админом
    await call("/api/auth/login", { email: "admin@ff21.ru", password: "admin123" });

    // --- повторное приглашение: письмом ---
    const email2 = `${PREFIX}2@ff21.ru`;
    const created2 = await call("/api/admin/users", { email: email2, role: "REFEREE" });
    mails.length = 0; // считаем только письмо ПОВТОРНОГО приглашения
    const resend = await call("/api/admin/users", { id: created2.json.id, action: "resendInvite" }, "PATCH");
    check("повторное приглашение — delivered=email", resend.status === 200 && resend.json.delivered === "email" && !resend.json.token);
    check("второе письмо ушло", mails.length === 1 && mails[0]!.to.includes(email2));

    // --- смена почты: письмо на НОВЫЙ адрес, подтверждение сброшено ---
    mails.length = 0;
    const newEmail = `${PREFIX}2new@ff21.ru`;
    const change = await call("/api/admin/users", { id: created2.json.id, action: "setEmail", email: newEmail }, "PATCH");
    check("смена почты — delivered=email", change.status === 200 && change.json.delivered === "email");
    check("письмо ушло на НОВЫЙ адрес", mails.length === 1 && mails[0]!.to.includes(newEmail));
    const dbChanged = await db.user.findUnique({ where: { email: newEmail } });
    check("БД: адрес заменён, подтверждение сброшено", dbChanged?.emailVerified === false);

    // --- SMTP недоступен: создание откатывается (502) ---
    console.log("==> SMTP мёртв (порт без слушателя): создание откативается");
    const dead = spawnServer(APP_PORT_DEAD_SMTP, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2599", SMTP_SECURE: "false" });
    try {
      await waitHealthy(APP_PORT_DEAD_SMTP);
      // отдельная сессия к «мёртвому» серверу
      const deadLogin = await fetch(`http://localhost:${APP_PORT_DEAD_SMTP}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@ff21.ru", password: "admin123" }),
      });
      const deadCookie = (deadLogin.headers.get("set-cookie") ?? "").split(";")[0];
      const t0 = Date.now();
      const res = await fetch(`http://localhost:${APP_PORT_DEAD_SMTP}/api/admin/users`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: deadCookie },
        body: JSON.stringify({ email: `${PREFIX}dead@ff21.ru`, role: "PLAYER" }),
      });
      const json = await res.json().catch(() => ({}));
      check("недоступный SMTP → 502 с причиной", res.status === 502 && /письмо не ушло/i.test(String(json.error ?? "")), `status=${res.status}`);
      const orphan = await db.user.findUnique({ where: { email: `${PREFIX}dead@ff21.ru` } });
      check("пользователь НЕ создан (откат)", orphan === null);
      check(`быстро (${Date.now() - t0} мс < 30 с)`, Date.now() - t0 < 30_000);
    } finally {
      dead.kill();
      await dead.exited.catch(() => {});
    }
  } finally {
    if (!killed.app) { app.kill(); killed.app = true; await app.exited.catch(() => {}); }
    if (!killed.smtp) { killed.smtp = true; smtp.close(); }
    await db.user.deleteMany({ where: { email: { contains: PREFIX } } }).catch(() => {});
    await db.$disconnect().catch(() => {});
  }

  console.log("");
  if (FAILS === 0) {
    console.log("ИТОГО: SMTP-режим приглашений — все проверки прошли");
  } else {
    console.log(`ИТОГО: упало проверок: ${FAILS}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("test-invites: фатальная ошибка", e);
  process.exit(1);
});
