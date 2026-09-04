"use client";

// ============================================================
// Навигация: тонкий адаптер над App Router.
// Все старые вызовы navigate("/match/12") продолжают работать,
// но теперь это настоящие URL-маршруты (SSR/SEO/шаринг ссылок).
// navigate() доступен и вне React-дерева (bindRouter в SiteShell).
// ============================================================

import { useEffect, useRef, useState } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

let bound: AppRouterInstance | null = null;

/** Вызывается один раз из клиентского шелла, чтобы navigate() работал везде */
export function bindRouter(r: AppRouterInstance) {
  bound = r;
}

/** Переход по внутреннему пути: /match/12, /team/3, /league/2/table, /admin */
export function navigate(path: string) {
  const target = path.startsWith("/") ? path : `/${path}`;
  if (bound) {
    bound.push(target);
    return;
  }
  // до гидратации — обычная навигация браузера
  if (typeof window !== "undefined") window.location.assign(target);
}

/** Дата (МСК) в YYYY-MM-DD со смещением в днях */
export function mskDay(offsetDays = 0): string {
  return new Date(Date.now() + 3 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

// ============================================================
// Легаси-совместимость: старые ссылки вида #/match/12 редиректятся
// на путь /match/12 (после гидратации, без рассинхрона SSR)
// ============================================================

const KNOWN_HASH_ROUTES = ["league", "match", "team", "player", "stadium", "login", "admin"];

/** Клиентский редиректор #/... → /... для ранее расшаренных hash-ссылок */
export function HashRedirect() {
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const raw = window.location.hash.replace(/^#\/?/, "").replace(/\?.*$/, "").replace(/\/$/, "");
    if (!raw) return;
    const [head] = raw.split("/");
    if (KNOWN_HASH_ROUTES.includes(head)) {
      // логин переехал в панель; протокол матча — /admin?match=ID
      let target: string;
      if (head === "login") target = "/admin";
      else if (head === "admin") {
        const parts = raw.split("/");
        target = parts[1] ? `/admin?match=${parts[1]}` : "/admin";
      } else target = `/${raw}`;
      if (bound) bound.replace(target);
      else window.location.assign(target);
    }
    // чистим hash, чтобы не мешал адресной строке
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  return null;
}

/** Сессия текущего пользователя (клиент; null до загрузки) */
export function useSession<T = { id: string; email: string; role: string; personId: string | null; clubId: string | null; personName: string | null }>() {
  const [user, setUser] = useState<T | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setUser(j.user ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  return { user, loaded, setUser: setUser as React.Dispatch<React.SetStateAction<T | null>> };
}
