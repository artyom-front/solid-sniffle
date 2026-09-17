"use client";

// ============================================================
// SCORESBOX · «Ночь под прожекторами» — шелл публичного сайта.
// Контентная колонка — максимум 800px по центру экрана (как у
// крупных спортивных площадок): слева/справа/сверху/снизу остаётся
// место под рекламу. Фоновый баннер (BACKGROUND) лежит фиксированным
// слоем за колонкой и виден по краям; полосы TOP/BOTTOM — внутри
// колонки. Данные overview/banners приходят из SSR (server layout).
// Публичный сайт НЕ содержит кнопок входа: панель управления —
// отдельный маршрут /admin для сотрудников ФФЧ.
// ============================================================

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { ChevronDown, LogOut, Search, Settings2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BRAND } from "./brand";
import { bindRouter, HashRedirect, useSession } from "./router";
import type { BannerDTO, OverviewDTO, SessionUserDTO } from "./types";
import SearchDialog, { openGlobalSearch } from "./SearchDialog";
import LeaguesSidebar from "./LeaguesSidebar";
import RightRail from "./RightRail";
import { AdMark } from "./visuals";

const FORMATS: { id: string; label: string }[] = [
  { id: "all", label: "Все виды" },
  { id: "F11", label: "Футбол" },
  { id: "F8", label: "8×8" },
  { id: "F6", label: "6×6" },
  { id: "FUTSAL", label: "Мини-футбол" },
];

/** Ширина контентной колонки сайта: всё ширее — рекламное поле */
const SITE_WIDTH = "max-w-[800px]";

/** css background-size баннера по режиму масштабирования */
function bgFit(b: BannerDTO): { size: string; repeat: string } {
  const fit = b.imageFit ?? "cover";
  return {
    size: fit === "contain" ? "contain" : fit === "repeat" ? "auto" : "cover",
    repeat: fit === "repeat" ? "repeat" : "no-repeat",
  };
}

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
      <div className={cn("mx-auto flex w-full items-center gap-1 overflow-x-auto px-4 scrollbar-none", SITE_WIDTH)}>
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
  const bottomBanner = banners.find((b) => b.placement === "BOTTOM");
  const bgBanner = banners.find((b) => b.placement === "BACKGROUND");
  const isHome = pathname === "/";
  const activeLeagueId = pathname?.startsWith("/league/") ? pathname.split("/")[2] ?? null : null;
  const year = new Date().getFullYear();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    toast.success("Вы вышли из системы");
  };

  return (
    <div className={cn("theme-dark flex min-h-screen flex-col text-ink", !bgBanner && "bg-s0")}>
      <Toaster richColors position="top-right" theme="dark" />
      <SearchDialog />
      <HashRedirect />

      {/* ---------- Фоновая реклама (слот BACKGROUND): фиксированный слой
          за контентом — виден слева и справа от колонки 800px, кликабелен.
          Сверху его перекрывают непрозрачные шапка и контентная колонка. ---------- */}
      {bgBanner && bgBanner.imageUrl && (
        <div className="fixed inset-0 z-0 overflow-hidden">
          <a
            href={bgBanner.linkUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label={`Реклама: ${bgBanner.title}`}
            className="absolute inset-0 block"
            style={{
              backgroundImage: `url(${bgBanner.imageUrl})`,
              backgroundSize: bgFit(bgBanner).size,
              backgroundPosition: bgBanner.imagePos ?? "center",
              backgroundRepeat: bgFit(bgBanner).repeat,
            }}
          />
          {/* маркировка на обоих видимых краях фона (как adfox) */}
          <span className="absolute left-2 top-[148px] hidden xl:block">
            <AdMark size={bgBanner.markSize} opacity={bgBanner.markOpacity} />
          </span>
          <span className="absolute right-2 top-[148px] hidden xl:block">
            <AdMark size={bgBanner.markSize} opacity={bgBanner.markOpacity} />
          </span>
        </div>
      )}

      {/* ---------- Шапка: минимализм, бренд, поиск ---------- */}
      <header className="sticky top-0 z-40 border-b border-sline bg-s0/95 backdrop-blur">
        <div className={cn("mx-auto flex h-16 w-full items-center gap-3 px-4", SITE_WIDTH)}>
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
            className="ml-4 hidden h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-sline bg-s1 px-3.5 text-sm text-ink3 transition-colors hover:border-gold/50 hover:text-ink2 md:flex"
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
            <div className={cn("mx-auto flex h-full w-full items-center gap-1 px-4", SITE_WIDTH)}>
              {FORMATS.map((f) => (
                <span key={f.id} className="shrink-0 px-4 py-3 text-sm text-ink3">{f.label}</span>
              ))}
            </div>
          </nav>
        }>
          <FormatNav />
        </Suspense>
      </header>

      {/* ---------- Контентная колонка 800px по центру экрана ---------- */}
      <main className="relative z-10 flex-1">
        <div className={cn("mx-auto w-full bg-s0 px-4 py-4", SITE_WIDTH)}>
          {/* Главная: сворачиваемая навигация по лигам (бывший левый сайдбар) */}
          {isHome && (
            <details className="group mb-4 overflow-hidden rounded-xl border border-sline bg-s1">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-xs font-semibold text-ink2 transition-colors hover:text-ink">
                <Trophy className="h-3.5 w-3.5 text-gold" />
                Лиги · таблицы · избранное
                <ChevronDown className="ml-auto h-4 w-4 text-ink3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-sline/60 px-3 py-3">
                <LeaguesSidebar overview={overview} version={version} activeLeagueId={activeLeagueId} />
              </div>
            </details>
          )}

          {/* Верхний баннер (слот TOP) — внутри колонки: без баннера слот
              не рендерится вовсе — без CLS. */}
          {topBanner && (
            <a
              href={topBanner.linkUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="relative mb-4 flex h-[72px] w-full items-center justify-between gap-4 overflow-hidden rounded-xl border border-gold/30 bg-gradient-to-r from-gold/10 to-transparent px-6 transition-colors hover:border-gold/60"
            >
              {topBanner.imageUrl ? (
                <>
                  <img
                    src={topBanner.imageUrl}
                    alt={topBanner.title}
                    className="absolute inset-0 h-full w-full"
                    style={{
                      objectFit: topBanner.imageFit === "contain" ? "contain" : "cover",
                      objectPosition: topBanner.imagePos ?? "center",
                    }}
                  />
                  <span className="absolute left-2 top-2 z-10">
                    <AdMark size={topBanner.markSize} opacity={topBanner.markOpacity} />
                  </span>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-bold">{topBanner.title}</p>
                    {topBanner.text && <p className="text-xs text-ink2">{topBanner.text}</p>}
                  </div>
                  <AdMark size={topBanner.markSize} opacity={topBanner.markOpacity} />
                </>
              )}
            </a>
          )}

          {children}

          {/* Главная: витрина виджетов (бывшая правая колонка) — под лентой */}
          {isHome && <RightRail overview={overview} banners={banners} version={version} layout="grid" />}

          {/* Нижний баннер (слот BOTTOM) — полоса в конце колонки */}
          {bottomBanner && (
            <a
              href={bottomBanner.linkUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="relative mt-4 flex h-[72px] w-full items-center justify-between gap-4 overflow-hidden rounded-xl border border-gold/30 bg-gradient-to-r from-gold/10 to-transparent px-6 transition-colors hover:border-gold/60"
            >
              {bottomBanner.imageUrl ? (
                <>
                  <img
                    src={bottomBanner.imageUrl}
                    alt={bottomBanner.title}
                    className="absolute inset-0 h-full w-full"
                    style={{
                      objectFit: bottomBanner.imageFit === "contain" ? "contain" : "cover",
                      objectPosition: bottomBanner.imagePos ?? "center",
                    }}
                  />
                  <span className="absolute left-2 top-2 z-10">
                    <AdMark size={bottomBanner.markSize} opacity={bottomBanner.markOpacity} />
                  </span>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-bold">{bottomBanner.title}</p>
                    {bottomBanner.text && <p className="text-xs text-ink2">{bottomBanner.text}</p>}
                  </div>
                  <AdMark size={bottomBanner.markSize} opacity={bottomBanner.markOpacity} />
                </>
              )}
            </a>
          )}
        </div>
      </main>

      {/* ---------- Футер ---------- */}
      <footer className="relative z-10 mt-auto border-t border-sline bg-[#07090d]">
        <div className={cn("mx-auto flex w-full flex-col gap-2 px-4 py-6 text-xs text-ink3 sm:flex-row sm:items-center sm:justify-between", SITE_WIDTH)}>
          <p className="font-black tracking-tight text-ink">
            © {year} {BRAND.name}
          </p>
          <p>Матчи · турниры · таблицы · протоколы</p>
        </div>
      </footer>
    </div>
  );
}
