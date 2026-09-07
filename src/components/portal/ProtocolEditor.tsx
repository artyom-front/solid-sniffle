"use client";

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Ban, Flag, CheckCircle2, RotateCcw, Trash2, Users, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost, fmtDate, useFetch } from "./hooks";
import type { SessionUserDTO } from "./types";
import { EVENT_LABELS } from "./types";
import { ScoreBox, StatusBadge } from "./ui-bits";
import { EventIcon, BallIcon, CardIcon } from "./EventIcons";

interface EligiblePlayer {
  personId: string;
  name: string;
  position: string | null;
  number: number | null;
  registrationOk: boolean;
  suspension: { matchesRemaining: number; isLifetime: boolean; source: string } | null;
}

interface ProtocolData {
  match: {
    id: string; round: number | null; kickoff: string; status: string; walkoverType: string | null;
    homeScore: number | null; awayScore: number | null; note: string | null;
    homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
    referee: { id: string; name: string } | null;
    season: { id: string; name: string };
    league: { id: string; name: string; walkoverScore: number };
  };
  eligible: { home: EligiblePlayer[]; away: EligiblePlayer[] };
  events: { id: string; minute: number; type: string; teamId: string; person: { id: string; name: string }; assist: { id: string; name: string } | null }[];
  lineup: { teamId: string; personId: string; isStarter: boolean; number: number | null }[];
  referees: { id: string; name: string }[];
}

interface Props {
  matchId: string;
  user: SessionUserDTO;
  onBack: () => void;
  bump: () => void;
}

const EVENT_TYPES = [
  { value: "GOAL", label: "Гол" },
  { value: "PENALTY", label: "Гол с пенальти" },
  { value: "OWN_GOAL", label: "Автогол" },
  { value: "YELLOW_CARD", label: "Жёлтая карточка" },
  { value: "RED_CARD", label: "Красная карточка" },
  { value: "SUB_OUT", label: "Замена: ушёл с поля" },
  { value: "SUB_IN", label: "Замена: вышел на поле" },
  { value: "VAR_GOAL_CONFIRM", label: "VAR: гол подтверждён" },
  { value: "VAR_GOAL_CANCEL", label: "VAR: гол отменён" },
  { value: "VAR_PENALTY", label: "VAR: назначен пенальти" },
];

export default function ProtocolEditor({ matchId, user, onBack, bump }: Props) {
  const [version, setVersion] = useState(0);
  const { data } = useFetch<ProtocolData>(`/api/admin/matches/${matchId}`, version);
  const [tab, setTab] = useState<"lineup" | "events" | "finish">("lineup");

  // форма события
  const [evTeamRaw, setEvTeam] = useState<string>("");
  const [evType, setEvType] = useState("GOAL");
  const [evPerson, setEvPerson] = useState("");
  const [evAssist, setEvAssist] = useState("");
  const [evMinute, setEvMinute] = useState<string>("");

  // форма состава: оверрайды поверх состояния из БД (derive-паттерн вместо effect)
  const [lineupOverrides, setLineupOverrides] = useState<{ home?: Set<string>; away?: Set<string> }>({});

  // форма WO
  const [woType, setWoType] = useState("HOME");
  const [woNote, setWoNote] = useState("");

  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setVersion((v) => v + 1);
    bump();
  }, [bump]);

  const m = data?.match;
  const evTeam = evTeamRaw || m?.homeTeam.id || "";

  // составы: оверрайды поверх текущих заявок из БД
  const lineupSel = useMemo(() => {
    const home = lineupOverrides.home ?? new Set((data?.lineup ?? []).filter((l) => l.teamId === data?.match.homeTeam.id).map((l) => l.personId));
    const away = lineupOverrides.away ?? new Set((data?.lineup ?? []).filter((l) => l.teamId === data?.match.awayTeam.id).map((l) => l.personId));
    return { home, away };
  }, [data, lineupOverrides]);

  /** игроки «на поле»: заявка на матч − заменённые + вышедшие */
  const onField = useMemo(() => {
    if (!data) return new Map<string, string>();
    const map = new Map<string, string>(); // personId -> name
    for (const l of data.lineup) {
      const p = [...data.eligible.home, ...data.eligible.away].find((x) => x.personId === l.personId);
      if (p) map.set(l.personId, p.name);
    }
    for (const e of data.events) {
      if (e.type === "SUB_OUT") map.delete(e.person.id);
      if (e.type === "SUB_IN") map.set(e.person.id, e.person.name);
    }
    return map;
  }, [data]);

  const isEditable = m && (m.status === "SCHEDULED" || m.status === "LIVE");

  async function submitLineup(teamId: "home" | "away") {
    if (!data) return;
    const personIds = [...lineupSel[teamId]];
    setBusy(true);
    const res = await apiPost(`/api/admin/matches/${matchId}`, { action: "lineup", teamId: data.match[teamId === "home" ? "homeTeam" : "awayTeam"].id, personIds });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error, { duration: 6000 });
      return;
    }
    toast.success(`Состав ${data.match[teamId === "home" ? "homeTeam" : "awayTeam"].name} подан (${personIds.length} игроков)`);
    reload();
  }

  async function addEvent() {
    if (!data) return;
    const minute = Number(evMinute);
    if (!minute || minute < 1 || minute > 120) {
      toast.error("Укажите минуту события (1–120)");
      return;
    }
    if (!evPerson) {
      toast.error("Выберите игрока");
      return;
    }
    // Валидация на лету (PRD §6): предупреждение до отправки
    const player = [...data.eligible.home, ...data.eligible.away].find((p) => p.personId === evPerson);
    if (player?.suspension && evType !== "SUB_IN") {
      toast.error(`У игрока ${player.name} активная дисквалификация! Действие запрещено регламентом.`, { duration: 7000 });
      return;
    }
    if ((evType === "GOAL" || evType === "PENALTY") && evAssist === evPerson) {
      toast.error("Автор ассиста не может совпадать с автором гола");
      return;
    }

    setBusy(true);
    const res = await apiPost(`/api/admin/matches/${matchId}`, {
      action: "event", minute, type: evType, personId: evPerson, teamId: evTeam, assistPersonId: evAssist || null,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error, { duration: 7000 });
      return;
    }
    toast.success(`${EVENT_LABELS[evType]} добавлено: ${player?.name ?? ""} ${minute}'`);
    setEvPerson("");
    setEvAssist("");
    setEvMinute("");
    reload();
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
    reload();
  }

  async function assignReferee(refereeId: string) {
    const res = await apiPost(`/api/admin/matches/${matchId}`, { action: "referee", refereeId });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Главный судья назначен");
    reload();
  }

  async function completeMatch() {
    if (!m?.referee) {
      toast.error("Матч не может быть завершён без назначенного главного судьи (инвариант PRD §4)");
      return;
    }
    setBusy(true);
    const res = await apiPost<{ score: { home: number; away: number } }>(`/api/admin/matches/${matchId}`, { action: "complete" });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error, { duration: 7000 });
      return;
    }
    toast.success(`Матч завершён. Итоговый счёт ${res.data?.score.home}:${res.data?.score.away}. Таблица пересчитана.`);
    reload();
  }

  async function assignWalkover() {
    setBusy(true);
    const res = await apiPost(`/api/admin/matches/${matchId}`, { action: "walkover", walkoverType: woType, note: woNote || undefined });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Техническое поражение оформлено");
    reload();
  }

  async function resetMatch() {
    setBusy(true);
    const res = await apiPost(`/api/admin/matches/${matchId}`, { action: "reset" });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Матч возвращён в работу, дисциплинарные последствия откачены");
    reload();
  }

  if (!data || !m) {
    return <div className="py-16 text-center text-zinc-400">Загрузка протокола...</div>;
  }

  const isLocked = m.status === "COMPLETED" || m.status === "WALKOVER";

  return (
    <div className="space-y-4">
      {/* Шапка матча */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> К списку</Button>
        <StatusBadge status={m.status} />
        {m.round && <Badge variant="secondary">{m.round}-й тур</Badge>}
        <span className="text-xs text-zinc-400">{fmtDate(m.kickoff)} · {m.league.name}</span>
      </div>

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

          {/* Назначение судьи */}
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <Flag className="h-4 w-4 text-zinc-500" />
            {m.referee ? (
              <>
                <span className="text-sm font-medium">{m.referee.name}</span>
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">главный судья</Badge>
              </>
            ) : (
              <>
                <span className="text-sm text-red-600 font-medium">Судья не назначен — завершение невозможно</span>
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
          </div>
        </CardContent>
      </Card>

      {isLocked && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Матч закрыт для редактирования. {m.status === "WALKOVER" ? `Оформлено техническое поражение (${WO_LABEL[m.walkoverType ?? ""]}).` : ""}
            {user.role === "SUPER_ADMIN" && " Как супер-администратор вы можете вернуть матч в работу на вкладке «Завершение»."}
          </p>
        </div>
      )}

      {/* Вкладки */}
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
        {([["lineup", "Составы"], ["events", `События (${data.events.length})`], ["finish", "Завершение"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", tab === id ? "bg-white shadow-sm" : "text-zinc-500 hover:text-zinc-800")}
            disabled={id === "finish" ? false : isLocked}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---------- Составы ---------- */}
      {tab === "lineup" && !isLocked && (
        <div className="grid gap-4 lg:grid-cols-2">
          {(["home", "away"] as const).map((side) => {
            const team = side === "home" ? m.homeTeam : m.awayTeam;
            const players = data.eligible[side];
            const selected = lineupSel[side];
            return (
              <Card key={side} className="border-zinc-200">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-emerald-600" /> {team.name}</CardTitle>
                  <Badge variant="secondary">{selected.size} заявлено</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                    {players.map((p) => {
                      const isSelected = selected.has(p.personId);
                      const suspended = !!p.suspension;
                      return (
                        <button
                          key={p.personId}
                          onClick={() => {
                            if (suspended) {
                              toast.error(`У игрока ${p.name} активная дисквалификация! Он не может быть заявлен на матч.`, { duration: 6000 });
                              return;
                            }
                            const next = new Set(selected);
                            if (next.has(p.personId)) next.delete(p.personId);
                            else next.add(p.personId);
                            setLineupOverrides((s) => ({ ...s, [side]: next }));
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                            suspended
                              ? "border-red-200 bg-red-50 opacity-80"
                              : isSelected
                                ? "border-emerald-300 bg-emerald-50"
                                : "border-zinc-200 bg-white hover:border-zinc-300"
                          )}
                        >
                          <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", isSelected && !suspended ? "border-emerald-600 bg-emerald-600" : "border-zinc-300")}>
                            {isSelected && !suspended && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                          </span>
                          <span className="w-7 text-center font-mono text-xs text-zinc-400">{p.number ?? "—"}</span>
                          <span className="flex-1 truncate font-medium">{p.name}</span>
                          {p.position && <span className="text-xs text-zinc-400">{p.position}</span>}
                          {p.suspension && (
                            <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                              <Ban className="h-3 w-3" />
                              {p.suspension.isLifetime ? "пожизненно" : `бан ${p.suspension.matchesRemaining} матч.`}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy || selected.size === 0} onClick={() => submitLineup(side)}>
                    Подать состав ({selected.size})
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------- События ---------- */}
      {tab === "events" && (
        <>
          {!isLocked && (
            <Card className="border-zinc-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><BallIcon className="h-4 w-4 text-emerald-600" /> Добавить событие</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
                    <Select value={evType} onValueChange={(v) => { setEvType(v); setEvAssist(""); }}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EVENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Игрок {evType === "GOAL" || evType === "PENALTY" ? <span className="text-zinc-400">(на поле)</span> : null}</Label>
                    <Select value={evPerson} onValueChange={setEvPerson}>
                      <SelectTrigger className="bg-white"><SelectValue placeholder="Выбрать" /></SelectTrigger>
                      <SelectContent>
                        {evTeam && (evType === "GOAL" || evType === "PENALTY"
                          ? [...onField.entries()].filter(([pid]) => {
                              const team = evTeam === m.homeTeam.id ? data.eligible.home : data.eligible.away;
                              return team.some((p) => p.personId === pid);
                            })
                          : (evTeam === m.homeTeam.id ? data.eligible.home : data.eligible.away)
                        ).map((entry) => {
                          const pid = Array.isArray(entry) ? entry[0] : entry.personId;
                          const name = Array.isArray(entry) ? entry[1] : entry.name;
                          const suspended = Array.isArray(entry) ? false : !!entry.suspension;
                          return (
                            <SelectItem key={pid} value={pid} disabled={suspended}>
                              {name}{suspended ? " — ДИСКВАЛИФИЦИРОВАН" : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  {(evType === "GOAL" || evType === "PENALTY") && (
                    <div className="space-y-1">
                      <Label className="text-xs">Ассист (необяз.)</Label>
                      <Select value={evAssist} onValueChange={setEvAssist}>
                        <SelectTrigger className="bg-white"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {[...onField.entries()].filter(([pid]) => pid !== evPerson).map(([pid, name]) => (
                            <SelectItem key={pid} value={pid}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">Минута</Label>
                    <Input type="number" min={1} max={120} value={evMinute} onChange={(e) => setEvMinute(e.target.value)} placeholder="45" className="bg-white" />
                  </div>
                </div>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={addEvent}>
                  Добавить событие
                </Button>
                <p className="text-xs text-zinc-400">
                  Гол засчитывается команде события; автогол — сопернику. Для выбора гола доступны только игроки «на поле» (заявка ± замены).
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="border-zinc-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Протокол · {data.events.length} событий</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.events.length === 0 && <p className="py-8 text-center text-sm text-zinc-400">Событий пока нет</p>}
              {data.events.map((e) => (
                <div key={e.id} className={`flex items-center gap-3 border-b border-zinc-100 px-4 py-2 text-sm ${e.teamId === m.homeTeam.id ? "" : "flex-row-reverse text-right"}`}>
                  <span className="w-9 shrink-0 font-mono text-xs text-zinc-400">{e.minute}&apos;</span>
                  <span className="flex shrink-0 items-center justify-center"><EventIcon type={e.type} /></span>
                  <span className="flex-1 truncate">
                    <span className="font-medium">{e.person.name}</span>
                    <span className="ml-2 text-xs text-zinc-400">{EVENT_LABELS[e.type]}</span>
                    {e.assist && <span className="ml-1 text-xs text-zinc-400">(ассист: {e.assist.name})</span>}
                  </span>
                  {!isLocked && (
                    <button onClick={() => deleteEvent(e.id)} className="shrink-0 rounded p-1 text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-500" title="Удалить">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* ---------- Завершение ---------- */}
      {tab === "finish" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-zinc-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Завершение матча</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-zinc-500">
                Итоговый счёт рассчитывается из событий протокола: <b>{m.homeTeam.name} {m.homeScore ?? 0} : {m.awayScore ?? 0} {m.awayTeam.name}</b>.
                После завершения: пересчёт таблицы, автоматические дисквалификации (КК и накопление ЖК), отсиживание банов.
              </p>
              {!isLocked ? (
                <>
                  {!m.referee && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">Назначьте главного судью — без него завершение запрещено.</p>}
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy || !m.referee} onClick={completeMatch}>
                    Завершить матч
                  </Button>
                </>
              ) : (
                <div className="space-y-2">
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Матч завершён</Badge>
                  {user.role === "SUPER_ADMIN" && (
                    <Button variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50" disabled={busy} onClick={resetMatch}>
                      <RotateCcw className="mr-1 h-4 w-4" /> Вернуть в работу (откат дисциплины)
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-amber-200">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-amber-700"><CardIcon kind="yellow" className="h-4 w-4" /> Техническое поражение (WO)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isLocked ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Причина</Label>
                    <Select value={woType} onValueChange={setWoType}>
                      <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="HOME">Неявка хозяев (0:{m.league.walkoverScore})</SelectItem>
                        <SelectItem value="AWAY">Неявка гостей ({m.league.walkoverScore}:0)</SelectItem>
                        <SelectItem value="BOTH">Обе неявки (0:0, обеим 0 очков)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Комментарий (в протокол)</Label>
                    <Textarea value={woNote} onChange={(e) => setWoNote(e.target.value)} rows={2} placeholder="Неявка команды на стадион, акт судьи..." />
                  </div>
                  <Button variant="outline" className="w-full border-amber-300 text-amber-700 hover:bg-amber-50" disabled={busy} onClick={assignWalkover}>
                    Оформить техпоражение
                  </Button>
                  <p className="text-xs text-zinc-400">События и составы WO-матча будут удалены; индивидуальная статистика не затрагивается.</p>
                </>
              ) : (
                m.status === "WALKOVER" ? (
                  <p className="text-sm text-amber-700">Уже оформлено: {WO_LABEL[m.walkoverType ?? ""]} {m.note ? `— ${m.note}` : ""}</p>
                ) : (
                  <p className="text-sm text-zinc-400">Матч уже завершён.</p>
                )
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

const WO_LABEL: Record<string, string> = {
  HOME: "неявка хозяев",
  AWAY: "неявка гостей",
  BOTH: "обе неявки / срыв",
};

function STATUS_SAFE(s: string): string {
  const map: Record<string, string> = { SCHEDULED: "запланирован", LIVE: "идёт", COMPLETED: "завершён", WALKOVER: "тех. поражение", POSTPONED: "перенесён" };
  return map[s] ?? s;
}
