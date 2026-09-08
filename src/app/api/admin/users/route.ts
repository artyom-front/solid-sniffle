import { db } from "@/lib/db";
import { hashPassword, requireRole, HttpError } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { audit } from "@/lib/engine/lifecycle";

// ============================================================
// Управление пользователями (SUPER_ADMIN): выдача боевых
// доступов другим ролям. Пароль задаётся при создании /
// сбрасывается админом; 2FA пользователь настраивает сам
// (раздел «Безопасность»), админ может её сбросить при
// утере телефона (PUT /api/admin/users/[id]).
// ============================================================

const ROLES = ["SUPER_ADMIN", "LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE", "PLAYER"];

/** Список сотрудников — БЕЗ секретов (hash, totpSecret, recoveryCodes) */
export async function GET() {
  try {
    await requireRole();
    const users = await db.user.findMany({
      include: { person: true, club: true },
      orderBy: [{ role: "asc" }, { email: "asc" }],
    });
    return Response.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        personId: u.personId,
        personName: u.person ? `${u.person.lastName} ${u.person.firstName}` : null,
        clubId: u.clubId,
        clubName: u.club?.name ?? null,
        totpEnabled: u.totpEnabled,
        recoveryLeft: u.recoveryCodes ? JSON.parse(u.recoveryCodes).length : 0,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Создание аккаунта: { email, password, role, clubId? } */
export async function POST(req: Request) {
  try {
    const admin = await requireRole();
    const body = await req.json().catch(() => ({}));

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, "Укажите корректный email");
    const password = String(body.password ?? "");
    if (password.length < 8) throw new HttpError(422, "Пароль — минимум 8 символов");
    const role = String(body.role ?? "");
    if (!ROLES.includes(role)) throw new HttpError(422, `Роль: ${ROLES.join(", ")}`);

    const clubId = body.clubId ? String(body.clubId) : null;
    if (clubId && role !== "CLUB_ADMIN") throw new HttpError(422, "Клуб указывается только для роли «Администратор клуба»");
    if (clubId && !(await db.club.findUnique({ where: { id: clubId } }))) throw new HttpError(404, "Клуб не найден");

    if (await db.user.findUnique({ where: { email } })) throw new HttpError(409, "Пользователь с таким email уже есть");

    const user = await db.user.create({
      data: { email, passwordHash: hashPassword(password), role, clubId },
    });
    await audit(admin, "User", user.id, "CREATE", null, { email, role, clubId });
    return Response.json({ ok: true, id: user.id, email, role });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
