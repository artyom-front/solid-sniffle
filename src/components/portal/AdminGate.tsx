"use client";

// ============================================================
// /admin — единственный вход для персонала ФФЧ.
// Не авторизован → экран входа (email+пароль, 2FA-шаг).
// Авторизован → полноэкранный светлый AdminShell (Ozon-style).
// v1.0.32: ?pwset=<токен> — установка пароля по одноразовой ссылке
// (выдаёт супер-админ); ?section=…&league=…&season=…&match=… —
// восстановление позиции в панели после F5 (не сбрасывается на
// дашборд). Страница закрыта от индексации (metadata в page.tsx).
// ============================================================

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toaster } from "sonner";
import { useSession } from "./router";
import { useFetch } from "./hooks";
import type { BrandingDTO, SessionUserDTO } from "./types";
import AdminLogin from "./AdminLogin";
import AdminShell from "./AdminShell";
import { SetPasswordCard } from "./SetPasswordCard";

const STAFF_ROLES = ["SUPER_ADMIN", "LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE"];

/** Публичная конфигурация (демо-входы + брендинг) — та же форма,
 *  что отдаёт /api/public/site-config */
interface SiteConfigDTO {
  demoAccounts: boolean;
  branding: BrandingDTO;
}

function AdminGate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loaded, setUser } = useSession<SessionUserDTO>();
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  // v1.0.48: брендинг (кастомные лого из «Сайт → Брендинг») — одна
  // загрузка на весь /admin, пробрасывается вниз. version = bump — смена
  // лого в панели обновляет сайдбар/вход сразу (сайт — через ISR/revalidate)
  const { data: siteConfig } = useFetch<SiteConfigDTO>("/api/public/site-config", version);
  const branding = siteConfig?.branding ?? null;

  if (!loaded) {
    return (
      <div className="theme-dark flex min-h-screen items-center justify-center bg-s0 text-ink3">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-sline border-t-gold" />
          <p className="text-xs">Проверка сессии…</p>
        </div>
      </div>
    );
  }

  // Одноразовая ссылка установки пароля — приоритетнее входа
  const pwset = searchParams.get("pwset");
  if (pwset) {
    return <SetPasswordCard token={pwset} branding={branding} onDone={(u) => setUser(u)} />;
  }

  if (!user || !STAFF_ROLES.includes(user.role)) {
    return <AdminLogin branding={branding} onLoggedIn={(u) => setUser(u)} />;
  }

  // v1.0.34: ПОЛНАЯ позиция из URL передаётся в AdminShell одним объектом
  // (section/league/season/match/team/person). URL пишет ТОЛЬКО эффект
  // синхронизации AdminShell (push при открытии/смене раздела, replace при
  // закрытии/фильтрах) — onMatchHandled больше не дёргает роутер сам.
  const urlPosition = {
    section: searchParams.get("section"),
    league: searchParams.get("league"),
    season: searchParams.get("season"),
    match: searchParams.get("match"),
    team: searchParams.get("team"),
    person: searchParams.get("person"),
  };

  return (
    <AdminShell
      user={user}
      version={version}
      bump={bump}
      onReload={bump}
      branding={branding}
      focusMatchId={searchParams.get("match")}
      urlPosition={urlPosition}
      onMatchHandled={() => {
        // no-op: URL-позицию пишет единый эффект AdminShell (см. комментарий выше)
        void router;
      }}
    />
  );
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="theme-dark flex min-h-screen items-center justify-center bg-s0">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-sline border-t-gold" />
        </div>
      }
    >
      <Toaster richColors position="top-right" />
      <AdminGate />
    </Suspense>
  );
}
