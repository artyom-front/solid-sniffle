"use client";

// ============================================================
// SCORESBOX · «Ночь под прожекторами» — шелл публичного сайта.
// ЛЭЙАУТ v1.0.34 — три колонки (как cybersport.ru) с ПОСТЕПЕННЫМ
// упрощением (фидбек владельца: «сначала пропадает левая колонка
// с лигами, основной блок и статистика остаются, и только потом —
// только основной блок»):
//   • ≥1424px — три колонки: слева лиги (300px), ЦЕНТР ≤800px,
//     справа статистика (260px);
//   • 1120–1423px — ДВЕ колонки: центр + статистика (левый блок
//     прячется — список лиг сворачивается в шапке центра);
//   • <1120px — только ЦЕНТР (статистика — витриной под лентой).
// Фоновый баннер (BACKGROUND) — фиксированный слой за колонками,
// виден по краям; полосы TOP/BOTTOM — внутри центральной колонки.
// АНТИ-CLS: колонки заданы грид-шаблоном ФИКСИРОВАННОЙ ширины —
// появление/исчезновение рекламы и картинок в боковых колонках НЕ
// двигает центр; виджеты до прихода данных рендерятся скелетонами
// постоянной высоты; стат-карточки — бокс фиксированной высоты (с
// фото и без — размер одинаков). Данные overview/banners/statBlocks
// приходят из SSR (server layout) — в HTML сразу, без мигания.
// Публичный сайт НЕ содержит кнопок входа: панель управления —
// отдельный маршрут /admin для сотрудников ФФЧ.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Toaster } from "sonner";
import { toast } from "sonner";
import { ChevronDown, LogOut, Search, Settings2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BRAND } from "./brand";
import { Logo, LogoHorizontal } from "./Logo";
import { bindRouter, HashRedirect, useSession } from "./router";
import type { BannerDTO, OverviewDTO, SessionUserDTO, StatBlockDTO } from "./types";
import SearchDialog, { openGlobalSearch } from "./SearchDialog";
import LeaguesSidebar from "./LeaguesSidebar";
import RightRail, { BannerSlot } from "./RightRail";
import { DEFAULT_FORMAT_LINKS } from "@/lib/labels";
import { AdMark, AdSlot } from "./visuals";

/** Ширина контейнера сайта (директива Р-04): max-width 1200px,
 *  центрирован — выше растут только поля. Колонки — ФИКСИРОВАННОЙ
 *  ширины по бокам (левая 220px, правая 300px — Р-05), центр — 1fr:
 *  главный экран не сдвигается. */
const SITE_WIDTH = "max-w-[1200px]";

/** Брейкпоинты лэйаута (Р-05):
 *  1200px — включается ЛЕВАЯ колонка лиг (220px) + центр + правая
 *     статистика (300px); ниже 1200px лиги уезжают АККОРДЕОНОМ
 *     ПОД контент (свёрнут, состояние в localStorage, 0.25s);
 *  768px — включается ПРАВАЯ колонка статистики; ниже — виджеты
 *     секциями ПОД лентой (sidebar-реклама не показывается — креатив
 *     уходит в AD-TOP/AD-BOTTOM, Р-29).
 *  ВАЖНО (грабля v1.0.28): классы min-[768px]:…/min-[1200px]:… пишем
 *  в className ЛИТЕРАЛЬНО — Tailwind-сканер не разворачивает шаблонные
 *  подстановки, иначе CSS для брейкпоинта не сгенерируется вовсе. */

/** css background-size баннера по режиму масштабирования */
function bgFit(b: BannerDTO): { size: string; repeat: string } {
  const fit = b.imageFit ?? "cover";
  return {
    size: fit === "contain" ? "contain" : fit === "repeat" ? "auto" : "cover",
    repeat: fit === "repeat" ? "repeat" : "no-repeat",
  };
}

/** Меню видов футбола: набор ссылок УПРАВЛЯЕТСЯ ИЗ АДМИНКИ (v1.0.29,
 *  модель FormatLink — добавление/удаление/переименование/порядок/видимость).
 *  Активный формат читается из ?format= — вынесен в отдельный
 *  Suspense-границей компонент, чтобы useSearchParams не выпадал
 *  из статического рендера страниц (и не ломал 404-статус).
 *  Пусто в БД — откат к базовой четвёрке (DEFAULT_FORMAT_LINKS).
 *
 *  Р-09 (директива 2026-09-30): МОБАЙЛ (<768px) — горизонтальный скролл
 *  ленты табов + градиентное затухание 24px у правого края +
 *  scroll-snap + автоскролл к активному табу; ДЕСКТОП — если не
 *  влезает, последние табы уходят в кнопку «Ещё ⌄» с дропдауном.
 *  Обрезание слова без индикации ЗАПРЕЩЕНО. */
function FormatNav({ formats }: { formats: { code: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onHome = pathname === "/";
  const format = onHome ? searchParams.get("format") ?? "all" : "all";

  const allTabs = useMemo(() => [{ code: "all", label: "Все виды" }, ...formats], [formats]);

  const go = (code: string) => {
    router.push(code === "all" ? "/" : `/?format=${code}`);
  };

  // ---------- Десктоп: «Ещё ⌄» — измеряем, влезают ли все табы ----------
  const scrollerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [hiddenCodes, setHiddenCodes] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const recompute = () => {
      const scroller = scrollerRef.current;
      const measure = measureRef.current;
      if (!scroller || !measure) return;
      // мобильный режим — скролл, никакого «Ещё»
      if (!window.matchMedia("(min-width: 768px)").matches) {
        setHiddenCodes([]);
        return;
      }
      // ширины табов — из невидимого измерительного слоя (те же стили)
      const widths = new Map<string, number>();
      measure.querySelectorAll<HTMLElement>("[data-code]").forEach((el) => {
        if (el.dataset.code) widths.set(el.dataset.code, el.offsetWidth);
      });
      const gap = 4; // gap-1
      const moreBtn = 96; // кнопка «Ещё ⌄» + запас
      let total = 0;
      widths.forEach((w) => (total += w + gap));
      const avail = scroller.clientWidth;
      if (total <= avail) {
        setHiddenCodes([]);
        return;
      }
      // режем табы с конца, пока префикс + «Ещё» не влезет
      const codes = allTabs.map((t) => t.code);
      let acc = total;
      const hidden: string[] = [];
      while (codes.length - hidden.length > 1 && acc + moreBtn > avail) {
        const last = codes[codes.length - 1 - hidden.length];
        if (last === undefined) break;
        hidden.push(last);
        acc -= (widths.get(last) ?? 0) + gap;
      }
      setHiddenCodes(hidden);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    if (scrollerRef.current) ro.observe(scrollerRef.current);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [allTabs]);

  // ---------- Мобильный: автоскролл к активному табу ----------
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const active = scroller.querySelector<HTMLElement>("[data-active='true']");
    if (active) {
      scroller.scrollTo({ left: active.offsetLeft - scroller.clientWidth / 2 + active.offsetWidth / 2, behavior: "smooth" });
    }
  }, [format]);

  const visibleTabs = allTabs.filter((t) => !hiddenCodes.includes(t.code));
  const hiddenTabs = allTabs.filter((t) => hiddenCodes.includes(t.code));

  /** один таб — активный: жёлтый + линия 2px снизу (Р-07) */
  const tabCls = (active: boolean) =>
    cn(
      "relative shrink-0 cursor-pointer snap-start px-4 py-3 text-[13px] font-semibold transition-colors",
      active ? "text-gold" : "text-ink2 hover:text-ink"
    );

  return (
    <nav className="relative border-t border-sline/60" aria-label="Виды футбола">
      {/* невидимый измерительный слой: те же табы, те же стили —
          берём их offsetWidth для расчёта «Ещё» (десктоп) */}
      <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute inset-0 flex items-center gap-1 overflow-hidden px-4">
        {allTabs.map((f) => (
          <span key={f.code} data-code={f.code} className="shrink-0 px-4 py-3 text-[13px] font-semibold">
            {f.label}
          </span>
        ))}
      </div>
      <div
        ref={scrollerRef}
        className={cn(
          "relative mx-auto flex w-full snap-x snap-proximity items-center gap-1 overflow-x-auto px-4 scrollbar-none",
          SITE_WIDTH,
          "min-[768px]:overflow-hidden min-[768px]:snap-none"
        )}
      >
        {visibleTabs.map((f) => (
          <a
            key={f.code}
            href={f.code === "all" ? "/" : `/?format=${f.code}`}
            data-active={format === f.code}
            onClick={(e) => {
              e.preventDefault();
              go(f.code);
            }}
            className={tabCls(format === f.code)}
          >
            {f.label}
            {format === f.code && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-gold" />}
          </a>
        ))}
        {/* десктоп: не влезающие табы — в кнопку «Ещё ⌄» с дропдауном */}
        {hiddenTabs.length > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={cn(
                "flex cursor-pointer items-center gap-1 px-4 py-3 text-[13px] font-semibold transition-colors",
                hiddenTabs.some((t) => t.code === format) ? "text-gold" : "text-ink2 hover:text-ink"
              )}
            >
              Ещё
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", moreOpen && "rotate-180")} />
              {hiddenTabs.some((t) => t.code === format) && <span className="absolute inset-x-3 bottom-0 left-0 h-0.5 bg-gold" />}
            </button>
            {moreOpen && (
              <>
                {/* прозрачная подложка: клик вне дропдауна закрывает его */}
                <button type="button" aria-label="Закрыть меню" className="fixed inset-0 z-40 cursor-default" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-sline bg-s1 py-1">
                  {hiddenTabs.map((f) => (
                    <button
                      key={f.code}
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        go(f.code);
                      }}
                      className={cn(
                        "block w-full cursor-pointer px-4 py-2 text-left text-[13px] font-semibold transition-colors hover:bg-shover",
                        format === f.code ? "text-gold" : "text-ink2 hover:text-ink"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {/* мобильный скролл: градиентное затухание 24px у правого края —
            видно, что лента продолжается (Р-09) */}
        <span className="pointer-events-none absolute right-0 top-0 z-10 h-full w-6 bg-gradient-to-l from-s0 to-transparent min-[768px]:hidden" />
      </div>
    </nav>
  );
}

interface Props {
  overview: OverviewDTO;
  banners: BannerDTO[];
  statBlocks: StatBlockDTO[];
  children: React.ReactNode;
}

/** Аккордеон лиг (директива 2026-09-30): ниже 1200px левая панель
 *  переезжает ПОД контент. Свёрнут ПО УМОЛЧАНИЮ; состояние — в
 *  localStorage; анимация 0.25s через grid-template-rows 0fr→1fr
 *  (плавно и без JS-замеров высоты). Внутри — тот же состав панели:
 *  топ-лиги, все лиги группами, избранное (LeaguesSidebar).
 *
 * Состояние — useSyncExternalStore над localStorage: серверный
 * снапшот всегда «свёрнут» (нет рассинхрона гидратации), клиентский
 * читает сохранённое значение сразу после гидратации; запись —
 * через store.set() с уведомлением подписчиков. */
const LEAGUES_OPEN_KEY = "sb:leagues-open";

const leaguesOpenStore = {
  listeners: new Set<() => void>(),
  // ⚠ стрелочные функции: методы передаются в useSyncExternalStore
  // как ссылки — обычные методы теряют `this` (TypeError на .listeners)
  get: (): boolean => {
    try {
      return localStorage.getItem(LEAGUES_OPEN_KEY) === "1";
    } catch {
      return false; // приватный режим — просто свёрнуто
    }
  },
  set: (next: boolean) => {
    try {
      localStorage.setItem(LEAGUES_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* не критично */
    }
    leaguesOpenStore.listeners.forEach((l) => l());
  },
  subscribe: (l: () => void) => {
    leaguesOpenStore.listeners.add(l);
    return () => leaguesOpenStore.listeners.delete(l);
  },
};

function LeaguesAccordion({
  overview,
  version,
  activeLeagueId,
}: {
  overview: OverviewDTO;
  version: number;
  activeLeagueId: string | null;
}) {
  const open = useSyncExternalStore(leaguesOpenStore.subscribe, leaguesOpenStore.get, () => false);
  const toggle = () => leaguesOpenStore.set(!open);
  return (
    <section className="mt-3 overflow-hidden rounded-lg border border-sline bg-s1 min-[1200px]:hidden" aria-label="Навигация по лигам">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="leagues-panel"
        className="flex w-full cursor-pointer select-none items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-shover"
      >
        <Trophy className="h-4 w-4 shrink-0 text-gold" />
        <span className="min-w-0 flex-1 text-[13px] font-bold text-ink">Лиги · таблицы · избранное</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div
        id="leagues-panel"
        className={cn(
          "grid transition-[grid-template-rows] duration-[250ms] ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-sline/60 p-3">
            <LeaguesSidebar overview={overview} version={version} activeLeagueId={activeLeagueId} />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function SiteShell({ overview, banners, statBlocks, children }: Props) {
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
  // слоты по директиве Р-29: AD-TOP (между табами видов и панелью даты),
  // AD-BOTTOM (конец ленты, 100%×90), AD-INFEED — в ленте (MatchDayView),
  // AD-SIDEBAR = RIGHT_TOP/RIGHT_BOTTOM — правая колонка ≥768px;
  // фон и левая колонка — как раньше
  const topBanner = banners.find((b) => b.placement === "TOP");
  const bottomBanner = banners.find((b) => b.placement === "BOTTOM");
  const bgBanner = banners.find((b) => b.placement === "BACKGROUND");
  // левая колонка (список лиг): реклама над списком и под ним
  const leftTopBanner = banners.find((b) => b.placement === "LEFT_TOP");
  const leftBottomBanner = banners.find((b) => b.placement === "LEFT_BOTTOM");
  // AD-SIDEBAR: на мобиле слот не живёт — креатив уходит в AD-BOTTOM,
  // если свой BOTTOM-баннер не занял место (Р-29)
  const rightTopBanner = banners.find((b) => b.placement === "RIGHT_TOP");
  const rightBottomBanner = banners.find((b) => b.placement === "RIGHT_BOTTOM");
  const railFallback = rightTopBanner ?? rightBottomBanner ?? undefined;
  const activeLeagueId = pathname?.startsWith("/league/") ? pathname.split("/")[2] ?? null : null;
  // v1.0.44 (фидбек 2026-10-05, откат решения v1.0.41): страница матча
  // СНОВА С БОКОВЫМИ КОЛОНКАМИ — лиги слева (≥1200px), статистика+
  // реклама справа (≥768px), под матчем на мобиле — секции статистики
  // и аккордеон лиг. Ряд из 3 реклам над матчем убран — RIGHT-слоты
  // возвращаются в правую колонку (как на v1.0.40 и на flashscore).
  // v1.0.46 (фидбек 2026-10-06): профильные страницы (игрок/команда/
  // стадион) — СНОВА в общей сетке: колонки статистики ПО КРАЯМ
  // остаются, центр — только профильная суть. Без колонок остаётся
  // только МОБИЛЬНАЯ витрина статистики (<768px) — чтобы не
  // растягивать профильный экран.
  const isProfilePage = /^\/(player|team|stadium)\//.test(pathname ?? "");
  const year = new Date().getFullYear();
  // виды футбола в меню: из БД (админка), fallback — базовая четвёрка
  const formats = overview?.formats?.length ? overview.formats : DEFAULT_FORMAT_LINKS;

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
          {/* маркировка на обоих видимых краях фона (как adfox) —
              края видны, когда контейнер 1200px уже вьюпорта */}
          <span className="absolute left-2 top-[148px] hidden min-[1224px]:block">
            <AdMark size={bgBanner.markSize} opacity={bgBanner.markOpacity} />
          </span>
          <span className="absolute right-2 top-[148px] hidden min-[1224px]:block">
            <AdMark size={bgBanner.markSize} opacity={bgBanner.markOpacity} />
          </span>
        </div>
      )}

      {/* ---------- Шапка: логотип в одну строку (Р-01: знак-поле 32px +
          «scoresbox», box — золотым; слоган — только ≥1024px), поиск ---------- */}
      <header className="sticky top-0 z-40 border-b border-sline bg-s0/95 backdrop-blur">
        <div className={cn("mx-auto flex h-14 w-full items-center gap-3 px-4 min-[768px]:h-16", SITE_WIDTH)}>
          <a href="/" className="flex min-w-0 items-center" aria-label="SCORESBOX — на главную">
            {/* v1.0.47: лого — чистые SVG-пути (знак-поле 32px + scoresbox
                одной строкой, перенос невозможен по построению), scores —
                БЕЛЫЙ #FFFFFF, box — золото #FFD700 плоским (бриф) */}
            <Logo subtitle={BRAND.tagline} variant="dark" height={32} />
          </a>

          <button
            onClick={openGlobalSearch}
            className="ml-4 hidden h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-sline bg-s1 px-3.5 text-sm text-ink3 transition-colors hover:border-gold/50 hover:text-ink2 md:flex"
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

        {/* ---------- Меню видов футбола (управляется из админки) ---------- */}
        <Suspense fallback={
          <nav className="h-[49px] border-t border-sline/60" aria-label="Виды футбола">
            <div className={cn("mx-auto flex h-full w-full items-center gap-1 px-4", SITE_WIDTH)}>
              <span className="shrink-0 px-4 py-3 text-sm text-ink3">Все виды</span>
              {formats.map((f) => (
                <span key={f.code} className="shrink-0 px-4 py-3 text-sm text-ink3">{f.label}</span>
              ))}
            </div>
          </nav>
        }>
          <FormatNav formats={formats} />
        </Suspense>
      </header>

      {/* ---------- Сетка сайта (Р-05): контейнер 1200px центрирован,
          выше — растут только поля. ≥1200px — три колонки (лиги 220px •
          центр 1fr • статистика 300px); 768–1199 — центр + статистика
          (240px на 768–1023 и 280px на 1024–1199 — фидбек 2026-10-06:
          правый столбец на планшете занимал почти пол-экрана), лиги —
          аккордеоном ПОД контентом; <768 — одна колонка: центр →
          виджеты статистики секциями → аккордеон лиг в конце. Колонки
          фиксированной ширины → реклама в них не двигает центр (анти-CLS).
          v1.0.46: профильные страницы — снова в общей сетке; мобильная
          витрина статистики на них НЕ рендерится. ---------- */}
      <main className="relative z-10 flex-1">
        <div
          className={cn(
            "mx-auto grid w-full grid-cols-1 justify-center gap-3 px-4 py-3",
            // правый столбец ужимается СТУПЕНЧАТО с экраном (золотой
            // стандарт 3 колонок: борт ≤ 25–30% вьюпорта, центр — главный)
            "min-[768px]:grid-cols-[minmax(0,1fr)_240px] min-[1024px]:grid-cols-[minmax(0,1fr)_280px] min-[1200px]:grid-cols-[220px_minmax(0,1fr)_300px]",
            SITE_WIDTH
          )}
        >
          {/* Левая колонка: список лиг (закреплённые — выше) и реклама.
              Живёт только от 1200px — ниже контент важнее навигации.
              v1.0.46: и на профильных страницах (статистика по краям) */}
          <aside className="sticky top-[121px] hidden max-h-[calc(100vh-129px)] self-start overflow-y-auto pr-1 scrollbar-s21 min-[1200px]:block">
            <BannerSlot banner={leftTopBanner} />
            <LeaguesSidebar overview={overview} version={version} activeLeagueId={activeLeagueId} />
            <div className="mt-3">
              <BannerSlot banner={leftBottomBanner} />
            </div>
          </aside>

          {/* Центральная колонка — главный экран: не сдвигается и не
              ужимается (ширина задаётся сеткой, а не содержимым) */}
          <div className="min-w-0">

            {/* v1.0.44: рекламный ряд из 3 над матчем убран (колонки
                возвращены — RIGHT-слоты снова в правом сайдбаре);
                AD-TOP — обычная полоса над контентом всех страниц (Р-29). */}
            <AdSlot banner={topBanner} fixedHeight={90} className="mb-3" />

            {children}

            {/* <768px: правая панель статистики — секциями ПОД лентой
                (карточки «Прямо сейчас», «Самой результативный», таблица).
                На профильных страницах — НЕ рендерим (v1.0.46: мобильный
                профиль остаётся компактным, статистика — в колонках ≥768).
                Sidebar-реклама здесь НЕ рендерится: слот AD-SIDEBAR
                живёт только при ≥768px (директива), креатив — в TOP/BOTTOM. */}
            {!isProfilePage && (
              <div className="mt-3 min-[768px]:hidden">
                <RightRail overview={overview} banners={[]} statBlocks={statBlocks} version={version} layout="grid" />
              </div>
            )}
            {/* <1200px: левая панель лиг — аккордеоном ПОД контентом
                (свёрнут по умолчанию, состояние в localStorage) */}
            <LeaguesAccordion overview={overview} version={version} activeLeagueId={activeLeagueId} />

            {/* Нижний баннер: AD-BOTTOM (Р-29) — конец ленты, 100%×90px,
                не sticky. На мобиле сюда же уходит креатив AD-SIDEBAR,
                если свой BOTTOM-баннер не занял место. */}
            <AdSlot banner={bottomBanner} fixedHeight={90} className="mt-3" />
            {!bottomBanner && !isProfilePage && (
              <div className="mt-3 min-[768px]:hidden">
                <AdSlot banner={railFallback} fixedHeight={90} />
              </div>
            )}
          </div>

          {/* Правая колонка: статистика, турнирная таблица и реклама.
              Живёт колонкой от 768px (директива Р-05); ниже — секции
              под лентой (см. выше), слот AD-SIDEBAR — только тут.
              v1.0.46: и на профильных страницах (фидбек 2026-10-06:
              «колонки слева и справа со статистикой — оставить») */}
          <aside className="sticky top-[121px] hidden max-h-[calc(100vh-129px)] self-start overflow-y-auto pl-1 scrollbar-s21 min-[768px]:block">
            <RightRail overview={overview} banners={banners} statBlocks={statBlocks} version={version} layout="rail" />
          </aside>
        </div>
      </main>

      {/* ---------- Футер ---------- */}
      <footer className="relative z-10 mt-auto border-t border-sline bg-[#07090d]">
        <div className={cn("mx-auto flex w-full flex-col gap-2 px-4 py-6 text-xs text-ink3 sm:flex-row sm:items-center sm:justify-between", SITE_WIDTH)}>
          <p className="flex items-center gap-2 text-ink">
            <span>© {year}</span>
            <LogoHorizontal height={24} variant="dark" />
            <span className="text-ink3">{BRAND.domain}</span>
          </p>
          <p>Матчи · турниры · таблицы · протоколы</p>
        </div>
      </footer>
    </div>
  );
}
