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
import type { SessionUserDTO } from "./types";
import AdminLogin from "./AdminLogin";
import AdminShell from "./AdminShell";
import { SetPasswordCard } from "./SetPasswordCard";

const STAFF_ROLES = ["SUPER_ADMIN", "LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE"];

function AdminGate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loaded, setUser } = useSession<SessionUserDTO>();
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

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
    return <SetPasswordCard token={pwset} onDone={(u) => setUser(u)} />;
  }

  if (!user || !STAFF_ROLES.includes(user.role)) {
    return <AdminLogin onLoggedIn={(u) => setUser(u)} />;
  }

  return (
    <AdminShell
      user={user}
      version={version}
      bump={bump}
      onReload={bump}
      focusMatchId={searchParams.get("match")}
      urlSection={searchParams.get("section")}
      onMatchHandled={() => {
        // закрываем протокол, НЕ затирая остальную позицию (section/league/season)
        const params = new URLSearchParams(window.location.search);
        params.delete("match");
        const qs = params.toString();
        router.replace(qs ? `/admin?${qs}` : "/admin");
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
