// v1.0.32 · Установка пароля по одноразовой ссылке (золотой стандарт).
// Супер-админ пароли НЕ видит и НЕ задаёт: он выдаёт пользователю ссылку
// /admin?pwset=<токен> (15 минут, одноразовая). Пользователь сам задаёт
// пароль здесь. После установки sessionVersion++ — токен и все старые
// сессии пользователя умирают, выдаётся свежая сессия (автовход).

import { db } from "@/lib/db";
import { verifyPasswordResetToken, verifyPassword, hashPassword, setSessionCookie } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/http";
import { overRate, recordHit, clientIp } from "@/lib/ratelimit";
import { audit } from "@/lib/engine/lifecycle";

export async function POST(req: Request) {
  const ip = clientIp(req);
  try {
    if (overRate(`pwset:${ip}`, 10, 10 * 60_000)) throw new HttpError(429, "Слишком много попыток. Подождите 10 минут");

    const { token, newPassword } = await req.json();
    if (!token || !newPassword) throw new HttpError(422, "Некорректная ссылка или пароль");
    const parsed = verifyPasswordResetToken(String(token));
    if (!parsed) throw new HttpError(401, "Ссылка недействительна или истекла (живёт 15 минут). Попросите новую");

    const user = await db.user.findUnique({ where: { id: parsed.uid }, include: { person: true } });
    if (!user || !user.isActive) throw new HttpError(401, "Ссылка недействительна");

    // Одноразовость: токен подписан версией сессий НА МОМЕНТ выдачи.
    // Установка пароля инкрементирует версию — повтор и «выдать после
    // самостоятельной смены» не срабатывают.
    if (user.sessionVersion !== parsed.v) {
      throw new HttpError(401, "Ссылка уже использована (или пароль уже сменён). Запросите новую");
    }

    const newPw = String(newPassword);
    if (newPw.length < 8) throw new HttpError(422, "Пароль — минимум 8 символов");
    if (verifyPassword(newPw, user.passwordHash)) throw new HttpError(422, "Новый пароль совпадает с текущим");

    const updated = await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPw), sessionVersion: { increment: 1 } },
    });
    await setSessionCookie(user.id, updated.sessionVersion);
    await audit(null, "User", user.id, "UPDATE", { password: "***" }, { password: "***", via: "one-time-link", email: user.email });

    return Response.json({
      id: user.id,
      email: user.email,
      role: user.role,
      personId: user.personId,
      clubId: user.clubId,
      leagueId: user.leagueId,
      personName: user.person ? `${user.person.lastName} ${user.person.firstName}` : null,
    });
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) recordHit(`pwset:${ip}`);
    return errorResponse(e);
  }
}

export const dynamic = "force-dynamic";
