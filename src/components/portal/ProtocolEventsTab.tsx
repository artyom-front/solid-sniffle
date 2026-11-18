"use client";

// ============================================================
// SCORESBOX · ProtocolEventsTab — вкладка «События» редактора
// протокола (выделена из ProtocolEditor в v1.0.30).
//  • форма события: команда, тип, минута (45+X), игроки;
//  • замена = ОДНО событие с двумя игроками (▲ вышел / ▼ ушёл);
//  • v1.0.52: состояние матча (lib/engine/match-state) — в замене
//    «Выходит» предлагаются ТОЛЬКО запасные, «Уходит» — только игроки
//    на поле; во всех прочих событиях — только игроки НА ПОЛЕ;
//  • валидация на лету: дисквалификация, ассист=автор, дубль замены;
//  • хронология-ось (MatchTimeline) с удалением событий.
// ============================================================

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiPost } from "./hooks";
import { EVENT_LABELS } from "./types";
import { BallIcon } from "./EventIcons";
import MatchTimeline from "./MatchTimeline";
import { EVENT_TYPES, isProtocolLocked, type ProtocolTabProps } from "./protocol-shared";
import { computeMatchState, type MatchState } from "@/lib/engine/match-state";

export default function ProtocolEventsTab({ matchId, data, onReload }: ProtocolTabProps) {
  const m = data.match;

  // форма события
  const [evTeamRaw, setEvTeam] = useState<string>("");
  const [evType, setEvType] = useState("GOAL");
  const [evPerson, setEvPerson] = useState("");
  const [evAssist, setEvAssist] = useState("");
  const [evMinute, setEvMinute] = useState<string>("");
  const [evStoppage, setEvStoppage] = useState<string>("");

  const [busy, setBusy] = useState(false);

  const evTeam = evTeamRaw || m.homeTeam.id || "";
  const isLocked = isProtocolLocked(m.status);

  // v1.0.52 · СОСТОЯНИЕ МАТЧА ПО КАЖДОЙ КОМАНДЕ (одна логика с сервером —
  // lib/engine/match-state): НА ПОЛЕ = старт + вышедшие заменой − ушедшие;
  // СКАМЕЙКА = запас из протокола, ещё не выходивший. Правила:
  //   • замена: «Выходит» — ТОЛЬКО со скамейки, «Уходит» — ТОЛЬКО с поля;
  //   • прочие события (голы/карточки/VAR) — ТОЛЬКО игроки НА ПОЛЕ
  //     (запасной не участвует, пока не вышел заменой).
  const stateByTeam = useMemo(() => {
    const map = new Map<string, MatchState>();
    for (const team of [m.homeTeam, m.awayTeam]) {
      const lineup = data.lineup
        .filter((l) => l.teamId === team.id)
        .map((l) => ({ personId: l.personId, isStarter: l.isStarter }));
      const events = data.events
        .filter((e) => e.teamId === team.id)
        .map((e) => ({ type: e.type, personId: e.person.id, assistPersonId: e.assist?.id ?? null }));
      map.set(team.id, computeMatchState(lineup, events));
    }
    return map;
  }, [data, m.homeTeam, m.awayTeam]);

  // кандидаты события для выбранной команды, с учётом состояния матча
  const teamState = stateByTeam.get(evTeam);
  const teamEligible = evTeam === m.homeTeam.id ? data.eligible.home : data.eligible.away;
  /** игроки НА ПОЛЕ выбранной команды (для всех событий, кроме замены) */
  const onFieldPlayers = useMemo(
    () => (teamState ? teamEligible.filter((p) => teamState.onField.has(p.personId)) : teamEligible),
    [teamState, teamEligible]
  );
  /** СКАМЕЙКА выбранной команды (кто может ВЫЙТИ заменой) */
  const benchPlayers = useMemo(
    () => (teamState ? teamEligible.filter((p) => teamState.bench.has(p.personId)) : teamEligible),
    [teamState, teamEligible]
  );
  const lineupSubmitted = !!teamState?.hasLineup;

  async function addEvent() {
    const minute = Number(evMinute);
    if (!minute || minute < 1 || minute > 120) {
      toast.error("Укажите минуту события (1–120)");
      return;
    }
    if (evStoppage && (Number(evStoppage) < 1 || Number(evStoppage) > 15)) {
      toast.error("Добавленное время — от +1 до +15");
      return;
    }
    if (!evPerson) {
      toast.error(evType === "SUBSTITUTION" ? "Выберите игрока, который выходит на поле" : "Выберите игрока");
      return;
    }
    if (evType === "SUBSTITUTION" && !evAssist) {
      toast.error("Замена требует двух игроков: укажите, кто уходит с поля");
      return;
    }
    // v1.0.52 · мгновенная проверка состояния матча (состав мог измениться
    // после выбора — сервер всё равно проверит, но фронт скажет раньше)
    if (lineupSubmitted) {
      if (evType === "SUBSTITUTION") {
        if (!benchPlayers.some((p) => p.personId === evPerson)) {
          toast.error("Вышедший должен быть ЗАПАСНЫМ, ещё не выходившим. Обновите список — состав/замены уже изменились.");
          return;
        }
        if (!onFieldPlayers.some((p) => p.personId === evAssist)) {
          toast.error("Уходить может только игрок НА ПОЛЕ");
          return;
        }
      } else {
        if (!onFieldPlayers.some((p) => p.personId === evPerson)) {
          toast.error("Игрок не на поле — запасные участвуют только через замену");
          return;
        }
        if (evAssist && !onFieldPlayers.some((p) => p.personId === evAssist)) {
          toast.error("Ассистент не на поле — запасные участвуют только через замену");
          return;
        }
      }
    }
    // Валидация на лету (PRD §6): предупреждение до отправки
    const player = [...data.eligible.home, ...data.eligible.away].find((p) => p.personId === evPerson);
    if (player?.suspension) {
      toast.error(`У игрока ${player.name} активная дисквалификация! Действие запрещено регламентом.`, { duration: 7000 });
      return;
    }
    if ((evType === "GOAL" || evType === "PENALTY") && evAssist === evPerson) {
      toast.error("Автор ассиста не может совпадать с автором гола");
      return;
    }
    if (evType === "SUBSTITUTION" && evAssist === evPerson) {
      toast.error("Вышедший и ушедший игрок не могут совпадать");
      return;
    }

    setBusy(true);
    const res = await apiPost(`/api/admin/matches/${matchId}`, {
      action: "event", minute, stoppage: evStoppage ? Number(evStoppage) : null, type: evType,
      personId: evPerson, teamId: evTeam, assistPersonId: evAssist || null,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error, { duration: 7000 });
      return;
    }
    toast.success(`${EVENT_LABELS[evType]}: ${minute}${evStoppage ? `+${evStoppage}` : ""}' ${player?.name ?? ""}`);
    setEvPerson("");
    setEvAssist("");
    setEvMinute("");
    setEvStoppage("");
    onReload();
  }

  async function deleteEvent(eventId: string) {
    setBusy(true);
    const res = await apiPost(`/api/admin/matches/${matchId}`, { action: "deleteEvent", eventId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Событие удалено");
    onReload();
  }

  return (
    <>
      {!isLocked && (
        <Card className="border-zinc-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><BallIcon className="h-4 w-4 text-emerald-600" /> Добавить событие</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Команда</Label>
                <Select value={evTeam} onValueChange={(v) => { setEvTeam(v); setEvPerson(""); setEvAssist(""); }}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={m.homeTeam.id}>{m.homeTeam.name}</SelectItem>
                    <SelectItem value={m.awayTeam.id}>{m.awayTeam.name}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Тип</Label>
                <Select value={evType} onValueChange={(v) => { setEvType(v); setEvPerson(""); setEvAssist(""); }}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Минута</Label>
                <div className="flex gap-1.5">
                  <Input type="number" min={1} max={120} value={evMinute} onChange={(e) => setEvMinute(e.target.value)} placeholder="45" className="bg-white" />
                  <Input type="number" min={1} max={15} value={evStoppage} onChange={(e) => setEvStoppage(e.target.value)} placeholder="+X" className="w-20 bg-white" title="Добавленное время (например 45+3)" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  {evType === "SUBSTITUTION"
                    ? <span className="text-emerald-700">▲ Выходит на поле (запас)</span>
                    : evType === "GOAL" || evType === "PENALTY"
                      ? "Автор (на поле)"
                      : "Игрок (на поле)"}
                </Label>
                <Select value={evPerson} onValueChange={setEvPerson}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Выбрать" /></SelectTrigger>
                  <SelectContent>
                    {/* v1.0.52: замена — только запасные со скамейки;
                        прочие события — только игроки на поле */}
                    {(evType === "SUBSTITUTION" ? benchPlayers : onFieldPlayers).length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-zinc-400">
                        {lineupSubmitted
                          ? evType === "SUBSTITUTION"
                            ? "Нет доступных запасных: состав не подан с запасом, либо все уже на поле"
                            : "На поле никого — проверьте вкладку «Составы»"
                          : "Состав не подан — доступны все заявленные игроки"}
                      </div>
                    )}
                    {(evType === "SUBSTITUTION" ? benchPlayers : onFieldPlayers).map((p) => (
                      <SelectItem key={p.personId} value={p.personId} disabled={!!p.suspension}>
                        {p.name}{p.suspension ? " — ДИСКВАЛИФИЦИРОВАН" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* второй участник: ассист или уходящий игрок (v1.0.52 — только с поля) */}
              {(evType === "GOAL" || evType === "PENALTY") && (
                <div className="space-y-1">
                  <Label className="text-xs">Ассист (необяз., на поле)</Label>
                  <Select value={evAssist} onValueChange={setEvAssist}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {onFieldPlayers.filter((p) => p.personId !== evPerson).map((p) => (
                        <SelectItem key={p.personId} value={p.personId}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {evType === "SUBSTITUTION" && (
                <div className="space-y-1">
                  <Label className="text-xs text-red-600">▼ Уходит с поля</Label>
                  <Select value={evAssist} onValueChange={setEvAssist}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Кто покидает поле" /></SelectTrigger>
                    <SelectContent>
                      {onFieldPlayers.filter((p) => p.personId !== evPerson).map((p) => (
                        <SelectItem key={p.personId} value={p.personId}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {evType === "SUBSTITUTION" && (
              <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Замена записывается <b>одной строкой протокола</b>: ▲ вышедший — со скамейки запасных,
                ▼ ушедший — игрок на поле. В хронологии отобразится «▼ Иванов → ▲ Петров».
              </p>
            )}
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={addEvent}>
              Добавить событие
            </Button>
            <p className="text-xs text-zinc-400">
              Участвуют только игроки НА ПОЛЕ (состав — вкладка «Составы»): голы, карточки и VAR записываются
              игрокам на поле; запасной попадает туда только через событие «Замена». «+X» — добавленное время (45+3).
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-zinc-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Протокол</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.events.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">Событий пока нет</p>
          ) : (
            <>
              {/* шапка оси (v1.0.41 — сетка как в MatchTimeline):
                  [мин][хозяева][счёт][гости] */}
              <div className="grid grid-cols-[44px_minmax(0,1fr)_56px_minmax(0,1fr)] items-center gap-2 px-4 pb-1 pt-2 text-xs font-semibold text-zinc-500">
                <span className="text-center text-[10px] uppercase tracking-wider text-zinc-300">мин</span>
                <span className="truncate">{m.homeTeam.name}</span>
                <span className="text-center text-[10px] uppercase tracking-wider text-zinc-300">счёт</span>
                <span className="truncate text-right">{m.awayTeam.name}</span>
              </div>
              <div className="px-3 pb-3">
                <MatchTimeline
                  events={data.events}
                  homeTeamId={m.homeTeam.id}
                  status={m.status}
                  homeScore={m.homeScore}
                  awayScore={m.awayScore}
                  theme="light"
                  onDelete={!isLocked ? deleteEvent : undefined}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
