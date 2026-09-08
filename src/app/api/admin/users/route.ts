// Управление пользователями (доступы) — только SUPER_ADMIN.
// GET  — список (роль, привязка к персоне/клубу, 2FA, статус)
// POST — создать: { email, password, role, personId?, clubId? }
// PATCH — { id, action }: resetPassword | setActive | resetTotp | setRole
// «Сброс 2FA» — админ отключает TOTP пользователю, потерявшему телефон.

import { db } from "@/lib/db";
import { requireRole, HttpError, hashPassword } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

const STAFF = ["SUPER_ADMIN", "LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE", "PLAYER"];

export async function GET() {
  try {
    await requireRole("SUPER_ADMIN");
    const users = await db.user.findMany({
      include: { person: true, club: true },
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
    const { email, password, role, personId, clubId } = await req.json();
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) throw new HttpError(422, "Некорректный email");
    if (!password || String(password).length < 8) throw new HttpError(422, "Пароль — минимум 8 символов");
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

    const user = await db.user.create({
      data: {
        email: cleanEmail,
        passwordHash: hashPassword(String(password)),
        role,
        personId: personId || null,
        clubId: clubId || null,
      },
    });
    await audit(admin, "User", user.id, "CREATE", null, { email: cleanEmail, role, personId: personId || null });
    return Response.json({ ok: true, id: user.id });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireRole("SUPER_ADMIN");
    const { id, action, password, active, role } = await req.json();
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, "Пользователь не найден");
    if (user.id === admin.id && (action === "setActive" || action === "setRole")) {
      throw new HttpError(422, "Нельзя менять собственный статус/роль");
    }

    switch (action) {
      case "resetPassword": {
        if (!password || String(password).length < 8) throw new HttpError(422, "Пароль — минимум 8 символов");
        await db.user.update({ where: { id }, data: { passwordHash: hashPassword(String(password)) } });
        await audit(admin, "User", id, "UPDATE", { password: "***" }, { password: "***" });
        return Response.json({ ok: true });
      }
      case "setActive": {
        await db.user.update({ where: { id }, data: { isActive: !!active } });
        await audit(admin, "User", id, "UPDATE", { isActive: user.isActive }, { isActive: !!active });
        return Response.json({ ok: true });
      }
      case "resetTotp": {
        await db.user.update({
          where: { id },
          data: { totpSecret: null, totpEnabled: false, totpLastStep: 0, recoveryCodes: null },
        });
        await audit(admin, "User", id, "UPDATE", { totpEnabled: user.totpEnabled }, { totpEnabled: false });
        return Response.json({ ok: true });
      }
      case "setRole": {
        if (!STAFF.includes(role)) throw new HttpError(422, `Роль: ${STAFF.join(", ")}`);
        await db.user.update({ where: { id }, data: { role } });
        await audit(admin, "User", id, "UPDATE", { role: user.role }, { role });
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
