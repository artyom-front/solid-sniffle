// v1.0.33 · Юнит-тесты одноразовых ссылок (invite/pwset) и почты:
// TTL по видам, верификация, построение ссылок, режимы доставки,
// шаблоны писем. Сеть не нужна (транспорт не создаётся).

import { describe, expect, test, afterEach } from "bun:test";
import {
  inviteToken,
  passwordResetToken,
  verifyOneTimeLinkToken,
  verifyToken,
  signToken,
  INVITE_TTL_MINUTES,
  PWSET_TTL_MINUTES,
} from "@/lib/auth";
import { invitationMail, passwordResetMail, oneTimeLink, mailMode, sendMail } from "@/lib/mailer";

const UID = "cmu_test_user";
const V = 3;

describe("Одноразовые ссылки: виды и TTL", () => {
  test("константы: приглашение 48 ч, сброс 15 мин", () => {
    expect(INVITE_TTL_MINUTES).toBe(48 * 60);
    expect(PWSET_TTL_MINUTES).toBe(15);
  });

  test("invite-токен: kind=invite, живёт ~48 ч", () => {
    const token = inviteToken(UID, V);
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    expect(payload.kind).toBe("invite");
    expect(payload.v).toBe(V);
    expect(payload.exp - Date.now()).toBeGreaterThan(47 * 60 * 60 * 1000);
    expect(payload.exp - Date.now()).toBeLessThan(49 * 60 * 60 * 1000);
  });

  test("pwset-токен: kind=pwset, живёт ~15 мин", () => {
    const token = passwordResetToken(UID, V);
    const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
    expect(payload.kind).toBe("pwset");
    expect(payload.exp - Date.now()).toBeGreaterThan(14 * 60 * 1000);
    expect(payload.exp - Date.now()).toBeLessThan(16 * 60 * 1000);
  });

  test("verifyOneTimeLinkToken: обе ссылки читаются, мусор — null", () => {
    expect(verifyOneTimeLinkToken(inviteToken(UID, V))).toEqual({ uid: UID, v: V, kind: "invite" });
    expect(verifyOneTimeLinkToken(passwordResetToken(UID, V))).toEqual({ uid: UID, v: V, kind: "pwset" });
    expect(verifyOneTimeLinkToken("garbage")).toBeNull();
    expect(verifyOneTimeLinkToken("")).toBeNull();
  });

  test("сессионный токен (без kind) и просроченный — не проходят", () => {
    const session = signToken({ uid: UID, v: V });
    expect(verifyOneTimeLinkToken(session)).toBeNull();
    const stale = signToken({ uid: UID, kind: "invite", v: V }, -60);
    expect(verifyToken(stale)).toBeNull();
    expect(verifyOneTimeLinkToken(stale)).toBeNull();
  });
});

describe("Почта: режимы, ссылки, шаблоны", () => {
  afterEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SITE_URL;
  });

  test("mailMode: без SMTP_HOST — manual, с ним — smtp", () => {
    delete process.env.SMTP_HOST;
    expect(mailMode()).toBe("manual");
    process.env.SMTP_HOST = "smtp.example.ru";
    expect(mailMode()).toBe("smtp");
  });

  test("oneTimeLink: SITE_URL + хвост слэшей обрезается", () => {
    process.env.SITE_URL = "https://scoresbox.ru/";
    expect(oneTimeLink("TOK")).toBe("https://scoresbox.ru/admin?pwset=TOK");
    process.env.SITE_URL = "http://localhost:3100";
    expect(oneTimeLink("A.B")).toBe("http://localhost:3100/admin?pwset=A.B");
    delete process.env.SITE_URL;
    // без SITE_URL — домен по умолчанию
    expect(oneTimeLink("X")).toMatch(/^https:\/\/scoresbox\.ru\/admin\?pwset=X$/);
  });

  test("sendMail без SMTP-конфигурации — явная ошибка (не молчание)", async () => {
    delete process.env.SMTP_HOST;
    await expect(sendMail({ to: "a@b.ru", subject: "s", text: "t", html: "<p>t</p>" })).rejects.toThrow(/SMTP не настроен/);
  });

  test("письмо-приглашение: адрес, ссылка, роль, TTL", () => {
    process.env.SITE_URL = "https://scoresbox.ru";
    const mail = invitationMail("player@ff21.ru", { link: "https://scoresbox.ru/admin?pwset=T1", roleLabel: "Судья", ttlHours: 48 });
    expect(mail.to).toBe("player@ff21.ru");
    expect(mail.subject).toContain("приглашение");
    expect(mail.text).toContain("player@ff21.ru");
    expect(mail.text).toContain("https://scoresbox.ru/admin?pwset=T1");
    expect(mail.text).toContain("Судья");
    expect(mail.html).toContain("admin?pwset=T1");
    // ссылка переносится в письме (word-break) — не ломает вёрстку
    expect(mail.html).toContain("word-break:break-all");
  });

  test("письмо-сброс: адрес, ссылка, срок 15 минут", () => {
    const mail = passwordResetMail("admin@ff21.ru", { link: "https://scoresbox.ru/admin?pwset=T2" });
    expect(mail.to).toBe("admin@ff21.ru");
    expect(mail.subject).toContain("сброс");
    expect(mail.text).toContain("15 минут");
    expect(mail.text).toContain("https://scoresbox.ru/admin?pwset=T2");
    expect(mail.html).toContain("сброс");
  });
});
