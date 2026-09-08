import { db } from "@/lib/db";
import { hashPassword, requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

// ============================================================
// Действия по сотруднику (SUPER_ADMIN):
//   PATCH { password }        — сбросить пароль
//   PATCH { totpReset: true } — выключить 2FA (утерян телефон)
//   PATCH { role, clubId? }   — сменить роль / клуб
//   DELETE                    — удалить аккаунт
// Защита: нельзя удалить себя и последнего супер-админа.
// ============================================================

const ROLES = ["SUPER_ADMIN", "LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE", "PLAYER"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole();
    const { id } = await params;
    const user = await db.user.findUnique({ where: { id }, include: { person: true } });
    if (!user) throw new HttpError(404, "Пользователь не найден");
    const body = await req.json().catch(() => ({}));

    // ---------- Сброс пароля ----------
    if (body.password !== undefined) {
      const password = String(body.password);
      if (password.length < 8) throw new HttpError(422, "Пароль — минимум 8 символов");
      await db.user.update({ where: { id }, data: { passwordHash: hashPassword(password) } });
      await audit(admin, "User", id, "RESET", null, { passwordReset: true, email: user.email });
    }

    // ---------- Сброс 2FA (утерян телефон / выдача доступа заново) ----------
    if (body.totpReset) {
      if (!user.totpEnabled) throw new HttpError(400, "У пользователя 2FA не включена");
      await db.user.update({
        where: { id },
        data: { totpEnabled: false, totpSecret: null, totpLastStep: 0, recoveryCodes: null },
      });
      await audit(admin, "User", id, "TOTP_DISABLE", { enabled: true, email: user.email }, { enabled: false, email: user.email });
    }

    // ---------- Смена роли / клуба ----------
    if (body.role !== undefined || body.clubId !== undefined) {
      const role = body.role !== undefined ? String(body.role) : user.role;
      if (!ROLES.includes(role)) throw new HttpError(422, `Роль: ${ROLES.join(", ")}`);
      if (role === "SUPER_ADMIN" || user.role === "SUPER_ADMIN") {
        // смена прав супеp-админа — только супеp-админу; нельзя разжаловать
        // последнего SUPER_ADMIN
        const superCount = await db.user.count({ where: { role: "SUPER_ADMIN" } });
        if (user.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN" && superCount <= 1) {
          throw new HttpError(409, "Нельзя понизить последнего супер-администратора");
        }
      }
      const clubId = body.clubId !== undefined ? (body.clubId ? String(body.clubId) : null) : user.clubId;
      if (clubId && role !== "CLUB_ADMIN") throw new HttpError(422, "Клуб указывается только для роли «Администратор клуба»");
      if (clubId && !(await db.club.findUnique({ where: { id: clubId } }))) throw new HttpError(404, "Клуб не найден");
      await db.user.update({ where: { id }, data: { role, clubId } });
      await audit(admin, "User", id, "UPDATE", { role: user.role, clubId: user.clubId }, { role, clubId });
    }

    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole();
    const { id } = await params;
    if (id === admin.id) throw new HttpError(409, "Нельзя удалить собственный аккаунт");
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw new HttpError(404, "Пользователь не найден");
    if (user.role === "SUPER_ADMIN") {
      const superCount = await db.user.count({ where: { role: "SUPER_ADMIN" } });
      if (superCount <= 1) throw new HttpError(409, "Нельзя удалить последнего супер-администратора");
    }
    await db.user.delete({ where: { id } });
    await audit(admin, "User", id, "DELETE", { email: user.email, role: user.role }, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
