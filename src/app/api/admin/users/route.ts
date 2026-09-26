// Управление пользователями (доступы) — только SUPER_ADMIN.
// GET   — список (роль, привязка к персоне/клубу/лиге, 2FA, статус)
// POST  — создать: { email, role, personId?, clubId?, leagueId? }.
//         ПАРОЛЬ АДМИН НЕ ЗАДАЁТ: пользователю выдаётся одноразовая
//         ссылка установки пароля (15 минут, живёт один раз) — он сам
//         задаёт пароль по ней. Золотой стандарт: никто не знает чужой
//         пароль, включая супер-админа.
// PATCH — { id, action }: requestPasswordReset | setActive | resetTotp
//         | setRole | setLeague
// «Сброс 2FA» — админ отключает TOTP пользователю, потерявшему телефон.

import { db } from "@/lib/db";
import { requireRole, HttpError, hashPassword, passwordResetToken } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";
import { randomBytes } from "crypto";

const STAFF = ["SUPER_ADMIN", "LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE", "PLAYER"];

/** Пароль-заглушка: случайные 32 байта — вход по нему невозможен,
 *  пока пользователь не установит свой пароль по ссылке. */
function unusablePasswordHash(): string {
  return hashPassword(randomBytes(32).toString("hex"));
}

export async function GET() {
  try {
    await requireRole("SUPER_ADMIN");
    const users = await db.user.findMany({
      include: { person: true, club: true, league: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return Response.json({
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
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) throw new HttpError(422, "Некорректный email");
    if (!STAFF.includes(role)) throw new HttpError(422, `Роль: ${STAFF.join(", ")}`);
    const dup = await db.user.findUnique({ where: { email: cleanEmail } });
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
        email: cleanEmail,
        passwordHash: unusablePasswordHash(),
        role,
        personId: personId || null,
        clubId: clubId || null,
        leagueId: leagueId || null,
      },
    });
    const link = passwordResetToken(user.id, user.sessionVersion);
    await audit(admin, "User", user.id, "CREATE", null, { email: cleanEmail, role, personId: personId || null, leagueId: leagueId || null });
    return Response.json({ ok: true, id: user.id, setupToken: link });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireRole("SUPER_ADMIN");
    const { id, action, active, role, leagueId } = await req.json();
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, "Пользователь не найден");
    if (user.id === admin.id && (action === "setActive" || action === "setRole" || action === "setLeague")) {
      throw new HttpError(422, "Нельзя менять собственный статус/роль/скоуп");
    }

    switch (action) {
      // v1.0.32 · золотой стандарт: пароль задаёт ТОЛЬКО сам пользователь
      // по одноразовой ссылке. Админ её запрашивает и передаёт по защищённому
      // каналу (лично/мессенджер). Пароль никто не видит.
      case "requestPasswordReset": {
        const token = passwordResetToken(user.id, user.sessionVersion);
        await audit(admin, "User", id, "UPDATE", { password: "***" }, { password: "***", action: "reset-link-issued" });
        return Response.json({ ok: true, resetToken: token, expiresInMinutes: 15 });
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
