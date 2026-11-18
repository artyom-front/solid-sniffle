"use client";

// ============================================================
// SCORESBOX · ProtocolEditor — редактор протокола матча (v1.0.19).
//
// Оболочка (v1.0.30, «разборка гигантов»): шапка матча, счёт,
// назначение главного судьи, навигация по вкладкам и данные.
// Содержимое вкладок — в отдельных модулях:
//  • Составы  — ProtocolLineupTab (v1.0.28): старт → № → запас → штат;
//  • События  — ProtocolEventsTab: форма + хронология-ось;
//  • Бригада  — ProtocolOfficialsTab: черновик строк, PATCH массивом;
//  • Файл     — ProtocolFileTab: скан/фото/PDF бумажного протокола;
//  • Завершение — ProtocolFinishTab: complete / reset / WO.
// ============================================================

import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Flag, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost, fmtDate, useFetch } from "./hooks";
import type { SessionUserDTO } from "./types";
import { ScoreBox, StatusBadge } from "./ui-bits";
import ProtocolLineupTab, { type ProtocolData } from "./ProtocolLineupTab";
import ProtocolEventsTab from "./ProtocolEventsTab";
import ProtocolOfficialsTab from "./ProtocolOfficialsTab";
import ProtocolFileTab from "./ProtocolFileTab";
import ProtocolFinishTab from "./ProtocolFinishTab";
import { STATUS_SAFE, WO_LABEL, isProtocolLocked } from "./protocol-shared";

interface Props {
  matchId: string;
  user: SessionUserDTO;
  onBack: () => void;
  bump: () => void;
}

type TabId = "lineup" | "events" | "officials" | "file" | "finish";

export default function ProtocolEditor({ matchId, user, onBack, bump }: Props) {
  const [version, setVersion] = useState(0);
  const { data } = useFetch<ProtocolData>(`/api/admin/matches/${matchId}`, version);
  const [tab, setTab] = useState<TabId>("lineup");

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
    bump();
  }, [bump]);

  async function assignReferee(refereeId: string) {
    const res = await apiPost(`/api/admin/matches/${matchId}`, { action: "referee", refereeId });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Главный судья назначен");
    reload();
  }

  if (!data || !data.match) {
    return <div className="py-16 text-center text-zinc-400">Загрузка протокола...</div>;
  }

  const m = data.match;
  const isLocked = isProtocolLocked(m.status);
  const brigadeCount = (m.referee ? 1 : 0) + data.officials.filter((o) => !(o.role === "REFEREE" && o.person.id === m.referee?.id)).length;

  return (
    <div className="space-y-4">
      {/* Шапка матча */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> К списку</Button>
        <StatusBadge status={m.status} />
        {m.isFriendly ? (
          <Badge variant="outline" className="border-zinc-300 text-zinc-500">Товарищеский</Badge>
        ) : (
          m.round && <Badge variant="secondary">{m.round}-й тур</Badge>
        )}
        <span className="text-xs text-zinc-400">{fmtDate(m.kickoff)} · {m.league.name}</span>
      </div>

      {/* Подсказка: что такое протокол и когда он появляется */}
      <details className="group rounded-xl border border-zinc-200 bg-white">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700">
          <Info className="h-3.5 w-3.5 text-emerald-600" />
          Что делать в протоколе: 3 шага
        </summary>
        <ol className="list-decimal space-y-1 border-t border-zinc-100 px-8 py-3 pl-10 text-xs text-zinc-500">
          <li><b>Бригада</b> — главный судья (нужен для завершения) и официальные лица: помощники, VAR, инспектор, делегат, врач</li>
          <li><b>Составы</b> — порядок как в бумажной заявке: СНАЧАЛА стартовый состав (первые отмеченные попадают в старт), ему назначаются номера, затем запасные и в конце — тренер с руководством. Номер подставляется последний сыгранный в команде; одинаковые номера в одной команде запрещены. Дисквалифицированные помечены красным и заблокированы</li>
          <li><b>События</b> — голы, карточки, замены (одна строка = замена целиком) по минутам; счёт считается автоматически</li>
          <li><b>Завершение</b> — кнопка «Завершить» фиксирует результат, пересчитывает таблицу и включает дисциплинарные баны; скан бумажного протокола — на вкладке «Файл»</li>
        </ol>
      </details>

      <Card className="border-zinc-200">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="flex-1 text-right font-semibold">{m.homeTeam.name}</p>
            <div className="text-center">
              <div className="font-mono text-3xl font-bold"><ScoreBox score={m.homeScore !== null ? { home: m.homeScore, away: m.awayScore ?? 0 } : null} /></div>
              <p className="text-xs text-zinc-400">{m.status === "LIVE" ? "идёт ввод протокола" : STATUS_SAFE(m.status)}</p>
            </div>
            <p className="flex-1 font-semibold">{m.awayTeam.name}</p>
          </div>

          {/* Главный судья + счётчик бригады */}
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <Flag className="h-4 w-4 text-zinc-500" />
            {m.referee ? (
              <>
                <span className="text-sm font-medium">{m.referee.name}</span>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">главный судья</Badge>
                {brigadeCount > 1 && (
                  <button onClick={() => setTab("officials")} className="text-xs font-semibold text-emerald-700 hover:underline">
                    + бригада: {brigadeCount - 1} →
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-sm text-red-600 font-medium">Главный судья не назначен — завершение невозможно</span>
                {user.role !== "REFEREE" && (
                  <Select onValueChange={assignReferee}>
                    <SelectTrigger className="ml-auto h-8 w-56 bg-white text-xs"><SelectValue placeholder="Назначить судью" /></SelectTrigger>
                    <SelectContent>
                      {data.referees.map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}
            <button onClick={() => setTab("officials")} className="ml-auto text-xs font-semibold text-zinc-500 hover:text-emerald-700">
              Бригада матча →
            </button>
          </div>
        </CardContent>
      </Card>

      {isLocked && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Протокол закрыт для редактирования. {m.status === "WALKOVER" ? `Оформлено техническое поражение (${WO_LABEL[m.walkoverType ?? ""]}).` : ""}
            {" "}Дату, стадион и бригаду можно править без Reset. Статус и события — только после Reset.
            {user.role === "SUPER_ADMIN" && " Как супер-администратор вы можете вернуть матч в работу на вкладке «Завершение»."}
          </p>
        </div>
      )}

      {/* Вкладки */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1">
        {([
          ["lineup", "Составы"],
          ["events", `События (${data.events.length})`],
          ["officials", `Бригада${brigadeCount ? ` · ${brigadeCount}` : ""}`],
          ["file", "Файл протокола"],
          ["finish", "Завершение"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors", tab === id ? "bg-white shadow-sm" : "text-zinc-500 hover:text-zinc-800")}
            disabled={id === "finish" || id === "file" || id === "officials" ? false : isLocked}
          >
            {label}
            {id === "file" && m.protocolUrl ? " ✓" : ""}
          </button>
        ))}
      </div>

      {/* Вкладки: контент смонтирован всегда, видимость — через hidden.
          Так черновики (бригада, форма события) переживают переключение
          вкладок, как в монолите; space-y-4 селектор Tailwind
          (:not([hidden]) ~ :not([hidden])) корректно пропускает скрытые. */}
      <div className="space-y-4" hidden={tab !== "lineup"}>
        {!isLocked ? (
          <ProtocolLineupTab matchId={matchId} data={data} onReload={reload} />
        ) : (
          <Card className="border-zinc-200">
            <CardContent className="py-8 text-center text-sm text-zinc-400">
              Матч закрыт — составы не редактируются. Верните матч в работу (вкладка «Завершение»), чтобы изменить составы.
            </CardContent>
          </Card>
        )}
      </div>

      {/* ---------- События ---------- */}
      <div className="space-y-4" hidden={tab !== "events"}>
        <ProtocolEventsTab matchId={matchId} data={data} onReload={reload} />
      </div>

      {/* ---------- Бригада матча: key={version} — ремаунт при reload
          сбрасывает черновик на серверные строки (семантика монолита) ---------- */}
      <div className="space-y-4" hidden={tab !== "officials"}>
        <ProtocolOfficialsTab key={version} matchId={matchId} data={data} userRole={user.role} onReload={reload} />
      </div>

      {/* ---------- Файл протокола (скан/фото/PDF) ---------- */}
      <div className="space-y-4" hidden={tab !== "file"}>
        <ProtocolFileTab matchId={matchId} data={data} onReload={reload} />
      </div>

      {/* ---------- Завершение ---------- */}
      <div className="space-y-4" hidden={tab !== "finish"}>
        <ProtocolFinishTab matchId={matchId} data={data} userRole={user.role} onReload={reload} />
      </div>
    </div>
  );
}
