// Unit: whitelist URL-валидатор (аудит Task 27 🟠-2, v1.0.24).
// Гарантирует: javascript:/data:/vbscript: и обфускации не проходят
// в href баннеров и других публичных ссылок.

import { describe, expect, test } from "bun:test";
import { isSafeWebUrl } from "@/lib/urlguard";

describe("isSafeWebUrl (whitelist для публичных ссылок)", () => {
  test("разрешает абсолютные http/https", () => {
    expect(isSafeWebUrl("https://example.com")).toBe(true);
    expect(isSafeWebUrl("https://sportcity.example/path?x=1")).toBe(true);
    expect(isSafeWebUrl("http://example.com")).toBe(true);
    expect(isSafeWebUrl("HTTPS://EXAMPLE.COM/AD")).toBe(true);
  });

  test("разрешает относительные пути внутри сайта", () => {
    expect(isSafeWebUrl("/api/media/abc123")).toBe(true);
    expect(isSafeWebUrl("/league/xyz")).toBe(true);
    expect(isSafeWebUrl("/")).toBe(false); // «/» сам по себе — не валидируем (редирект-заглушка)
    expect(isSafeWebUrl("//evil.example")).toBe(false); // протокольно-относительный
  });

  test("блокирует исполнимые схемы (stored XSS)", () => {
    expect(isSafeWebUrl("javascript:alert(document.cookie)")).toBe(false);
    expect(isSafeWebUrl("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeWebUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeWebUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
    expect(isSafeWebUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeWebUrl("blob:https://example.com/uuid")).toBe(false);
    expect(isSafeWebUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeWebUrl("about:blank")).toBe(false);
  });

  test("блокирует обфускацию управляющими символами и пробелами", () => {
    expect(isSafeWebUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafeWebUrl("java\nscript:alert(1)")).toBe(false);
    expect(isSafeWebUrl(" javascript:alert(1)")).toBe(false);
    expect(isSafeWebUrl("https://example.com\njavascript:x")).toBe(false);
    expect(isSafeWebUrl("javascript\u0000:alert(1)")).toBe(false);
  });

  test("блокирует мусор и пустые значения", () => {
    expect(isSafeWebUrl("")).toBe(false);
    expect(isSafeWebUrl("not a url")).toBe(false);
    expect(isSafeWebUrl("example.com")).toBe(false); // без схемы — не URL
    expect(isSafeWebUrl("https://ex\"ample.com")).toBe(false); // кавычка — CSS/HTML-токен
    expect(isSafeWebUrl("https://ex(ample).com")).toBe(false);
    expect(isSafeWebUrl("https://ex\\ample.com")).toBe(false);
  });
});
