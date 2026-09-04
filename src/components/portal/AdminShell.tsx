"use client";

// ============================================================
// Панель управления SCORESBOX — Ozon-style: светлый интерфейс,
// левое иконочное меню по группам, тулбар с поиском и колоколом
// алертов. Никаких лишних данных — только администрирование.
// ============================================================

import { useState } from "react";
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
import { MatchesCrudPanel } from "./MatchesCrudPanel";
import SecurityPanel from "./SecurityPanel";
import AdminDashboard, { DashboardData } from "./AdminDashboard";
import { BRAND } from "./brand";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard, Trophy, Shield, Users, MapPin, CalendarPlus, ClipboardPen, Ban, Megaphone,
  ArrowRightLeft, GitMerge, ScrollText, Bell, Search, LogOut, Home, Menu, CalendarClock, Flag, KeyRound,
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
}

type Section =
  | "dashboard" | "tournaments" | "teams" | "people" | "stadiums" | "matches" | "banners"
  | "protocol" | "kdc" | "schedule" | "registrations" | "merge" | "audit" | "security";

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ className?: string }>; group: string; roles: string[] }[] = [
  { id: "dashboard", label: "Дашборд", icon: LayoutDashboard, group: "Обзор", roles: ["REFEREE", "CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "tournaments", label: "Лиги и сезоны", icon: Trophy, group: "Турниры", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "matches", label: "Матчи", icon: CalendarPlus, group: "Турниры", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "schedule", label: "Расписание", icon: CalendarClock, group: "Турниры", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "protocol", label: "Протоколы матчей", icon: ClipboardPen, group: "Турниры", roles: ["REFEREE", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "kdc", label: "КДК · дисциплины", icon: Ban, group: "Турниры", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "teams", label: "Клубы и команды", icon: Shield, group: "Справочники", roles: ["CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "people", label: "Люди", icon: Users, group: "Справочники", roles: ["CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "stadiums", label: "Стадионы", icon: MapPin, group: "Справочники", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "registrations", label: "Заявки и трансферы", icon: ArrowRightLeft, group: "Справочники", roles: ["CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "banners", label: "Баннеры сайта", icon: Megaphone, group: "Сайт", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "merge", label: "Merge профилей", icon: GitMerge, group: "Система", roles: ["SUPER_ADMIN"] },
  { id: "security", label: "Безопасность", icon: KeyRound, group: "Система", roles: ["REFEREE", "CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  { id: "audit", label: "Журнал изменений", icon: ScrollText, group: "Система", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
];

const NEEDS_SEASON: Section[] = ["protocol", "kdc", "schedule", "registrations"];

export default function AdminShell({ user, version, bump, onReload, focusMatchId, onMatchHandled }: Props) {
  const [section, setSection] = useState<Section>(user.role === "REFEREE" ? "protocol" : "dashboard");
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  const { data: overview } = useFetch<OverviewDTO>("/api/public/overview", version);
  const { data: dash } = useFetch<DashboardData>("/api/admin/dashboard", version);
  const leagues = overview?.leagues ?? [];
  const league = leagues.find((l) => l.id === (leagueId || leagues[0]?.id));
  const seasons = league?.seasons ?? [];
  const effectiveSeasonId = seasonId || seasons.find((s) => s.isCurrent)?.id || seasons[0]?.id || "";

  const visible = SECTIONS.filter((s) => s.roles.includes(user.role) || user.role === "SUPER_ADMIN");
  const groups = [...new Set(visible.map((s) => s.group))];

  const { data, loading } = useFetch<{ matches: AdminMatch[] }>(
    effectiveSeasonId && NEEDS_SEASON.includes(section)
      ? `/api/admin/matches?seasonId=${effectiveSeasonId}`
      : null,
    version
  );

  const activeMatchId = focusMatchId ?? selectedMatchId;
  const alerts = dash?.alerts ?? [];
  const currentSection = visible.find((s) => s.id === section);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate("/");
    toast.success("Вы вышли из системы");
  };

  const openMatch = (id: string) => {
    setSelectedMatchId(id);
    setBellOpen(false);
  };

  // ---------- Навигация (сайдбар) ----------
  const nav = (onNavigate?: () => void) => (
    <AdminNav groups={groups} sections={visible} section={section} onSelect={(id) => { setSection(id); setSelectedMatchId(null); onNavigate?.(); }} />
  );

  // ---------- Контент секции ----------
  const renderSection = () => {
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

    switch (section) {
      case "dashboard":
        return <AdminDashboard data={dash} version={version} onOpenMatch={openMatch} onNavigate={(s) => setSection(s as Section)} role={user.role} />;
      case "tournaments":
        return <TournamentsPanel bump={bump} onReload={onReload} />;
      case "teams":
        return <ClubsTeamsPanel bump={bump} onReload={onReload} />;
      case "people":
        return <PeoplePanel bump={bump} onReload={onReload} />;
      case "stadiums":
        return <StadiumsPanel bump={bump} onReload={onReload} />;
      case "banners":
        return <BannersPanel bump={bump} onReload={onReload} />;
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
        return <RegistrationsPanel seasonId={effectiveSeasonId} bump={bump} />;
      case "merge":
        return <MergePanel bump={bump} />;
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
        {NEEDS_SEASON.includes(section) && !activeMatchId && (
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
