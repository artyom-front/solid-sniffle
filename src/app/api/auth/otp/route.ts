import { db } from "@/lib/db";
import { setSessionCookie, verifyToken } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/http";
import { verifyTotp, findRecoveryCode } from "@/lib/totp";
import { audit } from "@/lib/engine/lifecycle";

// ---------- Rate limit: только НЕУДАЧНЫЕ попытки (10/мин на IP) + 10 провалов на челлендж ----------
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
const failures = new Map<string, number[]>();
const challengeFails = new Map<string, number>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

function overLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(ip, arr);
  if (failures.size > 10_000) failures.clear();
  return arr.length >= MAX_ATTEMPTS;
}

function recordFailure(ip: string) {
  const now = Date.now();
  const arr = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  failures.set(ip, arr);
}

function bumpChallengeFail(challenge: string): number {
  const n = (challengeFails.get(challenge) ?? 0) + 1;
  challengeFails.set(challenge, n);
  return n;
}

/** Шаг 2 входа при включённой 2FA: проверка 6-значного кода из приложения
 *  (RFC 6238, окно ±30 с, защита от повтора) или одного из резервных кодов. */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (overLimit(ip)) {
      throw new HttpError(429, "Слишком много неверных кодов. Подождите минуту");
    }

    const { challenge, code, recoveryCode } = await req.json();
    if (!challenge || !(code || recoveryCode)) throw new HttpError(422, "Укажите код подтверждения");

    // челлендж должен быть подписан и жив (5 минут)
    const payload = verifyToken(String(challenge));
    if (!payload || payload.kind !== "otp" || typeof payload.uid !== "string") {
      throw new HttpError(401, "Сессия подтверждения истекла — войдите заново");
    }

    // 10 провалов на один челлендж — челлендж сгорает
    if ((challengeFails.get(String(challenge)) ?? 0) >= 10) {
      throw new HttpError(429, "Слишком много неверных кодов. Войдите заново");
    }

    const user = await db.user.findUnique({ where: { id: payload.uid }, include: { person: true } });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      throw new HttpError(400, "Двухфакторная аутентификация не включена");
    }

    // ---------- Путь 1: код из приложения-аутентификатора ----------
    if (code) {
      const step = verifyTotp(user.totpSecret, String(code), { lastStep: user.totpLastStep });
      if (!step) {
        recordFailure(ip);
        if (bumpChallengeFail(String(challenge)) >= 10) {
          throw new HttpError(429, "Слишком много неверных кодов. Войдите заново");
        }
        throw new HttpError(401, "Неверный или уже использованный код");
      }
      // анти-replay: зафиксировали принятый шаг
      await db.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
    }

    // ---------- Путь 2: резервный код (одноразовый) ----------
    if (recoveryCode) {
      const hashes: string[] = user.recoveryCodes ? JSON.parse(user.recoveryCodes) : [];
      const idx = findRecoveryCode(String(recoveryCode), hashes);
      if (idx < 0) {
        recordFailure(ip);
        if (bumpChallengeFail(String(challenge)) >= 10) {
          throw new HttpError(429, "Слишком много неверных кодов. Войдите заново");
        }
        throw new HttpError(401, "Неверный резервный код");
      }
      // израсходовали — убираем из списка
      hashes.splice(idx, 1);
      await db.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(hashes) } });
    }

    challengeFails.delete(String(challenge));
    await setSessionCookie(user.id);
    await audit(
      { id: user.id, email: user.email, role: user.role as never, personId: user.personId, clubId: user.clubId, personName: null },
      "Session",
      user.id,
      "OTP_LOGIN",
      null,
      { method: code ? "totp" : "recovery_code" }
    );

    return Response.json({
      id: user.id,
      email: user.email,
      role: user.role,
      personId: user.personId,
      clubId: user.clubId,
      personName: user.person ? `${user.person.lastName} ${user.person.firstName}` : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
