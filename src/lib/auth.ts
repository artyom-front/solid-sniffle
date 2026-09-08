// Milestone 1: Аутентификация (JWT-подобные подписанные cookie-сессии) и RBAC
import { createHmac, scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";

// Секрет подписи сессий: в проде ОБЯЗАТЕЛЬНО задаётся AUTH_SECRET (openssl rand -hex 32)
const SECRET = process.env.AUTH_SECRET || "football-chuvashia-demo-secret-2026";
const COOKIE = "sid";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 дней

export type Role = "SUPER_ADMIN" | "LEAGUE_ADMIN" | "CLUB_ADMIN" | "REFEREE" | "PLAYER";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  personId: string | null;
  clubId: string | null;
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

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, signToken({ uid: userId }), {
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
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role as Role,
    personId: user.personId,
    clubId: user.clubId,
    personName: user.person ? `${user.person.lastName} ${user.person.firstName}` : null,
  };
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
