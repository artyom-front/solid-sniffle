// ============================================================
// v1.0.33 · Отправка писем (приглашения / сброс пароля).
// ЗОЛОТОЙ СТАНДАРТ: одноразовая ссылка уходит ТОЛЬКО на email
// пользователя. Пока ссылку видит и пересылает админ — адрес
// «верифицирован» честным словом; когда ссылка приходит письмом
// на указанный ящик, клик по ней доказывает владение ящиком.
//
// Режимы доставки:
//   SMTP   — задан SMTP_HOST (+ учётка): письма уходят сами,
//            ссылки из ответов API исключены — админ их не видит;
//   manual — SMTP не настроен: ссылка показывается админу для
//            передачи лично (режим совместимости, см. UsersPanel).
//
// Переменные окружения (см. .env.example, раздел «Почта»):
//   SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (true = TLS/465),
//   SMTP_USER, SMTP_PASS, MAIL_FROM, SITE_URL (для ссылок).
// ============================================================

import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export type MailMode = "smtp" | "manual";

export function mailMode(): MailMode {
  return process.env.SMTP_HOST ? "smtp" : "manual";
}

/** Абсолютная ссылка установки пароля: /admin?pwset=<токен> */
export function oneTimeLink(token: string): string {
  const base = (process.env.SITE_URL || "https://scoresbox.ru").replace(/\/+$/, "");
  return `${base}/admin?pwset=${token}`;
}

// ---------- Транспорт (лениво, чтобы env читался на момент вызова) ----------

let cached: Transporter | null = null;

function getTransport(): Transporter {
  if (cached) return cached;
  const host = process.env.SMTP_HOST!;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const opts: SMTPTransport.Options = {
    host,
    port,
    secure,
    ...(process.env.SMTP_USER
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } }
      : {}),
    // соединение умирает молча (упавший релей в докере) — не копим сокеты
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  };
  cached = nodemailer.createTransport(opts);
  return cached;
}

/** Тест-хук: подменяет транспорт (unit-тесты без сети) */
export function __setTransportForTests(t: Transporter | null): void {
  cached = t;
}

// ---------- Письма ----------

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function mailFrom(): string {
  return process.env.MAIL_FROM || "SCORESBOX <no-reply@scoresbox.ru>";
}

/** Отправка (только SMTP-режим). Ошибки всплывают в роут → 502 + причина. */
export async function sendMail(mail: OutgoingMail): Promise<void> {
  if (mailMode() !== "smtp") {
    throw new Error("SMTP не настроен — вызов sendMail возможен только в SMTP-режиме");
  }
  await getTransport().sendMail({
    from: mailFrom(),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

// ---------- Шаблоны (текст + простой HTML без внешних ресурсов) ----------

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="ru"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;padding:28px">
    <tr><td style="padding-bottom:18px;font-size:18px;font-weight:800">${title}</td></tr>
    <tr><td style="font-size:14px;line-height:1.6;color:#3f3f46">${bodyHtml}</td></tr>
    <tr><td style="padding-top:22px;font-size:11px;color:#a1a1aa">Это автоматическое письмо сайта SCORESBOX. Если вы его не запрашивали — просто удалите.</td></tr>
  </table></body></html>`;
}

function linkBlock(link: string, ttlHuman: string): string {
  return `<p style="margin:16px 0"><a href="${link}" style="display:inline-block;background:#d4a017;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">Открыть ссылку</a></p>
  <p style="margin:6px 0;font-size:12px;color:#71717a">Ссылка одноразовая и действует ${ttlHuman}. Если кнопка не работает, скопируйте адрес в браузер:</p>
  <p style="margin:4px 0;word-break:break-all;font-size:12px"><a href="${link}" style="color:#d4a017">${link}</a></p>`;
}

/** Приглашение новому пользователю (email — подтверждение адреса + пароль) */
export function invitationMail(to: string, opts: { link: string; roleLabel: string; ttlHours: number }): OutgoingMail {
  const ttlHuman = opts.ttlHours >= 24 ? `${Math.round(opts.ttlHours / 24)} дн.` : `${opts.ttlHours} ч`;
  return {
    to,
    subject: "SCORESBOX · приглашение (установка пароля)",
    text:
      `Вас пригласили на сайт SCORESBOX.\n\n` +
      `Роль: ${opts.roleLabel}.\nЛогин: ${to}\n\n` +
      `Установите свой пароль по одноразовой ссылке (${ttlHuman}):\n${opts.link}\n\n` +
      `Откроется страница «Установка пароля»: проверьте адрес и придумайте пароль (минимум 8 символов).\n` +
      `Если вы не ждёте приглашения — проигнорируйте это письмо.\n`,
    html: wrapHtml(
      "Приглашение на SCORESBOX",
      `<p>Вас пригласили на сайт SCORESBOX.</p>
       <p>Роль: <b>${opts.roleLabel}</b><br>Логин (email): <b>${to}</b></p>
       ${linkBlock(opts.link, ttlHuman)}
       <p>Откроется страница «Установка пароля»: <b>проверьте, верно ли указан email</b>, и придумайте пароль (минимум 8 символов).</p>`,
    ),
  };
}

/** Сброс пароля для действующего пользователя */
export function passwordResetMail(to: string, opts: { link: string }): OutgoingMail {
  const link = opts.link;
  return {
    to,
    subject: "SCORESBOX · сброс пароля",
    text:
      `Запрошен сброс пароля аккаунта ${to}.\n\n` +
      `Задайте новый пароль по одноразовой ссылке (15 минут):\n${link}\n\n` +
      `Если вы не запрашивали сброс — просто удалите письмо: пароль не изменится.\n`,
    html: wrapHtml(
      "Сброс пароля",
      `<p>Запрошен сброс пароля аккаунта <b>${to}</b>.</p>
       ${linkBlock(link, "15 минут")}
       <p>Все прежние входы этого аккаунта закроются. Если вы не запрашивали сброс — просто удалите письмо: пароль не изменится.</p>`,
    ),
  };
}
