// ============================================================
// TOTP (RFC 6238) — двухфакторная аутентификация сотрудников.
// Совместим с Google Authenticator / Yandex Key / 1Password:
// HMAC-SHA1, 6 цифр, шаг 30 с, окно ±1 (защита от рассинхрона часов).
// ============================================================

import { createHmac, randomBytes, createHash } from "crypto";

export const TOTP_STEP = 30; // секунд
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1; // ±1 шаг

// ---------- Base32 (RFC 4648) ----------

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  // паддинг до кратности 8 (RFC 4648); приложения-аутентификаторы
  // принимают и без него, но с ним — строгая совместимость
  while (out.length % 8 !== 0) out += "=";
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ---------- Генерация секрета ----------

/** 20 случайных байт → base32 (32 символа) — стандартный размер для приложений-аутентификаторов */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

// ---------- Код по шагу ----------

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(buf).digest();
  // динамическое усечение (RFC 4226 §5.3)
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return (code % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

/** Номер текущего 30-секундного шага (epoch / 30) */
export function currentStep(forTime = Date.now()): number {
  return Math.floor(forTime / 1000 / TOTP_STEP);
}

export function totpCode(secretBase32: string, step: number): string {
  return hotp(base32Decode(secretBase32), step);
}

// ---------- Проверка ----------

/**
 * Проверяет 6-значный код в окне ±TOTP_WINDOW шагов.
 * Возвращает принятый шаг (для анти-replay) или null.
 * lastStep: кода шагов ≤ lastStep не принимаются (уже использованными считаются).
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { forTime?: number; window?: number; lastStep?: number } = {}
): number | null {
  const normalized = code.replace(/\D/g, "");
  if (normalized.length !== TOTP_DIGITS) return null;
  const nowStep = currentStep(opts.forTime);
  const window = opts.window ?? TOTP_WINDOW;
  const lastStep = opts.lastStep ?? 0;
  // идём от свежих шагов к старым: предпочитаем актуальный
  for (let offset = 0; offset >= -window; offset--) {
    const step = nowStep + offset;
    if (step <= lastStep) continue; // replay-защита
    const expected = hotp(base32Decode(secretBase32), step);
    if (timingSafeEqualStr(normalized, expected)) return step;
  }
  return null;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- otpauth:// URI (пейринг по QR) ----------

export function otpauthUri(opts: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---------- Резервные коды ----------

/** 8 кодов формата XXXX-XXXX; возвращаются открытым текстом один раз, в БД — sha256 */
export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString("hex").toUpperCase(); // 8 hex-символов
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

/** Проверяет код по списку хэшей; возвращает индекс использованного кода или -1 */
export function findRecoveryCode(code: string, hashes: string[]): number {
  const h = hashRecoveryCode(code);
  return hashes.findIndex((x) => x === h);
}
