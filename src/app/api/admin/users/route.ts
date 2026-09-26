// Управление пользователями (доступы) — только SUPER_ADMIN.
// GET   — список (роль, привязки, 2FA, статус, подтверждённость почты,
//         принятость приглашения) + mailMode (smtp | manual).
// POST  — создать: { email, role, personId?, clubId?, leagueId? }.
//         ПАРОЛЬ АДМИН НЕ ЗАДАЁТ — пользователь сам установит его по
//         одноразовой ссылке (золотой стандарт: пароль не знает никто).
//         v1.0.33: в SMTP-режиме ссылка-приглашение (48 ч) УХОДИТ ПИСЬМОМ
//         на указанный адрес — из ответа она исключена, админ её не видит;
//         без SMTP — returned для передачи лично (manual-режим).
// PATCH — { id, action }: resendInvite | requestPasswordReset | setEmail
//         | setActive | resetTotp | setRole | setLeague
// «Сброс 2FA» — админ отключает TOTP пользователю, потерявшему телефон.

import { db } from "@/lib/db";
import { requireRole, HttpError, hashPassword, inviteToken, passwordResetToken, INVITE_TTL_MINUTES } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { mailMode, sendMail, invitationMail, passwordResetMail, oneTimeLink } from "@/lib/mailer";
import { ROLE_LABELS } from "@/lib/labels";
import { randomBytes } from "crypto";

const STAFF = ["SUPER_ADMIN", "LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE", "PLAYER"];

/** Пароль-заглушка: случайные 32 байта — вход по нему невозможен,
 *  пока пользователь не установит свой пароль по ссылке. */
function unusablePasswordHash(): string {
  return hashPassword(randomBytes(32).toString("hex"));
}

function cleanEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(422, "Некорректный email");
  return email;
}

/** Отправить приглашение письмом (SMTP-режим). Ошибка → исключение в роут. */
async function sendInvitation(to: string, userId: string, sessionVersion: number, role: string): Promise<string> {
  const token = inviteToken(userId, sessionVersion);
  await sendMail(invitationMail(to, {
    link: oneTimeLink(token),
    roleLabel: ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role,
    ttlHours: INVITE_TTL_MINUTES / 60,
  }));
  return token;
}

export async function GET() {
  try {
    await requireRole("SUPER_ADMIN");
    const users = await db.user.findMany({
      include: { person: true, club: true, league: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return Response.json({
      mailMode: mailMode(),
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        totpEnabled: u.totpEnabled,
        personId: u.personId,
        personName: u.person ? `${u.person.lastName} ${u.person.firstName}` : null,
        clubId: u.clubId,
        clubName: u.club?.name ?? null,
        leagueId: u.leagueId,
        leagueName: u.league?.name ?? null,
        emailVerified: u.emailVerified,
        passwordSet: u.passwordSet,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireRole("SUPER_ADMIN");
    const { email, role, personId, clubId, leagueId } = await req.json();
    const clean = cleanEmail(email);
    if (!STAFF.includes(role)) throw new HttpError(422, `Роль: ${STAFF.join(", ")}`);
    const dup = await db.user.findUnique({ where: { email: clean } });
    if (dup) throw new HttpError(409, "Пользователь с таким email уже существует");
    if (personId) {
      const p = await db.person.findUnique({ where: { id: personId } });
      if (!p) throw new HttpError(404, "Персона не найдена");
    }
    if (clubId) {
      const c = await db.club.findUnique({ where: { id: clubId } });
      if (!c) throw new HttpError(404, "Клуб не найден");
    }
    // Скоуп лиги: только для LEAGUE_ADMIN (админ конкретной лиги)
    if (leagueId) {
      if (role !== "LEAGUE_ADMIN") throw new HttpError(422, "Привязка к лиге имеет смысл только для роли «Администратор лиги»");
      const l = await db.league.findUnique({ where: { id: leagueId } });
      if (!l) throw new HttpError(404, "Лига не найдена");
    }

    const user = await db.user.create({
      data: {
        email: clean,
        passwordHash: unusablePasswordHash(),
        role,
        personId: personId || null,
        clubId: clubId || null,
        leagueId: leagueId || null,
        // v1.0.33: ждёт принятия приглашения; почта не подтверждена
        passwordSet: false,
        emailVerified: false,
      },
    });

    // SMTP: письмо уходит на указанный адрес; ссылку админ НЕ видит.
    // Ошибка отправки → откат создания (аккаунт без приглашения — мусор).
    if (mailMode() === "smtp") {
      try {
        await sendInvitation(clean, user.id, user.sessionVersion, role);
        await audit(admin, "User", user.id, "CREATE", null, { email: clean, role, personId: personId || null, leagueId: leagueId || null, invite: "email-sent" });
        return Response.json({ ok: true, id: user.id, delivered: "email" });
      } catch (err) {
        await db.user.delete({ where: { id: user.id } }).catch(() => {});
        throw new HttpError(502, `Пользователь не создан — письмо не ушло: ${(err as Error).message}`);
      }
    }

    // manual: ссылка в ответе — передать лично, получатель подтвердит почту
    const token = inviteToken(user.id, user.sessionVersion);
    await audit(admin, "User", user.id, "CREATE", null, { email: clean, role, personId: personId || null, leagueId: leagueId || null, invite: "manual-link" });
    return Response.json({ ok: true, id: user.id, setupToken: token, delivered: "manual", ttlHours: INVITE_TTL_MINUTES / 60 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireRole("SUPER_ADMIN");
    const { id, action, active, role, leagueId, email } = await req.json();
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, "Пользователь не найден");
    if (user.id === admin.id && (action === "setActive" || action === "setRole" || action === "setLeague" || action === "setEmail")) {
      throw new HttpError(422, "Нельзя менять собственный статус/роль/скоуп/почту");
    }

    switch (action) {
      // v1.0.33 · повторная отправка приглашения: invite-ссылка (48 ч),
      // только тем, кто ещё НЕ установил пароль (иначе — requestPasswordReset)
      case "resendInvite": {
        if (user.passwordSet) throw new HttpError(422, "Пользователь уже принял приглашение — используйте сброс пароля");
        if (mailMode() === "smtp") {
          try {
            await sendInvitation(user.email, user.id, user.sessionVersion, user.role);
            await audit(admin, "User", id, "UPDATE", { invite: "***" }, { invite: "email-resent" });
            return Response.json({ ok: true, delivered: "email" });
          } catch (err) {
            throw new HttpError(502, `Письмо не ушло: ${(err as Error).message}`);
          }
        }
        const token = inviteToken(user.id, user.sessionVersion);
        await audit(admin, "User", id, "UPDATE", { invite: "***" }, { invite: "manual-link-resent" });
        return Response.json({ ok: true, token, delivered: "manual", ttlHours: INVITE_TTL_MINUTES / 60 });
      }

      // v1.0.32 · золотой стандарт: пароль задаёт ТОЛЬКО сам пользователь
      // по одноразовой ссылке. v1.0.33: в SMTP-режиме ссылка (15 мин) уходит
      // ПИСЬМОМ на адрес пользователя — админ её не видит.
      case "requestPasswordReset": {
        if (!user.passwordSet) throw new HttpError(422, "Пользователь ещё без пароля — отправьте приглашение (resendInvite)");
        if (mailMode() === "smtp") {
          try {
            const token = passwordResetToken(user.id, user.sessionVersion);
            await sendMail(passwordResetMail(user.email, { link: oneTimeLink(token) }));
            await audit(admin, "User", id, "UPDATE", { password: "***" }, { password: "***", action: "reset-link-emailed" });
            return Response.json({ ok: true, delivered: "email" });
          } catch (err) {
            throw new HttpError(502, `Письмо не ушло: ${(err as Error).message}`);
          }
        }
        const token = passwordResetToken(user.id, user.sessionVersion);
        await audit(admin, "User", id, "UPDATE", { password: "***" }, { password: "***", action: "reset-link-issued" });
        return Response.json({ ok: true, resetToken: token, delivered: "manual", expiresInMinutes: 15 });
      }

      // v1.0.33 · смена почты: адрес получает «не подтверждён» до подтверждения
      // пользователем. SMTP — письмо-приглашение уходит на НОВЫЙ адрес
      // (подтверждение ящика + установка пароля); manual — ссылка в ответе.
      case "setEmail": {
        const clean = cleanEmail(email);
        if (clean === user.email) throw new HttpError(422, "Новый адрес совпадает с текущим");
        const dup = await db.user.findUnique({ where: { email: clean } });
        if (dup) throw new HttpError(409, "Пользователь с таким email уже существует");
        await db.user.update({ where: { id }, data: { email: clean, emailVerified: false } });
        await audit(admin, "User", id, "UPDATE", { email: user.email }, { email: clean, emailVerified: false });
        if (mailMode() === "smtp") {
          try {
            await sendInvitation(clean, user.id, user.sessionVersion, user.role);
            return Response.json({ ok: true, delivered: "email", email: clean });
          } catch (err) {
            // почта уже сохранена — приглашение можно повторить позже
            throw new HttpError(502, `Адрес сохранён, но письмо не ушло: ${(err as Error).message}. Повторите позже кнопкой «Приглашение»`);
          }
        }
        const token = inviteToken(user.id, user.sessionVersion);
        return Response.json({ ok: true, token, delivered: "manual", email: clean, ttlHours: INVITE_TTL_MINUTES / 60 });
      }

      case "setActive": {
        await db.user.update({ where: { id }, data: { isActive: !!active } });
        await audit(admin, "User", id, "UPDATE", { isActive: user.isActive }, { isActive: !!active });
        return Response.json({ ok: true });
      }
      case "resetTotp": {
        // sessionVersion++ — сброс 2FA тоже инвалидирует активные сессии
        // (защита от «мошенник в аккаунте сбросил 2FA и остался в сессии»)
        await db.user.update({
          where: { id },
          data: { totpSecret: null, totpEnabled: false, totpLastStep: 0, recoveryCodes: null, sessionVersion: { increment: 1 } },
        });
        await audit(admin, "User", id, "UPDATE", { totpEnabled: user.totpEnabled }, { totpEnabled: false });
        return Response.json({ ok: true });
      }
      case "setRole": {
        if (!STAFF.includes(role)) throw new HttpError(422, `Роль: ${STAFF.join(", ")}`);
        // смена роли с LEAGUE_ADMIN на другую — скоуп лиги снимается
        const clearScope = role !== "LEAGUE_ADMIN";
        await db.user.update({ where: { id }, data: { role, ...(clearScope ? { leagueId: null } : {}) } });
        await audit(admin, "User", id, "UPDATE", { role: user.role }, { role });
        return Response.json({ ok: true });
      }
      case "setLeague": {
        // Скоуп лиги для LEAGUE_ADMIN: null = оператор всего турнирного ядра
        if (user.role !== "LEAGUE_ADMIN" && leagueId) {
          throw new HttpError(422, "Привязка к лиге имеет смысл только для роли «Администратор лиги»");
        }
        if (leagueId) {
          const l = await db.league.findUnique({ where: { id: leagueId } });
          if (!l) throw new HttpError(404, "Лига не найдена");
        }
        await db.user.update({ where: { id }, data: { leagueId: leagueId || null } });
        await audit(admin, "User", id, "UPDATE", { leagueId: user.leagueId }, { leagueId: leagueId || null });
        return Response.json({ ok: true });
      }
      default:
        throw new HttpError(422, "Неизвестное действие");
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
