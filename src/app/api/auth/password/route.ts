// v1.0.32 · Смена СОБСТВЕННОГО пароля (золотой стандарт).
// Требует текущий пароль (а при включённой 2FA — ещё и код TOTP):
// украденная сессия не позволяет тихо перехватить аккаунт.
// sessionVersion++ убивает ВСЕ остальные сессии; текущая — продлевается.

import { db } from "@/lib/db";
import { getSessionUser, verifyPassword, hashPassword, setSessionCookie } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/http";
import { verifyTotp } from "@/lib/totp";
import { overRate, recordHit, clientIp } from "@/lib/ratelimit";
import { audit } from "@/lib/engine/lifecycle";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Требуется авторизация");

    // подбор текущего пароля через этот эндпоинт — лимит 5 попыток / 10 мин на юзера
    const key = `pwchange:${user.id}:${clientIp(req)}`;
    if (overRate(key, 5, 10 * 60_000)) throw new HttpError(429, "Слишком много попыток. Подождите 10 минут");
    const { currentPassword, newPassword, totp } = await req.json();
    if (!currentPassword || !newPassword) throw new HttpError(422, "Укажите текущий и новый пароль");
    const fresh = await db.user.findUnique({ where: { id: user.id } });
    if (!fresh || !verifyPassword(String(currentPassword), fresh.passwordHash)) {
      recordHit(key);
      throw new HttpError(401, "Текущий пароль неверен");
    }
    const newPw = String(newPassword);
    if (newPw.length < 8) throw new HttpError(422, "Новый пароль — минимум 8 символов");
    if (verifyPassword(newPw, fresh.passwordHash)) throw new HttpError(422, "Новый пароль совпадает с текущим");

    // 2FA включена → смена пароля подтверждается и кодом приложения
    if (fresh.totpEnabled && fresh.totpSecret) {
      if (!totp) throw new HttpError(422, "Введите код из приложения-аутентификатора (2FA включена)");
      const step = verifyTotp(fresh.totpSecret, String(totp), { lastStep: fresh.totpLastStep });
      if (step === null) throw new HttpError(422, "Код 2FA неверен");
      await db.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPw), sessionVersion: { increment: 1 } },
    });
    // продлеваем ТОЛЬКО текущую сессию (остальные умерли вместе с версией)
    await setSessionCookie(user.id, updated.sessionVersion);
    await audit(user, "User", user.id, "UPDATE", { password: "***" }, { password: "***", self: true });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
