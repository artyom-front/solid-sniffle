// Milestone 1: Аутентификация (JWT-подобные подписанные cookie-сессии) и RBAC
import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";

// Секрет подписи сессий.
// SECURITY: молчаливый fallback на известный из открытого репозитория секрет
// означал бы, что любой может подделать cookie. В production AUTH_SECRET
// обязателен (openssl rand -hex 32 — см. DEPLOY.md); dev/test может работать
// без него — тогда используется локальный нестабильный секрет.
function resolveSecret(): string {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv) return fromEnv;
  // next build импортирует роуты для сбора page data с NODE_ENV=production —
  // в фазе сборки токены никто не подписывает, допускаем placeholder.
  // На runtime (standalone server.js) NEXT_PHASE такой не бывает — там
  // отсутствие AUTH_SECRET в проде = жёсткий отказ старта.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error(
      "AUTH_SECRET не задан в production — подписание сессий открытым секретом запрещено. " +
        "Сгенерируйте: openssl rand -hex 32 (см. DEPLOY.md)"
    );
  }
  return "dev-insecure-secret-not-for-production";
}
const SECRET = resolveSecret();
const COOKIE = "sid";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 дней

export type Role = "SUPER_ADMIN" | "LEAGUE_ADMIN" | "CLUB_ADMIN" | "REFEREE" | "PLAYER";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  personId: string | null;
  clubId: string | null;
  /** v1.0.32: скоуп лиги LEAGUE_ADMIN (админ конкретной лиги) */
  leagueId: string | null;
  personName: string | null;
}

// ---------- Пароли (scrypt) ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ---------- Токены (HMAC-SHA256) ----------

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

export function signToken(payload: object, ttl = TTL_SECONDS): string {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + ttl * 1000 }));
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- Сессия ----------

export async function setSessionCookie(userId: string, sessionVersion = 0) {
  const jar = await cookies();
  // v — версия сессий пользователя: инкремент при сбросе пароля/2FA
  // мгновенно обесценивает ВСЕ выданные токены (см. getSessionUser)
  jar.set(COOKIE, signToken({ uid: userId, v: sessionVersion }), {
    httpOnly: true,
    sameSite: "lax",
    // в проде (HTTPS за nginx) кука помечается Secure; DEV_INSECURE_COOKIE=1 —
    // аварийный тумблер для локального HTTP-тестинга прод-сборки
    secure: process.env.NODE_ENV === "production" && process.env.DEV_INSECURE_COOKIE !== "1",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || typeof payload.uid !== "string") return null;

  const user = await db.user.findUnique({
    where: { id: payload.uid },
    include: { person: true },
  });
  // SECURITY: блокировка аккаунта (isActive=false) убивает и уже выданные
  // сессии — иначе 7-дневная кука переживает деактивацию SUPER_ADMIN-ом.
  // requireRole() ниже автоматически перестаёт пропускать заблокированного.
  if (!user || !user.isActive) return null;

  // SECURITY (v1.0.23): версия сессий. Токены, выданные ДО сброса пароля/
  // 2FA, хранят старую версию и умирают сразу после инкремента на сервере.
  // Легаси-токены без «v» (выданные до v1.0.23) трактуются как v=0 —
  // обновление само по себе не выкидывает пользователей.
  const tokenVersion = typeof payload.v === "number" ? payload.v : 0;
  if (tokenVersion !== user.sessionVersion) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role as Role,
    personId: user.personId,
    clubId: user.clubId,
    leagueId: user.leagueId,
    personName: user.person ? `${user.person.lastName} ${user.person.firstName}` : null,
  };
}

// ---------- Одноразовые токены установки пароля (v1.0.32) ----------

/** Токен сброса/установки пароля: HMAC-подписанный, 15 минут, одноразовый.
 *  payload.v = sessionVersion пользователя НА МОМЕНТ ВЫДАЧИ: после установки
 *  пароля (или самостоятельной смены) sessionVersion инкрементируется —
 *  токен мгновенно умирает. Супер-админ пароль НЕ видит — только ссылку. */
export function passwordResetToken(userId: string, sessionVersion: number): string {
  return signToken({ uid: userId, kind: "pwset", v: sessionVersion }, 15 * 60);
}

/** Проверка токена сброса: возвращает { uid, v } или null (истёк/подделан) */
export function verifyPasswordResetToken(token: string): { uid: string; v: number } | null {
  const payload = verifyToken(token);
  if (!payload || payload.kind !== "pwset" || typeof payload.uid !== "string" || typeof payload.v !== "number") return null;
  return { uid: payload.uid, v: payload.v };
}

/** RBAC: пропускает роли из списка; SUPER_ADMIN проходит всегда */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Требуется авторизация");
  if (user.role !== "SUPER_ADMIN" && !roles.includes(user.role)) {
    throw new HttpError(403, "Недостаточно прав для этой операции");
  }
  return user;
}

export { HttpError };
