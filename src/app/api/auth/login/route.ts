import { db } from "@/lib/db";
import { verifyPassword, setSessionCookie, signToken } from "@/lib/auth";
import { errorResponse, HttpError } from "@/lib/http";

// Прод-защита от подбора пароля: скользящее окно на IP (в памяти процесса),
// считаются ТОЛЬКО НЕУДАЧНЫЕ попытки (успешные входы не расходуют лимит —
// иначе честные пользователи запираются). Для кластера выносится в Redis — см. DEPLOY.md.
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;
const failures = new Map<string, number[]>();

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

/** Вход сотрудников ФФЧ: пароль → (при включённом 2FA) → код TOTP.
 *  Ответ без сессии при 2FA: { otpRequired, challenge } — подписанный
 *  5-минутный челлендж, не дающий прав до подтверждения кода. */
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (overLimit(ip)) {
      throw new HttpError(429, "Слишком много неудачных попыток входа. Подождите минуту и попробуйте снова");
    }

    const { email, password } = await req.json();
    if (!email || !password) throw new HttpError(422, "Укажите email и пароль");

    const user = await db.user.findUnique({ where: { email: String(email).toLowerCase().trim() }, include: { person: true } });
    if (!user || !verifyPassword(String(password), user.passwordHash)) {
      recordFailure(ip);
      throw new HttpError(401, "Неверный email или пароль");
    }

    // ---------- 2FA: отдаём челлендж, сессию не выдаём ----------
    if (user.totpEnabled && user.totpSecret) {
      return Response.json({
        otpRequired: true,
        challenge: signToken({ uid: user.id, kind: "otp" }, 5 * 60),
        hint: user.email,
      });
    }

    await setSessionCookie(user.id);
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
