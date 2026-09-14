import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ============================================================
// Security-фильтр всех запросов (Next.js 16 — файл proxy.ts,
// преемник middleware; работает на edge-рантайме, без БД):
// 1. CSRF: мутирующие запросы к /api/** (кроме логина и публичных
//    эндпоинтов) должны приходить с того же origin. Браузер всегда
//    шлёт Origin на кросс-сайтовых fetch — отсутствие Origin
//    означает не-браузерный клиент (curl/тесты/интеграции).
// 2. /admin и /api — не индексируются поисковиками.
// ============================================================

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// эндпоинты, доступные до аутентификации (Origin ещё «чужой» с точки зрения проверки)
const ANON_MUTABLE = ["/api/auth/login", "/api/auth/otp", "/api/auth/logout"];

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // не-браузерный клиент (curl/мониторинг/тесты)
  try {
    const o = new URL(origin);
    // прямой заход или за доверенным прокси (nginx передаёт x-forwarded-host)
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const proto = req.headers.get("x-forwarded-proto") ?? o.protocol.replace(":", "");
    return `${proto}://${host}` === o.toString().replace(/\/$/, "") || host === o.host;
  } catch {
    return false;
  }
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ---------- CSRF: origin для мутирующих запросов ----------
  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(req.method) && !ANON_MUTABLE.includes(pathname)) {
    if (!sameOrigin(req)) {
      return NextResponse.json(
        { error: "Запрос отклонён: источник не совпадает (CSRF-защита)" },
        { status: 403 }
      );
    }
  }

  const res = NextResponse.next();

  // ---------- Не индексировать служебные разделы ----------
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/")) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
