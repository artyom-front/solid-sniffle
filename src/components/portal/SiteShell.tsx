"use client";

// ============================================================
// SCORESBOX · «Ночь под прожекторами» — шелл публичного сайта.
// Общие для всех SSR-страниц: тёмная шапка с брендом и поиском,
// меню видов футбола, топ-баннер, 3 колонки (топ-лиги · контент
// страницы · виджеты), футер. Данные overview/banners приходят
// из SSR (server layout) — контент виден в HTML сразу.
// Публичный сайт НЕ содержит кнопок входа: панель управления —
// отдельный маршрут /admin для сотрудников ФФЧ.
// ============================================================

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { LogOut, Search, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BRAND } from "./brand";
import { bindRouter, HashRedirect, useSession } from "./router";
import type { BannerDTO, OverviewDTO, SessionUserDTO } from "./types";
import SearchDialog, { openGlobalSearch } from "./SearchDialog";
import LeaguesSidebar from "./LeaguesSidebar";
import RightRail from "./RightRail";

const FORMATS: { id: string; label: string }[] = [
  { id: "all", label: "Все виды" },
  { id: "F11", label: "Футбол" },
  { id: "F8", label: "8×8" },
  { id: "F6", label: "6×6" },
  { id: "FUTSAL", label: "Мини-футбол" },
];

/** Меню видов футбола: активный формат читается из ?format= —
 *  вынесен в отдельный Suspense-границей компонент, чтобы useSearchParams
 *  не выпадал из статического рендера страниц (и не ломал 404-статус) */
function FormatNav() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onHome = pathname === "/";
  const format = onHome ? searchParams.get("format") ?? "all" : "all";
  return (
    <nav className="border-t border-sline/60" aria-label="Виды футбола">
      <div className="mx-auto flex w-full max-w-[1440px] items-center gap-1 overflow-x-auto px-4 scrollbar-none">
        {FORMATS.map((f) => (
          <a
            key={f.id}
            href={f.id === "all" ? "/" : `/?format=${f.id}`}
            onClick={(e) => {
              e.preventDefault();
              router.push(f.id === "all" ? "/" : `/?format=${f.id}`);
            }}
            className={cn(
              "relative shrink-0 px-4 py-3 text-sm font-semibold transition-colors",
              format === f.id ? "text-gold" : "text-ink2 hover:text-ink"
            )}
          >
            {f.label}
            {format === f.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gold" />}
          </a>
        ))}
      </div>
    </nav>
  );
}

interface Props {
  overview: OverviewDTO;
  banners: BannerDTO[];
  children: React.ReactNode;
}

export default function SiteShell({ overview, banners, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, setUser } = useSession<SessionUserDTO>();
  const [version, setVersion] = useState(0);

  // привязываем App Router к глобальному navigate() (для всех старых вызовов)
  useEffect(() => {
    bindRouter(router);
  }, [router]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const canAdmin = !!user && ["SUPER_ADMIN", "LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE"].includes(user.role);
  const topBanner = banners.find((b) => b.placement === "TOP");
  const activeLeagueId = pathname?.startsWith("/league/") ? pathname.split("/")[2] ?? null : null;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    toast.success("Вы вышли из системы");
  };

  return (
    <div className="theme-dark flex min-h-screen flex-col bg-s0 text-ink">
      <Toaster richColors position="top-right" theme="dark" />
      <SearchDialog />
      <HashRedirect />

      {/* ---------- Шапка: минимализм, бренд, поиск ---------- */}
      <header className="sticky top-0 z-40 border-b border-sline bg-s0/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4">
          <a href="/" className="flex items-center gap-2.5" aria-label="SCORESBOX — на главную">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold font-mono text-lg font-black tracking-tighter text-goldink shadow-[0_0_24px_rgba(255,212,0,0.35)]">
              {BRAND.mark}
            </span>
            <span className="text-left leading-none">
              <span className="block text-xl font-black tracking-tight">
                {BRAND.wordmark}
                <span className="ml-1 text-gold">{BRAND.mark}</span>
              </span>
              <span className="mt-0.5 hidden text-xs font-medium text-ink3 sm:block">{BRAND.tagline}</span>
            </span>
          </a>

          <button
            onClick={openGlobalSearch}
            className="ml-4 hidden h-10 min-w-0 flex-1 max-w-md items-center gap-2 rounded-xl border border-sline bg-s1 px-3.5 text-sm text-ink3 transition-colors hover:border-gold/50 hover:text-ink2 md:flex"
            aria-label="Поиск по порталу"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">Поиск: команды, игроки, судьи…</span>
            <kbd className="shrink-0 rounded border border-sline bg-s2 px-1.5 py-0.5 font-mono text-xs">/</kbd>
          </button>

          {/* Публичный сайт без кнопки «Войти»: вход для сотрудников — только /admin */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={openGlobalSearch}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-sline bg-s1 text-ink2 hover:text-ink md:hidden"
              aria-label="Поиск"
            >
              <Search className="h-4 w-4" />
            </button>
            {user && (
              <>
                <div className="hidden text-right sm:block">
                  <p className="max-w-[160px] truncate text-xs font-semibold leading-tight text-ink">{user.personName ?? user.email}</p>
                  <p className="text-xs text-ink3">
                    {user.role === "SUPER_ADMIN" ? "Супер-админ" : user.role === "LEAGUE_ADMIN" ? "Админ лиги" : user.role === "REFEREE" ? "Судья" : user.role === "CLUB_ADMIN" ? "Админ клуба" : "Игрок"}
                  </p>
                </div>
                {canAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("border-sline bg-s1 text-ink2 hover:border-gold/50 hover:bg-s2 hover:text-ink", pathname?.startsWith("/admin") && "border-gold text-gold")}
                    onClick={() => router.push("/admin")}
                  >
                    <Settings2 className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">Админка</span>
                  </Button>
                )}
                <Button variant="outline" size="sm" className="border-sline bg-s1 text-ink2 hover:bg-s2 hover:text-ink" onClick={logout} aria-label="Выйти">
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ---------- Меню видов футбола ---------- */}
        <Suspense fallback={
          <nav className="h-[49px] border-t border-sline/60" aria-label="Виды футбола">
            <div className="mx-auto flex h-full w-full max-w-[1440px] items-center gap-1 px-4">
              {FORMATS.map((f) => (
                <span key={f.id} className="shrink-0 px-4 py-3 text-sm text-ink3">{f.label}</span>
              ))}
            </div>
          </nav>
        }>
          <FormatNav />
        </Suspense>
      </header>

      {/* ---------- Верхний баннер (слот TOP) ---------- */}
      {topBanner && (
        <div className="mx-auto w-full max-w-[1440px] px-4 pt-4">
          <a
            href={topBanner.linkUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="flex h-[72px] w-full items-center justify-between gap-4 rounded-xl border border-gold/30 bg-gradient-to-r from-gold/10 to-transparent px-6 transition-colors hover:border-gold/60"
          >
            <div>
              <p className="text-sm font-bold">{topBanner.title}</p>
              {topBanner.text && <p className="text-xs text-ink2">{topBanner.text}</p>}
            </div>
            <span className="rounded-md bg-gold px-2.5 py-1 text-xs font-bold text-goldink">Реклама</span>
          </a>
        </div>
      )}

      {/* ---------- 3-колоночная сетка: контент страницы в центре ---------- */}
      <main className="flex-1">
        <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="hidden lg:block">
            <div className="sticky top-[132px] max-h-[calc(100vh-148px)] overflow-y-auto pr-1 scrollbar-s21">
              <LeaguesSidebar overview={overview} version={version} activeLeagueId={activeLeagueId} />
            </div>
          </aside>

          <div className="min-w-0">{children}</div>

          <aside className="hidden xl:block">
            <div className="sticky top-[132px] max-h-[calc(100vh-148px)] space-y-4 overflow-y-auto scrollbar-s21">
              <RightRail overview={overview} banners={banners} version={version} />
            </div>
          </aside>
        </div>
      </main>

      {/* ---------- Футер ---------- */}
      <footer className="mt-auto border-t border-sline bg-[#07090d]">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-6 text-xs text-ink3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-black tracking-tight text-ink">
              {BRAND.name} <span className="text-gold">·</span> {BRAND.domain}
            </p>
            <p className="mt-0.5">Спортивно-аналитический портал «{BRAND.tagline}» · {BRAND.region}</p>
          </div>
          <div className="flex max-w-md flex-wrap gap-x-4 gap-y-1">
            <span>Дисквалификации</span>
            <span>Техпоражения</span>
            <span>Трансферы</span>
            <span>Мерж профилей</span>
            <span>Рейтинги судей</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
