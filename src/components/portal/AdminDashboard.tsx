"use client";

// Дашборд админки (Ozon-style): KPI-карточки только для администрирования,
// лента «требуют внимания», быстрые действия и свежие изменения.

import { cn } from "@/lib/utils";
import { useFetch, fmtDate } from "./hooks";
import {
  CalendarDays, Radio, ClipboardList, Flag, Ban, CalendarPlus, Trophy, Users,
  Shield, History, ChevronRight,
} from "lucide-react";
import { ArrowRightLeft, CalendarClock } from "lucide-react";

export interface DashboardData {
  kpis: {
    matchesToday: number;
    live: number;
    protocolsPending: number;
    withoutReferee48h: number;
    activeSuspensions: number;
  };
  alerts: { id: string; level: "red" | "amber" | "info"; text: string; matchId: string | null }[];
  recentAudit: { id: string; userEmail: string | null; entity: string; entityId: string; action: string; createdAt: string }[];
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: "создан",
  UPDATE: "изменён",
  DELETE: "удалён",
  MERGE: "merge",
  COMPLETE: "завершён",
  WO_ASSIGN: "техпоражение",
  RESET: "сброшен",
};

interface Props {
  data: DashboardData | null;
  version: number;
  onOpenMatch: (id: string) => void;
  onNavigate: (section: string) => void;
  role: string;
}

export default function AdminDashboard({ data, version, onOpenMatch, onNavigate, role }: Props) {
  const k = data?.kpis;
  // Свежие изменения — лениво подтягиваем из журнала при открытом дашборде
  const { data: audit } = useFetch<{ logs: { id: string; userEmail: string | null; entity: string; action: string; createdAt: string }[] }>(
    role === "REFEREE" ? null : "/api/admin/audit?limit=8",
    version
  );

  const kpis = [
    { label: "Матчей сегодня", value: k?.matchesToday ?? "—", icon: CalendarDays, color: "text-emerald-600 bg-emerald-50", hint: "все лиги · по МСК" },
    { label: "Идут сейчас", value: k?.live ?? "—", icon: Radio, color: "text-red-600 bg-red-50", hint: "LIVE-матчи" },
    { label: "Протоколов к вводу", value: k?.protocolsPending ?? "—", icon: ClipboardList, color: "text-amber-600 bg-amber-50", hint: "начались, не закрыты" },
    { label: "Без судьи ≤48 ч", value: k?.withoutReferee48h ?? "—", icon: Flag, color: "text-orange-600 bg-orange-50", hint: "назначьте арбитра" },
    { label: "Активных дисквалов", value: k?.activeSuspensions ?? "—", icon: Ban, color: "text-red-600 bg-red-50", hint: "по всем лигам" },
  ];

  const quickActions = [
    { label: "Создать матч", icon: CalendarPlus, section: "matches", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
    { label: "Лига и сезон", icon: Trophy, section: "tournaments", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
    { label: "Добавить человека", icon: Users, section: "people", roles: ["CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
    { label: "Заявить игрока", icon: ArrowRightLeft, section: "registrations", roles: ["CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
    { label: "Расписание туров", icon: CalendarClock, section: "schedule", roles: ["LEAGUE_ADMIN", "SUPER_ADMIN"] },
    { label: "Клубы и команды", icon: Shield, section: "teams", roles: ["CLUB_ADMIN", "LEAGUE_ADMIN", "SUPER_ADMIN"] },
  ].filter((a) => a.roles.includes(role));

  const recent = audit?.logs ?? data?.recentAudit ?? [];

  return (
    <div className="space-y-5">
      {/* ---------- KPI ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", kpi.color)}>
                <kpi.icon className="h-4.5 w-4.5" />
              </span>
              <span className="font-mono text-2xl font-black text-zinc-900 tabular">{kpi.value}</span>
            </div>
            <p className="mt-2 text-xs font-bold text-zinc-700">{kpi.label}</p>
            <p className="text-xs text-zinc-400">{kpi.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        {/* ---------- Требуют внимания ---------- */}
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
            <History className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-bold text-zinc-800">Требуют внимания</p>
            <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-500">{data?.alerts.length ?? 0}</span>
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-s21">
            {(data?.alerts.length ?? 0) === 0 && (
              <p className="py-8 text-center text-sm text-zinc-400">Всё под контролем — алертов нет</p>
            )}
            {data?.alerts.map((a) => (
              <button
                key={a.id}
                onClick={() => a.matchId && onOpenMatch(a.matchId)}
                className="flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-zinc-50"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", a.level === "red" ? "bg-red-600" : "bg-amber-500")} />
                <span className="min-w-0 flex-1 text-sm text-zinc-600">{a.text}</span>
                {a.matchId && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600">
                    протокол <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {/* ---------- Быстрые действия ---------- */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="mb-3 text-sm font-bold text-zinc-800">Быстрые действия</p>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((a) => (
                <button
                  key={a.label}
                  onClick={() => onNavigate(a.section)}
                  className="flex items-center gap-2.5 rounded-lg border border-zinc-200 px-3 py-2.5 text-left text-xs font-semibold text-zinc-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-800"
                >
                  <a.icon className="h-4 w-4 shrink-0 text-emerald-600" />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* ---------- Свежие изменения ---------- */}
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <p className="text-sm font-bold text-zinc-800">Свежие изменения</p>
              {role !== "REFEREE" && (
                <button onClick={() => onNavigate("audit")} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                  весь журнал →
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto scrollbar-s21">
              {recent.length === 0 && <p className="py-6 text-center text-sm text-zinc-400">Изменений пока нет</p>}
              {recent.slice(0, 8).map((l) => (
                <div key={l.id} className="flex items-center gap-2.5 border-b border-zinc-100 px-4 py-2 text-xs last:border-b-0">
                  <span className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 font-semibold",
                    l.action === "CREATE" ? "bg-emerald-50 text-emerald-700" :
                    l.action === "DELETE" ? "bg-red-50 text-red-600" :
                    l.action === "COMPLETE" || l.action === "WO_ASSIGN" ? "bg-amber-50 text-amber-700" :
                    "bg-zinc-100 text-zinc-500"
                  )}>
                    {ACTION_LABELS[l.action] ?? l.action.toLowerCase()}
                  </span>
                  <span className="shrink-0 font-medium text-zinc-700">{l.entity}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-400">{l.userEmail ?? "система"}</span>
                  <span className="shrink-0 text-zinc-300">{fmtDate(l.createdAt, false)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
