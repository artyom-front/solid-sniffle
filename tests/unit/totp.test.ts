import { describe, expect, test } from "bun:test";
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  totpCode,
  currentStep,
  verifyTotp,
  otpauthUri,
  generateRecoveryCodes,
  hashRecoveryCode,
  findRecoveryCode,
  TOTP_STEP,
} from "@/lib/totp";

// RFC 6238: секрет-вектор SHA-1 (ASCII «12345678901234567890» → base32)
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP · base32 (RFC 4648)", () => {
  test("кодирование/декодирование — обратимы", () => {
    for (const len of [1, 5, 10, 20, 32]) {
      const buf = Buffer.from(Array.from({ length: len }, (_, i) => (i * 37 + 11) % 256));
      expect(base32Decode(base32Encode(buf))).toEqual(buf);
    }
  });

  test("известный вектор: 'h' → 'NA======', 'he' → 'NBSQ===='", () => {
    expect(base32Encode(Buffer.from("h"))).toBe("NA======");
    expect(base32Encode(Buffer.from("he"))).toBe("NBSQ====");
  });

  test("секрет генерируется в base32-алфавите, 32 символа без паддинга (20 байт)", () => {
    const s = generateTotpSecret();
    expect(s).toHaveLength(32); // 20 байт × 8 бит / 5 = 32 символа ровно
    expect(s).toMatch(/^[A-Z2-7]+$/);
    expect(s).not.toContain("=");
  });
});

describe("TOTP · RFC 6238 векторы (SHA1, 6 цифр)", () => {
  // RFC 6238 Appendix B (8-значные) → 6-значные префиксы
  const vectors: Array<[number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  for (const [t, code] of vectors) {
    test(`T=${t} → ${code}`, () => {
      expect(totpCode(RFC_SECRET_B32, Math.floor(t / TOTP_STEP))).toBe(code);
    });
  }
});

describe("TOTP · проверка кодов", () => {
  test("верный код текущего шага принимается и возвращает шаг", () => {
    const now = Date.UTC(2026, 5, 15, 12, 0, 5); // шаг фиксирован
    const code = totpCode(RFC_SECRET_B32, currentStep(now));
    const step = verifyTotp(RFC_SECRET_B32, code, { forTime: now });
    expect(step).toBe(currentStep(now));
  });

  test("окно ±1: вчерашний шаг принят при window=1, отклонён при window=0", () => {
    const now = Date.UTC(2026, 5, 15, 12, 0, 5);
    const prevStep = currentStep(now) - 1;
    const code = totpCode(RFC_SECRET_B32, prevStep);
    expect(verifyTotp(RFC_SECRET_B32, code, { forTime: now, window: 1 })).toBe(prevStep);
    expect(verifyTotp(RFC_SECRET_B32, code, { forTime: now, window: 0 })).toBeNull();
  });

  test("анти-replay: lastStep блокирует повтор того же и более старых шагов", () => {
    const now = Date.UTC(2026, 5, 15, 12, 0, 5);
    const step = currentStep(now);
    const code = totpCode(RFC_SECRET_B32, step);
    // шаг уже был принят (lastStep = step) → отклоняем
    expect(verifyTotp(RFC_SECRET_B32, code, { forTime: now, lastStep: step })).toBeNull();
    // и любой более старый тоже
    expect(verifyTotp(RFC_SECRET_B32, totpCode(RFC_SECRET_B32, step - 1), { forTime: now, lastStep: step })).toBeNull();
    // более новый — принимается (проверяем «из будущего», где он актуален)
    const future = now + TOTP_STEP * 1000;
    expect(verifyTotp(RFC_SECRET_B32, totpCode(RFC_SECRET_B32, step + 1), { forTime: future, lastStep: step })).toBe(step + 1);
  });

  test("мусор на входе: неверная длина/не-цифры → null", () => {
    expect(verifyTotp(RFC_SECRET_B32, "12345")).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, "1234567")).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, "abcdef")).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, "")).toBeNull();
  });

  test("все 6 цифр допустимы и уникальны по шагам (дымовая проверка)", () => {
    const codes = new Set<string>();
    for (let s = 1_000_000; s < 1_000_020; s++) {
      const c = totpCode(RFC_SECRET_B32, s);
      expect(c).toMatch(/^\d{6}$/);
      codes.add(c);
    }
    expect(codes.size).toBeGreaterThan(15);
  });
});

describe("TOTP · otpauth URI", () => {
  test("формат otpauth://totp/Issuer:account?secret=...&issuer=...", () => {
    const uri = otpauthUri({ secret: "ABC234", account: "a@ff21.ru", issuer: "SCORESBOX" });
    expect(uri.startsWith("otpauth://totp/SCORESBOX%3Aa%40ff21.ru?")).toBe(true);
    expect(uri).toContain("secret=ABC234");
    expect(uri).toContain("issuer=SCORESBOX");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

describe("Резервные коды", () => {
  test("8 кодов формата XXXX-XXXX, все уникальны", () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    for (const c of codes) {
      expect(c).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    }
    expect(new Set(codes).size).toBe(8);
  });

  test("хэш детерминирован, поиск регистронезависим и триммит пробелы", () => {
    const [c] = generateRecoveryCodes(1);
    const h = hashRecoveryCode(c);
    expect(hashRecoveryCode(c)).toBe(h);
    expect(findRecoveryCode(c.toLowerCase(), [h])).toBe(0);
    expect(findRecoveryCode(` ${c} `, [h])).toBe(0);
    expect(findRecoveryCode("0000-0000", [h])).toBe(-1);
    expect(findRecoveryCode(c, [])).toBe(-1);
  });
});
