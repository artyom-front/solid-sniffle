// Unit: брендинг из админки (v1.0.48). Валидация файлов лого/фавикона
// и санитайз SVG (защита от stored-XSS через брендовые SVG — прямое
// открытие /api/media/<id> не должно исполнять скрипты в origin сайта).

import { describe, expect, test } from "bun:test";
import { validateBrandFile, sanitizeSvg, BRAND_LIMITS, DEFAULT_BRANDING, DEFAULT_ICON_URL, DEFAULT_APPLE_ICON_URL, DEFAULT_OG_IMAGE_URL } from "@/lib/branding";

describe("validateBrandFile (мимы и размеры)", () => {
  test("принимает допустимые типы логотипов", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp", "image/avif", "image/svg+xml"]) {
      expect(validateBrandFile("logoDark", mime, 1000)).toBeNull();
      expect(validateBrandFile("logoLight", mime, 1000)).toBeNull();
    }
  });

  test("og:image — фото-пайплайн: PNG/JPG/WebP/AVIF, SVG и ICO запрещены", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp", "image/avif"]) {
      expect(validateBrandFile("ogImage", mime, 1000)).toBeNull();
    }
    expect(validateBrandFile("ogImage", "image/svg+xml", 100)).toContain("не поддерживается");
    expect(validateBrandFile("ogImage", "image/x-icon", 100)).toContain("не поддерживается");
  });

  test("фавикон: дополнительно принимает ICO, лого — нет", () => {
    expect(validateBrandFile("icon", "image/x-icon", 100)).toBeNull();
    expect(validateBrandFile("icon", "image/vnd.microsoft.icon", 100)).toBeNull();
    expect(validateBrandFile("logoDark", "image/x-icon", 100)).toContain("не поддерживается");
  });

  test("отклоняет опасные/чужие типы", () => {
    expect(validateBrandFile("logoDark", "application/pdf", 100)).toContain("не поддерживается");
    expect(validateBrandFile("icon", "image/gif", 100)).toContain("не поддерживается");
    expect(validateBrandFile("icon", "", 100)).toContain("не поддерживается");
  });

  test("лимиты размеров: лого 2 МБ, иконка 1 МБ, og 8 МБ, пустой файл", () => {
    expect(validateBrandFile("logoDark", "image/png", 2 * 1024 * 1024)).toBeNull();
    expect(validateBrandFile("logoDark", "image/png", 2 * 1024 * 1024 + 1)).toContain("больше");
    expect(validateBrandFile("icon", "image/png", 1 * 1024 * 1024)).toBeNull();
    expect(validateBrandFile("icon", "image/png", 1 * 1024 * 1024 + 1)).toContain("больше");
    expect(validateBrandFile("icon", "image/png", 0)).toContain("пустой");
    expect(BRAND_LIMITS.icon.maxBytes).toBeLessThan(BRAND_LIMITS.logoDark.maxBytes);
    // og:image — фото-лимит 8 МБ, БЕЗ квадратной нормализации (feedback53 №2)
    expect(validateBrandFile("ogImage", "image/png", 8 * 1024 * 1024)).toBeNull();
    expect(validateBrandFile("ogImage", "image/png", 8 * 1024 * 1024 + 1)).toContain("больше");
    expect(BRAND_LIMITS.ogImage.maxBytes).toBeGreaterThan(BRAND_LIMITS.logoDark.maxBytes);
  });
});

describe("sanitizeSvg (stored-XSS через брендовый SVG)", () => {
  test("пропускает чистый SVG с путями и заливками", () => {
    const ok = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="11" fill="#FFD700"/><path d="M32 4v56" stroke="#000" stroke-width="5.6"/></svg>`;
    expect(sanitizeSvg(ok).ok).toBe(true);
  });

  test("пропускает внутренние фрагменты и data:image", () => {
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="#mark"/></svg>`).ok).toBe(true);
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KG="/></svg>`).ok).toBe(true);
  });

  test("блокирует скрипты, обработчики и опасные схемы", () => {
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`).ok).toBe(false);
    expect(sanitizeSvg(`<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg"/>`).ok).toBe(false);
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>`).ok).toBe(false);
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><text onclick="hack()">x</text></svg>`).ok).toBe(false);
  });

  test("блокирует foreignObject, ENTITY и CDATA-обфускацию", () => {
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body>html</body></foreignObject></svg>`).ok).toBe(false);
    expect(sanitizeSvg(`<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&xxe;</svg>`).ok).toBe(false);
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><desc><![CDATA[<script>]]></desc></svg>`).ok).toBe(false);
  });

  test("блокирует внешние ссылки (утечка/подмена), внутренние — разрешает", () => {
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/pixel.png"/></svg>`).ok).toBe(false);
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="http://tracker.example/x.png"/></svg>`).ok).toBe(false);
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><image href="#part"/></svg>`).ok).toBe(true);
  });
});

describe("дефолты брендинга", () => {
  test("NULL во всех полях = встроенные лого v1.0.47 + og v1.0.53", () => {
    expect(DEFAULT_BRANDING).toEqual({ logoDarkUrl: null, logoLightUrl: null, iconUrl: null, ogImageUrl: null });
  });
  test("дефолтная og-карточка — PNG (скрейперы соцсетей SVG не читают)", () => {
    expect(DEFAULT_OG_IMAGE_URL).toBe("/brand/og-default.png");
    expect(DEFAULT_OG_IMAGE_URL.endsWith(".png")).toBe(true);
  });
  test("дефолтные иконки — SB-монограмма logo53 (feedback53)", () => {
    expect(DEFAULT_ICON_URL).toBe("/brand/logo53/mark.svg");
    expect(DEFAULT_APPLE_ICON_URL).toBe("/brand/logo53/apple-icon.png");
  });
});
