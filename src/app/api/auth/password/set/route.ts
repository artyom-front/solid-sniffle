// v1.0.33 · Установка пароля по одноразовой ссылке (золотой стандарт).
// Супер-админ пароли НЕ видит и НЕ задаёт: пользователь получает ссылку
// письмом (SMTP-режим — клик доказывает владение ящиком) либо лично от
// админа (manual-режим). Виды ссылок: invite (48 ч) — приглашение, pwset
// (15 мин) — сброс. GET ?token= — предпросмотр (email для подтверждения),
// POST — подтверждение почты (или исправление опечатки) + установка пароля.
// После установки sessionVersion++ — ссылка и все старые сессии умирают,
// выдаётся свежая сессия (автовход).

import { db } from "@/lib/db";
import { verifyOneTimeLinkToken, verifyPassword, hashPassword, setSessionCookie, INVITE_TTL_MINUTES, PWSET_TTL_MINUTES } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/http";
import { overRate, recordHit, clientIp } from "@/lib/ratelimit";
import { audit } from "@/lib/engine/lifecycle";
import { ROLE_LABELS } from "@/lib/labels";

/** Сколько осталось жить токену (для текстов интерфейса) */
function tokenKindTtl(kind: "invite" | "pwset"): number {
  return kind === "invite" ? INVITE_TTL_MINUTES : PWSET_TTL_MINUTES;
}

function cleanEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(422, "Некорректный email");
  return email;
}

/** Разбор токена + сверка с пользователем; бросает HttpError при проблемах */
async function resolveToken(token: unknown) {
  const parsed = verifyOneTimeLinkToken(String(token ?? ""));
  if (!parsed) throw new HttpError(401, "Ссылка недействительна или истекла. Попросите новую");
  const user = await db.user.findUnique({ where: { id: parsed.uid }, include: { person: true } });
  if (!user || !user.isActive) throw new HttpError(401, "Ссылка недействительна");
  // Одноразовость: токен подписан версией сессий НА МОМЕНТ выдачи.
  // Установка/смена пароля инкрементирует версию — повтор не срабатывает.
  if (user.sessionVersion !== parsed.v) {
    throw new HttpError(401, "Ссылка уже использована (или пароль уже сменён). Запросите новую");
  }
  return { user, kind: parsed.kind };
}

export async function GET(req: Request) {
  const ip = clientIp(req);
  try {
    if (overRate(`pwset:${ip}`, 10, 10 * 60_000)) throw new HttpError(429, "Слишком много попыток. Подождите 10 минут");
    const token = new URL(req.url).searchParams.get("token");
    if (!token) throw new HttpError(422, "Нет токена");
    const { user, kind } = await resolveToken(token);
    return Response.json({
      email: user.email,
      emailVerified: user.emailVerified,
      kind,
      ttl: tokenKindTtl(kind),
      roleLabel: ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role,
    });
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) recordHit(`pwset:${ip}`);
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  try {
    if (overRate(`pwset:${ip}`, 10, 10 * 60_000)) throw new HttpError(429, "Слишком много попыток. Подождите 10 минут");

    const { token, newPassword, emailConfirmed, email: correctedEmail } = await req.json();
    if (!token || !newPassword) throw new HttpError(422, "Некорректная ссылка или пароль");
    const { user, kind } = await resolveToken(token);

    const newPw = String(newPassword);
    if (newPw.length < 8) throw new HttpError(422, "Пароль — минимум 8 символов");
    if (verifyPassword(newPw, user.passwordHash)) throw new HttpError(422, "Новый пароль совпадает с текущим");

    // ---------- v1.0.33 · подтверждение почты ----------
    // invite в SMTP-режиме пришёл в письме на этот адрес — клик по ссылке
    // уже доказал владение ящиком (ссылку из API админ не видит).
    // manual-режим / сброс: просим явно подтвердить или исправить адрес.
    const autoVerified = kind === "invite" && !!process.env.SMTP_HOST;
    let emailData: Record<string, unknown> = {};
    let finalEmail = user.email;
    let markVerified: boolean | null = null;

    if (correctedEmail !== undefined && correctedEmail !== null && String(correctedEmail).trim() !== "") {
      // пользователь нашёл опечатку: адрес меняется и снова требует
      // подтверждения (админ увидит в панели бейдж «не подтверждён»)
      const clean = cleanEmail(correctedEmail);
      if (clean !== user.email) {
        const dup = await db.user.findUnique({ where: { email: clean } });
        if (dup) throw new HttpError(409, "Пользователь с таким email уже существует");
        await db.user.update({ where: { id: user.id }, data: { email: clean, emailVerified: false } });
        emailData = { emailOld: user.email, emailNew: clean, emailCorrected: true };
        finalEmail = clean;
      }
    } else if (autoVerified && !user.emailVerified) {
      // ссылка пришла письмом на этот адрес — ящик подтверждён фактом клика
      markVerified = true;
      emailData = { emailVerifiedByMail: true };
    } else if (!user.emailVerified) {
      if (!emailConfirmed) {
        throw new HttpError(422, "Сначала подтвердите email (или исправьте его) — отметьте, что адрес верен");
      }
      markVerified = true;
      emailData = { emailConfirmed: true };
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(newPw),
        sessionVersion: { increment: 1 },
        passwordSet: true,
        ...(markVerified ? { emailVerified: true } : {}),
      },
    });
    await setSessionCookie(user.id, updated.sessionVersion);
    await audit(null, "User", user.id, "UPDATE", { password: "***" }, { password: "***", via: "one-time-link", email: finalEmail, ...emailData });

    return Response.json({
      id: user.id,
      email: finalEmail,
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
