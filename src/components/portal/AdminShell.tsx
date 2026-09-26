"use client";

// ============================================================
// Панель управления SCORESBOX — Ozon-style: светлый интерфейс,
// левое иконочное меню по группам, тулбар с поиском и колоколом
// алертов. Никаких лишних данных — только администрирование.
// ============================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useFetch, fmtDate } from "./hooks";
import { navigate } from "./router";
import type { OverviewDTO, SessionUserDTO } from "./types";
import { ROLE_LABELS } from "@/lib/labels";
import { ScoreBox, StatusBadge } from "./ui-bits";
import { initials } from "./visuals";
import SearchDialog, { openGlobalSearch } from "./SearchDialog";
import ProtocolEditor from "./ProtocolEditor";
import { KdcPanel, SchedulePanel, RegistrationsPanel, MergePanel, AuditPanel } from "./AdminPanels";
import { TournamentsPanel, ClubsTeamsPanel } from "./CrudPanels";
import { PeoplePanel, StadiumsPanel, BannersPanel } from "./CrudPanels2";
import { StatBlocksPanel, FormatsPanel } from "./SiteContentPanels";
import TeamDetailPanel from "./TeamDetailPanel";
import PersonDetailPanel from "./PersonDetailPanel";
import { MatchesCrudPanel } from "./MatchesCrudPanel";
import { ImportPanel } from "./ImportPanel";
import { UsersPanel } from "./UsersPanel";
import SecurityPanel from "./SecurityPanel";
import AdminDashboard, { DashboardData } from "./AdminDashboard";
import { BRAND } from "./brand";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard, Trophy, Shield, Users, MapPin, CalendarPlus, ClipboardPen, Ban, Megaphone,
  ArrowRightLeft, GitMerge, ScrollText, Bell, Search, LogOut, Home, Menu, CalendarClock, Flag, KeyRound,
  FileSpreadsheet, Users2, Info, BarChart3, Shapes,
} from "lucide-react";

interface AdminMatch {
  id: string;
  round: number | null;
  kickoff: string;
  status: string;
  walkoverType: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
  referee: { id: string; name: string } | null;
}

interface Props {
  user: SessionUserDTO;
  version: number;
  bump: () => void;
  onReload: () => void;
  focusMatchId: string | null;
  onMatchHandled: () => void;
  /** секция из URL (SPA-навигация/deep-link: синхронизируется с состоянием) */
  urlSection: string | null;
}

type Section =
  | "dashboard" | "tournaments" | "teams" | "people" | "stadiums" | "matches" | "banners" | "statblocks" | "formats"
  | "protocol" | "kdc" | "schedule" | "registrations" | "import" | "merge" | "audit" | "security" | "users";

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }>; group: string; roles: string[] }[] = [
  { id: "dashboard", label: "Дашборд", icon: LayoutDashboard, group: "Обзор", roles: ["REFEREE", "CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "tournaments", label: "Лиги и сезоны", icon: Trophy, group: "Турниры", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "matches", label: "Матчи", icon: CalendarPlus, group: "Турниры", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "schedule", label: "Расписание", icon: CalendarClock, group: "Турниры", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "protocol", label: "Протоколы матчей", icon: ClipboardPen, group: "Турниры", roles: ["REFEREE", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "kdc", label: "КДК · дисциплины", icon: Ban, group: "Турниры", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "teams", label: "Клубы и команды", icon: Shield, group: "Справочники", roles: ["CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "people", label: "Люди", icon: Users, group: "Справочники", roles: ["CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "import", label: "Импорт (массово)", icon: FileSpreadsheet, group: "Справочники", roles: ["CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "stadiums", label: "Стадионы", icon: MapPin, group: "Справочники", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "registrations", label: "Заявки и трансферы", icon: ArrowRightLeft, group: "Справочники", roles: ["CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  // v1.0.32: контент сайта и системные разделы — только SUPER_ADMIN
  // (админ лиги, даже без скоупа, больше не управляет сайтом и доступами)
  { id: "banners", label: "Баннеры сайта", icon: Megaphone, group: "Сайт", roles: ["SUPER_ADMIN"] },
  { id: "statblocks", label: "Стат-карточки", icon: BarChart3, group: "Сайт", roles: ["SUPER_ADMIN"] },
  { id: "formats", label: "Виды футбола", icon: Shapes, group: "Сайт", roles: ["SUPER_ADMIN"] },
  { id: "merge", label: "Merge профилей", icon: GitMerge, group: "Система", roles: ["SUPER_ADMIN"] },
  { id: "users", label: "Пользователи", icon: Users2, group: "Система", roles: ["SUPER_ADMIN"] },
  { id: "security", label: "Безопасность", icon: KeyRound, group: "Система", roles: ["REFEREE", "CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "audit", label: "Журнал изменений", icon: ScrollText, group: "Система", roles: ["SUPER_ADMIN"] },
];

const NEEDS_SEASON: Section[] = ["protocol", "kdc", "schedule", "registrations"];

export default function AdminShell({ user, version, bump, onReload, focusMatchId, onMatchHandled, urlSection }: Props) {
  const router = useRouter();
  // v1.0.32: восстановление позиции после F5 — секция/лига/сезон читаются
  // из URL и синхронизируются обратно (обновление страницы больше не
  // сбрасывает на дашборд и не теряет контекст турнира)
  const initialParams = () => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search));
  const [section, setSection] = useState<Section>(() => {
    const s = initialParams().get("section") as Section | null;
    if (s && SECTIONS.some((x) => x.id === s)) return s;
    return user.role === "REFEREE" ? "protocol" : "dashboard";
  });
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  // «Проваливание» в сущности: список → команда → игрок (хлебные крошки в панелях)
  const [focusTeamId, setFocusTeamId] = useState<string | null>(null);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null);
  const [personBackLabel, setPersonBackLabel] = useState("Люди");
  const [leagueId, setLeagueId] = useState(() => initialParams().get("league") ?? "");
  const [seasonId, setSeasonId] = useState(() => initialParams().get("season") ?? "");
  const [mobileNav, setMobileNav] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  // v1.0.32: живые данные — лёгкий опрос каждые 30 с (только когда вкладка
  // видима). Опрашиваются overview/дашборд/список протоколов — ЧИТАЕМЫЕ
  // данные; панели и черновики форм НЕ ремаунтятся (tick не попадает в их
  // версию), так что незасохранённые данные не теряются.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // позиция → URL (deep-links и F5)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("section", section);
    if (leagueId) params.set("league", leagueId); else params.delete("league");
    if (seasonId) params.set("season", seasonId); else params.delete("season");
    if (selectedMatchId) params.set("match", selectedMatchId);
    const qs = params.toString();
    router.replace(qs ? `/admin?${qs}` : "/admin", { scroll: false });
  }, [section, leagueId, seasonId, selectedMatchId, router]);

  // SPA-навигация с другим ?section= (deep-link) — применяем внешнюю секцию.
  // Паттерн «derived state»: правим состояние ПРИ рендере (не в эффекте),
  // иначе react-hooks/set-state-in-effect (тот же случай, что в Task 35)
  const [seenUrlSection, setSeenUrlSection] = useState<string | null>(urlSection);
  if (urlSection !== seenUrlSection) {
    setSeenUrlSection(urlSection);
    if (urlSection && SECTIONS.some((s) => s.id === urlSection) && urlSection !== section) {
      setSection(urlSection as Section);
      setSelectedMatchId(null);
      setFocusTeamId(null);
      setFocusPersonId(null);
    }
  }

  const liveVersion = version + tick;
  const { data: overview } = useFetch<OverviewDTO>("/api/public/overview", liveVersion);
  const { data: dash } = useFetch<DashboardData>("/api/admin/dashboard", liveVersion);
  // админ конкретной лиги видит в контексте только её
  const isScopedLeagueAdmin = user.role === "LEAGUE_ADMIN" && user.leagueId !== null;
  const leagues = isScopedLeagueAdmin ? (overview?.leagues ?? []).filter((l) => l.id === user.leagueId) : (overview?.leagues ?? []);
  const league = leagues.find((l) => l.id === (leagueId || leagues[0]?.id));
  const seasons = league?.seasons ?? [];
  const effectiveSeasonId = seasonId || seasons.find((s) => s.isCurrent)?.id || seasons[0]?.id || "";

  const visible = SECTIONS.filter((s) => s.roles.includes(user.role) || user.role === "SUPER_ADMIN");
  const groups = [...new Set(visible.map((s) => s.group))];
  // защита от «чужой» секции в URL (напр. ?section=users для клубного админа)
  const activeSection: Section = visible.some((s) => s.id === section) ? section : user.role === "REFEREE" ? "protocol" : "dashboard";

  const { data, loading } = useFetch<{ matches: AdminMatch[] }>(
    effectiveSeasonId && NEEDS_SEASON.includes(activeSection)
      ? `/api/admin/matches?seasonId=${effectiveSeasonId}`
      : null,
    liveVersion
  );

  const activeMatchId = focusMatchId ?? selectedMatchId;
  const alerts = dash?.alerts ?? [];
  const currentSection = visible.find((s) => s.id === activeSection);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate("/");
    toast.success("Вы вышли из системы");
  };

  const openMatch = (id: string) => {
    setSelectedMatchId(id);
    setBellOpen(false);
  };

  // ---------- Проваливание в сущности ----------
  /** Открыть карточку команды (из списка, из карточки игрока, из заявок) */
  const openTeam = (teamId: string) => {
    setFocusTeamId(teamId);
    setFocusPersonId(null);
  };
  /** Открыть карточку персоны; backLabel — откуда пришли («Люди» или имя команды) */
  const openPerson = (personId: string, backLabel = "Люди") => {
    setFocusPersonId(personId);
    setPersonBackLabel(backLabel);
  };
  const closePerson = () => setFocusPersonId(null);
  const closeTeam = () => { setFocusTeamId(null); setFocusPersonId(null); };

  // ---------- Навигация (сайдбар) ----------
  const nav = (onNavigate?: () => void) => (
    <AdminNav groups={groups} sections={visible} section={activeSection} onSelect={(id) => { setSection(id); setSelectedMatchId(null); setFocusTeamId(null); setFocusPersonId(null); onNavigate?.(); }} />
  );

  // ---------- Контент секции ----------
  const renderSection = () => {
    // Карточка персоны — максимальный приоритет (в неё попадают из команды и из списка)
    if (focusPersonId) {
      return (
        <PersonDetailPanel
          personId={focusPersonId}
          version={version}
          bump={bump}
          onBack={closePerson}
          backLabel={focusTeamId ? "← к команде" : personBackLabel}
          onOpenTeam={(teamId) => openTeam(teamId)}
          canDelete={user.role === "LEAGUE_ADMIN" || user.role === "SUPER_ADMIN"}
        />
      );
    }

    // Карточка команды — состав, матчи, редактирование
    if (focusTeamId) {
      return (
        <TeamDetailPanel
          teamId={focusTeamId}
          version={version}
          bump={bump}
          onBack={closeTeam}
          onOpenPerson={(personId) => openPerson(personId, "← к составу")}
          onOpenMatch={openMatch}
          overview={overview}
          canDeleteTeam={user.role === "LEAGUE_ADMIN" || user.role === "SUPER_ADMIN"}
        />
      );
    }

    if (activeMatchId) {
      return (
        <ProtocolEditor
          matchId={activeMatchId}
          user={user}
          onBack={() => {
            onMatchHandled();
            setSelectedMatchId(null);
          }}
          bump={bump}
        />
      );
    }

    switch (activeSection) {
      case "dashboard":
        return <AdminDashboard data={dash} version={liveVersion} onOpenMatch={openMatch} onNavigate={(s) => setSection(s as Section)} role={user.role} />;
      case "tournaments":
        return <TournamentsPanel bump={bump} onReload={onReload} version={version} onNavigate={(s) => setSection(s as Section)} />;
      case "teams":
        return <ClubsTeamsPanel bump={bump} onReload={onReload} version={version} onOpenTeam={openTeam} userRole={user.role} />;
      case "people":
        return <PeoplePanel bump={bump} onReload={onReload} version={version} onOpenPerson={openPerson} />;
      case "stadiums":
        return <StadiumsPanel bump={bump} onReload={onReload} version={version} />;
      case "banners":
        return <BannersPanel bump={bump} onReload={onReload} version={version} />;
      case "statblocks":
        return <StatBlocksPanel bump={bump} onReload={onReload} version={version} />;
      case "formats":
        return <FormatsPanel bump={bump} onReload={onReload} version={version} />;
      case "matches":
        return (
          <MatchesCrudPanel
            bump={bump}
            version={version}
            overview={overview}
            onOpenProtocol={(matchId) => setSelectedMatchId(matchId)}
          />
        );
      case "protocol":
        return <ProtocolList matches={data?.matches ?? []} loading={loading} hasSeason={!!effectiveSeasonId} onOpen={openMatch} />;
      case "kdc":
        return <KdcPanel seasonId={effectiveSeasonId} bump={bump} />;
      case "schedule":
        return <SchedulePanel seasonId={effectiveSeasonId} bump={bump} />;
      case "registrations":
        return <RegistrationsPanel seasonId={effectiveSeasonId} bump={bump} version={version} onOpenTeam={openTeam} onOpenPerson={(pid) => openPerson(pid)} />;
      case "import":
        return <ImportPanel bump={bump} version={version} overview={overview} />;
      case "merge":
        return <MergePanel bump={bump} />;
      case "users":
        return user.role === "SUPER_ADMIN" ? <UsersPanel version={version} bump={bump} selfId={user.id} /> : null;
      case "security":
        return <SecurityPanel />;
      case "audit":
        return <AuditPanel />;
    }
  };

  return (
    <div className="theme-light flex min-h-screen bg-s0 text-ink">
      <SearchDialog />

      {/* ---------- Сайдбар (десктоп) ---------- */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
        <button className="flex items-center gap-2.5 border-b border-zinc-200 px-5 py-4" onClick={() => navigate("/")} aria-label="На сайт">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold font-mono text-lg font-black text-white">{BRAND.mark}</span>
          <span className="text-left leading-none">
            <span className="block text-base font-black tracking-tight text-zinc-900">{BRAND.name}</span>
            <span className="mt-0.5 block text-xs font-medium text-zinc-400">панель управления</span>
          </span>
        </button>

        {nav()}

        {/* Карточка пользователя */}
        <div className="border-t border-zinc-200 p-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-zinc-50 p-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              {initials(user.personName ?? user.email)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-zinc-800">{user.personName ?? user.email}</p>
              <p className="truncate text-xs text-zinc-400">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" className="h-8 border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50" onClick={() => navigate("/")}>
              <Home className="mr-1 h-3.5 w-3.5" /> Сайт
            </Button>
            <Button variant="outline" size="sm" className="h-8 border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50" onClick={logout}>
              <LogOut className="mr-1 h-3.5 w-3.5" /> Выйти
            </Button>
          </div>
        </div>
      </aside>

      {/* ---------- Основная колонка ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Тулбар */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur">
          {/* Мобильное меню */}
          <Sheet open={mobileNav} onOpenChange={setMobileNav}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 w-9 border-zinc-200 p-0 lg:hidden" aria-label="Меню">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-0">
              <SheetTitle className="sr-only">Меню админки</SheetTitle>
              <div className="flex items-center gap-2.5 border-b border-zinc-200 px-5 py-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold font-mono text-base font-black text-white">{BRAND.mark}</span>
                <span className="text-base font-black tracking-tight text-zinc-900">{BRAND.name}</span>
              </div>
              {nav(() => setMobileNav(false))}
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-base font-bold text-zinc-900">
              {currentSection && <currentSection.icon className="h-4 w-4 text-emerald-600" />}
              {currentSection?.label ?? "Панель управления"}
            </p>
          </div>

          {/* Поиск */}
          <button
            onClick={openGlobalSearch}
            className="ml-auto hidden h-9 min-w-0 max-w-xs flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-400 transition-colors hover:border-emerald-300 hover:text-zinc-600 md:flex"
            aria-label="Поиск"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">Команда, игрок, лига…</span>
            <kbd className="shrink-0 rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-xs">/</kbd>
          </button>

          {/* Колокол алертов */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              className={cn("relative h-9 w-9 border-zinc-200 p-0", bellOpen && "border-emerald-400 bg-emerald-50")}
              onClick={() => setBellOpen((v) => !v)}
              aria-label={`Уведомления (${alerts.length})`}
            >
              <Bell className="h-4 w-4 text-zinc-500" />
              {alerts.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                  {alerts.length}
                </span>
              )}
            </Button>
            {bellOpen && (
              <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
                <p className="border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Требуют внимания · {alerts.length}
                </p>
                <div className="max-h-80 overflow-y-auto scrollbar-s21">
                  {alerts.length === 0 && <p className="py-6 text-center text-sm text-zinc-400">Всё в порядке</p>}
                  {alerts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => a.matchId && openMatch(a.matchId)}
                      className="flex w-full items-start gap-2.5 border-b border-zinc-100 px-4 py-3 text-left text-sm hover:bg-zinc-50 last:border-b-0"
                    >
                      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.level === "red" ? "bg-red-600" : "bg-amber-500")} />
                      <span className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-600">{a.text}</span>
                      {a.matchId && <Flag className="h-3.5 w-3.5 shrink-0 text-zinc-300" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" className="hidden h-9 border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50 sm:inline-flex" onClick={() => navigate("/")}>
            <Home className="mr-1 h-3.5 w-3.5" /> На сайт
          </Button>
        </header>

        {/* Контекстная панель: лига/сезон для турнирных разделов */}
        {NEEDS_SEASON.includes(activeSection) && !activeMatchId && !focusTeamId && !focusPersonId && (
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2.5">
            <span className="text-xs font-semibold text-zinc-400">Контекст:</span>
            <select
              value={leagueId || leagues[0]?.id || ""}
              onChange={(e) => { setLeagueId(e.target.value); setSeasonId(""); }}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-700"
              aria-label="Лига"
            >
              {leagues.map((l) => <option key={l.id} value={l.id}>{l.shortName ?? l.name}</option>)}
            </select>
            <select
              value={effectiveSeasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-700"
              aria-label="Сезон"
            >
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? " (тек.)" : ""}</option>)}
            </select>
          </div>
        )}

        {/* Контент */}
        <main className="min-w-0 flex-1 p-4 sm:p-6">{renderSection()}</main>
      </div>
    </div>
  );
}

/** Навигация сайдбара админки (модульный компонент — вне рендера, чтобы не пересоздавался) */
function AdminNav({ groups, sections, section, onSelect }: {
  groups: string[];
  sections: { id: Section; label: string; icon: React.ComponentType<{ className?: string }>; group: string; roles: string[] }[];
  section: Section;
  onSelect: (id: Section) => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4 scrollbar-s21" aria-label="Разделы админки">
      {groups.map((g) => (
        <div key={g}>
          <p className="px-3 pb-1.5 pt-1 text-xs font-bold uppercase tracking-wider text-zinc-400">{g}</p>
          {sections.filter((s) => s.group === g).map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={cn(
                "mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                section === s.id ? "bg-emerald-50 text-emerald-700" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              )}
            >
              <s.icon className={cn("h-4 w-4 shrink-0", section === s.id ? "text-emerald-600" : "text-zinc-400")} />
              {s.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Список протоколов: к вводу + завершённые */
function ProtocolList({ matches, loading, hasSeason, onOpen }: { matches: AdminMatch[]; loading: boolean; hasSeason: boolean; onOpen: (id: string) => void }) {
  const pending = matches.filter((m) => m.status === "SCHEDULED" || m.status === "LIVE");
  const done = matches.filter((m) => m.status === "COMPLETED" || m.status === "WALKOVER");

  if (!hasSeason) return <p className="text-sm text-zinc-400">Создайте лигу и сезон в разделе «Лиги и сезоны»</p>;
  if (loading && !matches.length) return <p className="py-8 text-center text-sm text-zinc-400">Загрузка...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-500">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p>
          Здесь появляются <b>все созданные матчи сезона</b> (из раздела «Матчи» или генератора «Расписание»).
          «К вводу протокола» — сыгранные или будущие матчи, по которым не введён результат.
          Нажмите на матч → заполните составы, события, завершите матч и приложите скан бумажного протокола.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-emerald-50/60 px-4 py-2.5 text-sm font-bold text-emerald-800">
          <ClipboardPen className="h-4 w-4 text-emerald-600" /> К вводу протокола · {pending.length}
        </div>
        {pending.length === 0 && <p className="py-8 text-center text-sm text-zinc-400">Нет матчей, ожидающих протокола</p>}
        {pending.map((m) => (
          <button key={m.id} onClick={() => onOpen(m.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-emerald-50/40">
            <div className="w-36 shrink-0 text-xs text-zinc-400">{fmtDate(m.kickoff)}</div>
            <div className="flex min-w-[220px] flex-1 items-center gap-2 text-sm font-medium text-zinc-700">
              {m.homeTeam.name}
              <ScoreBox score={m.homeScore !== null ? { home: m.homeScore, away: m.awayScore ?? 0 } : null} status={m.status} />
              {m.awayTeam.name}
            </div>
            <StatusBadge status={m.status} />
            {m.referee ? (
              <span className="flex items-center gap-1 text-xs text-zinc-400"><Flag className="h-3 w-3" />{m.referee.name}</span>
            ) : (
              <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">судья не назначен</span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 text-sm font-bold text-zinc-600">
          Завершённые · {done.length}
        </div>
        {done.map((m) => (
          <button key={m.id} onClick={() => onOpen(m.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-100 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-zinc-50">
            <div className="w-36 shrink-0 text-xs text-zinc-400">{fmtDate(m.kickoff, false)}</div>
            <div className="flex min-w-[220px] flex-1 items-center gap-2 text-sm text-zinc-500">
              {m.homeTeam.name}
              <ScoreBox score={m.homeScore !== null ? { home: m.homeScore, away: m.awayScore ?? 0 } : null} status={m.status} />
              {m.awayTeam.name}
            </div>
            <StatusBadge status={m.status} />
          </button>
        ))}
      </div>
    </div>
  );
}
