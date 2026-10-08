"use client";

// ============================================================
// Вкладка «Составы» редактора протокола (v1.0.28).
// Вынесена из ProtocolEditor (Этап 3 — разборка гигантов).
//
// Формирование заявки на матч в порядке любительской практики:
//   1) СТАРТОВЫЙ состав — первые отмеченные игроки (до лимита
//      формата: 11/8/6/5), им назначаются НОМЕРА;
//   2) затем ЗАПАСНЫЕ (когда старт заполнен, отметки идут в запас);
//   3) затем ШТАБ и руководство (тренер/администратор/президент из
//      заявки, роль Registration != PLAYER) — без номеров и старта.
//
// Номера: заявка на сезон у любителей обычно БЕЗ номеров — номер
// живёт в протоколе матча. Поле предзаполняется последним номером
// игрока в этой команде (прошлые матчи) или номером из сезонной
// заявки. Одинаковые номера в одной команде — ЗАПРЕЩЕНЫ:
// подсветка красным + блокировка сохранения (и валидация на API).
// ============================================================

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Ban, CalendarClock, CheckCircle2, Hash, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost } from "./hooks";
import { STARTER_LIMITS, REGISTRATION_ROLE_LABELS } from "@/lib/labels";
import type { SessionUserDTO } from "./types";

export interface EligiblePlayer {
  personId: string;
  name: string;
  position: string | null;
  /** № из сезонной заявки (у любителей обычно пуст) */
  number: number | null;
  /** роль в заявке: PLAYER — игрок, остальные — штаб/руководство */
  regRole: string;
  /** № из последнего матча команды до этого — предзаполнение */
  lastNumber: number | null;
  /** v1.0.46: false — заявка началась ПОЗЖЕ матча (ввод протокола
   *  задним числом): игрок виден с пометкой, дата заявки правится
   *  подтверждением при подаче состава */
  registrationOk: boolean;
  /** id заявки — для переноса даты из протокола */
  registrationId: string | null;
  /** дата начала заявки (ISO) — для подписи */
  registrationStart: string | null;
  suspension: { matchesRemaining: number; isLifetime: boolean; source: string } | null;
}

export interface ProtocolData {
  match: {
    id: string; round: number | null; kickoff: string; status: string; walkoverType: string | null;
    homeScore: number | null; awayScore: number | null; note: string | null;
    isFriendly: boolean; protocolUrl: string | null; protocolFileName: string | null;
    homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
    referee: { id: string; name: string } | null;
    season: { id: string; name: string } | null;
    league: { id: string; name: string; walkoverScore: number; format: string };
  };
  eligible: { home: EligiblePlayer[]; away: EligiblePlayer[] };
  events: { id: string; minute: number; stoppage: number | null; type: string; teamId: string; person: { id: string; name: string }; assist: { id: string; name: string } | null }[];
  lineup: { teamId: string; personId: string; isStarter: boolean; isCaptain: boolean; number: number | null }[];
  officials: { id: string; role: string; person: { id: string; name: string } }[];
  referees: { id: string; name: string }[];
}

interface Props {
  matchId: string;
  data: ProtocolData;
  onReload: () => void;
}

type Side = "home" | "away";

/** Оверрайды поверх состояния из БД (derive-паттерн): sel — кто в
 *  протоколе; starters — кто из них начинает; numbers — явные правки № */
interface Overrides {
  home?: Set<string>;
  away?: Set<string>;
  homeStarters?: Set<string>;
  awayStarters?: Set<string>;
  homeNumbers?: Record<string, number | null>;
  awayNumbers?: Record<string, number | null>;
  /** v1.0.34 · капитан: personId или null (явный сброс) — один на команду */
  homeCaptain?: string | null;
  awayCaptain?: string | null;
}

export default function ProtocolLineupTab({ matchId, data, onReload }: Props) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [busy, setBusy] = useState(false);
  const limit = STARTER_LIMITS[data.match.league?.format ?? "FRIENDLY"] ?? 11;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(["home", "away"] as const).map((side) => (
        <TeamLineupCard
          key={side}
          matchId={matchId}
          data={data}
          side={side}
          limit={limit}
          overrides={overrides}
          setOverrides={setOverrides}
          busy={busy}
          setBusy={setBusy}
          onReload={onReload}
        />
      ))}
    </div>
  );
}

// ================= Карточка одной команды =================

function TeamLineupCard({ matchId, data, side, limit, overrides, setOverrides, busy, setBusy, onReload }: {
  matchId: string;
  data: ProtocolData;
  side: Side;
  limit: number;
  overrides: Overrides;
  setOverrides: React.Dispatch<React.SetStateAction<Overrides>>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onReload: () => void;
}) {
  const m = data.match;
  const team = side === "home" ? m.homeTeam : m.awayTeam;
  const eligibleSide = data.eligible[side];
  // v1.0.46 · подтверждение переноса даты поздних заявок
  const [lateConfirm, setLateConfirm] = useState(false);
  const players = useMemo(
    () => eligibleSide.filter((p) => p.regRole === "PLAYER"),
    [eligibleSide]
  );
  const staff = useMemo(
    () => eligibleSide.filter((p) => p.regRole !== "PLAYER"),
    [eligibleSide]
  );

  // сохранённое состояние из БД
  const saved = useMemo(() => data.lineup.filter((l) => l.teamId === team.id), [data, team.id]);
  const savedSet = useMemo(() => new Set(saved.map((l) => l.personId)), [saved]);
  const savedStarters = useMemo(() => new Set(saved.filter((l) => l.isStarter).map((l) => l.personId)), [saved]);
  const savedNumbers = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const l of saved) map[l.personId] = l.number;
    return map;
  }, [saved]);
  /** v1.0.34: капитан из БД (первая запись с isCaptain) */
  const savedCaptain = useMemo(() => saved.find((l) => l.isCaptain)?.personId ?? null, [saved]);

  // текущее состояние = БД + оверрайды
  const sel = overrides[side] ?? savedSet;
  const captainKey = `${side}Captain` as "homeCaptain" | "awayCaptain";
  const captain = overrides[captainKey] !== undefined ? overrides[captainKey] : savedCaptain;
  const starters = overrides[`${side}Starters` as const] ?? savedStarters;
  const numberEdits = overrides[`${side}Numbers` as const];

  /** эффективный номер: правка → сохранённый → последний в команде → заявка */
  const numberValue = (pid: string): number | null => {
    if (numberEdits && pid in numberEdits) return numberEdits[pid];
    if (pid in savedNumbers && savedNumbers[pid] != null) return savedNumbers[pid];
    const p = eligibleSide.find((x) => x.personId === pid);
    return p?.lastNumber ?? p?.number ?? null;
  };

  const selectedPlayers = players.filter((p) => sel.has(p.personId));
  const selectedStaff = staff.filter((p) => sel.has(p.personId));
  const starterCount = selectedPlayers.filter((p) => starters.has(p.personId)).length;

  /** v1.0.46 · поздние заявки в составе: заявка началась позже матча —
   *  при подаче состава предложим перенести дату заявки на дату матча */
  const lateInLineup = selectedPlayers.filter((p) => !p.registrationOk);
  const lateStaff = selectedStaff.filter((p) => !p.registrationOk);
  const lateIds = new Set([...lateInLineup, ...lateStaff].map((p) => p.personId));

  // дубли номеров среди игроков в протоколе (дёшево: десятки строк — без memo)
  const dupNumbers = (() => {
    const byNum = new Map<number, string[]>();
    for (const p of selectedPlayers) {
      const n = numberValue(p.personId);
      if (n == null) continue;
      const names = byNum.get(n) ?? [];
      names.push(p.name);
      byNum.set(n, names);
    }
    return [...byNum.entries()].filter(([, names]) => names.length > 1);
  })();
  const hasDup = dupNumbers.length > 0;

  // dirty: состав/старт/номера/капитан отличаются от сохранённых
  const dirty = (() => {
    const sameSet = sel.size === savedSet.size && [...sel].every((id) => savedSet.has(id));
    const sameStart = starters.size === savedStarters.size && [...starters].every((id) => savedStarters.has(id));
    const sameNums = selectedPlayers.every((p) => (numberValue(p.personId) ?? null) === (savedNumbers[p.personId] ?? null));
    const sameCap = (captain ?? null) === (savedCaptain ?? null);
    return !sameSet || !sameStart || !sameNums || !sameCap;
  })();

  const setNumEdit = (pid: string, value: number | null) => {
    setOverrides((s) => ({
      ...s,
      [`${side}Numbers`]: { ...(s[`${side}Numbers` as const] ?? {}), [pid]: value },
    }));
  };

  /** отметить/снять игрока: первые N — старт, дальше — запас */
  const togglePlayer = (p: EligiblePlayer) => {
    if (p.suspension) {
      toast.error(`У игрока ${p.name} активная дисквалификация! Он не может быть заявлен на матч.`, { duration: 6000 });
      return;
    }
    // решение о тосте — ДО апдейтера (апдейтер должен быть чистым)
    const willAdd = !sel.has(p.personId);
    if (willAdd && starters.size >= limit) {
      toast.info(`Старт заполнен (${limit}) — ${p.name} в запасе`, { duration: 4000 });
    }
    setOverrides((s) => {
      const selKey = side as "home" | "away";
      const startKey = `${side}Starters` as "homeStarters" | "awayStarters";
      const nextSel = new Set(s[selKey] ?? sel);
      const nextStart = new Set(s[startKey] ?? starters);
      if (nextSel.has(p.personId)) {
        nextSel.delete(p.personId);
        nextStart.delete(p.personId);
      } else {
        nextSel.add(p.personId);
        if (nextStart.size < limit) nextStart.add(p.personId); // старт ещё не заполнен
      }
      return { ...s, [selKey]: nextSel, [startKey]: nextStart };
    });
  };

  /** старт ↔ запас (только для игроков в протоколе) */
  const toggleStarter = (p: EligiblePlayer) => {
    const startKey = `${side}Starters` as "homeStarters" | "awayStarters";
    // проверка лимита — ДО апдейтера (чистый апдейтер без тостов)
    if (!starters.has(p.personId) && starters.size >= limit) {
      toast.error(`Стартовый состав уже заполнен: ${limit} игроков. Сначала снимите другого.`, { duration: 5000 });
      return;
    }
    setOverrides((s) => {
      const next = new Set(s[startKey] ?? starters);
      if (next.has(p.personId)) next.delete(p.personId);
      else next.add(p.personId);
      return { ...s, [startKey]: next };
    });
  };

  /** v1.0.52 · капитан: ОДИН на команду — если капитан уже назначен,
   *  другого отметить НЕЛЬЗЯ (фидбек юзера: «если его пометили, то
   *  больше уже нельзя»). Смена капитана — два явных клика: сначала
   *  снять прежнего (повторный клик по его «К»), затем назначить нового.
   *  Повторный клик по действующему капитану — снимает пометку. */
  const toggleCaptain = (p: EligiblePlayer) => {
    if (p.regRole !== "PLAYER") {
      toast.error("Капитан — игрок, а не представитель штаба", { duration: 4000 });
      return;
    }
    const current = captain;
    if (current && current !== p.personId) {
      const currentName = eligibleSide.find((x) => x.personId === current)?.name ?? "другой игрок";
      toast.error(
        `В команде уже есть капитан — ${currentName}. Сначала снимите его (повторный клик по его кнопке «К»), затем назначьте нового.`,
        { duration: 6000 }
      );
      return;
    }
    setOverrides((s) => {
      const key = `${side}Captain` as "homeCaptain" | "awayCaptain";
      return { ...s, [key]: current === p.personId ? null : p.personId };
    });
  };

  /** штат: в протокол без старта и номера */
  const toggleStaff = (p: EligiblePlayer) => {
    if (p.suspension) {
      toast.error(`У ${p.name} активная дисквалификация.`, { duration: 6000 });
      return;
    }
    setOverrides((s) => {
      const selKey = side as "home" | "away";
      const nextSel = new Set(s[selKey] ?? sel);
      if (nextSel.has(p.personId)) nextSel.delete(p.personId);
      else nextSel.add(p.personId);
      return { ...s, [selKey]: nextSel };
    });
  };

  const selectAllPlayers = () => {
    setOverrides((s) => {
      const selKey = side as "home" | "away";
      const startKey = `${side}Starters` as "homeStarters" | "awayStarters";
      const nextSel = new Set<string>();
      for (const p of players) if (!p.suspension) nextSel.add(p.personId);
      // первые `limit` по списку — старт (список отсортирован по фамилии),
      // остальное — запас; поправьте переключателем при необходимости
      const nextStart = new Set<string>();
      let i = 0;
      for (const p of players) {
        if (p.suspension) continue;
        if (i < limit) nextStart.add(p.personId);
        i++;
      }
      return { ...s, [selKey]: nextSel, [startKey]: nextStart };
    });
    toast.info(`Игроки в протоколе; в старте — первые ${limit} по списку. Проверьте и поправьте.`, { duration: 5000 });
  };

  const clearAll = () => {
    setOverrides((s) => ({
      ...s,
      [side]: new Set<string>(),
      [`${side}Starters` as const]: new Set<string>(),
      [`${side}Numbers` as const]: {},
      [`${side}Captain` as const]: null,
    }));
  };

  async function submitLineup(overrideLate = false) {
    if (hasDup) {
      const [num, names] = dupNumbers[0];
      toast.error(`Одинаковые номера в одной команде запрещены: №${num} — ${names.join(", ")}`, { duration: 6000 });
      return;
    }
    if (starterCount > limit) {
      toast.error(`Стартовый состав: ${starterCount} из ${limit}. Снимите лишних игроков со старта.`, { duration: 6000 });
      return;
    }
    // v1.0.46 · поздние заявки: сначала подтверждение — переносим дату
    // заявки на дату матча (явное действие с аудитом), потом подаём состав
    const late = [...lateInLineup, ...lateStaff];
    if (late.length > 0 && !overrideLate) {
      setLateConfirm(true);
      return;
    }
    setBusy(true);
    if (overrideLate && late.length > 0) {
      for (const p of late) {
        if (!p.registrationId) continue;
        const res = await apiPost(`/api/admin/registrations/${p.registrationId}`, { startDate: m.kickoff }, "PATCH");
        if (!res.ok) {
          setBusy(false);
          toast.error(`Не удалось перенести дату заявки ${p.name}: ${res.error}`, { duration: 8000 });
          return;
        }
      }
      toast.info(`Дата заявки перенесена на дату матча: ${late.map((p) => p.name).join(", ")}`, { duration: 6000 });
    }
    const personIds = [...sel];
    const starterIds = [...starters].filter((pid) => sel.has(pid) && !staff.some((x) => x.personId === pid));
    const numbers = selectedPlayers
      .map((p) => ({ personId: p.personId, number: numberValue(p.personId) }))
      .filter((n) => n.number != null);
    const res = await apiPost(`/api/admin/matches/${matchId}`, {
      action: "lineup",
      teamId: team.id,
      personIds,
      starters: starterIds,
      numbers,
      captainId: captain && sel.has(captain) ? captain : null,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error, { duration: 8000 });
      return;
    }
    toast.success(
      `Состав ${team.name} подан: старт ${starterIds.length}, запас ${personIds.length - starterIds.length - selectedStaff.length}, штат ${selectedStaff.length}`
    );
    setLateConfirm(false);
    onReload();
  }

  const submitted = savedSet.size > 0;

  return (
    <Card className={cn("border-zinc-200", !dirty && submitted ? "border-emerald-300" : dirty ? "border-amber-300" : "")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-emerald-600" /> {team.name}
        </CardTitle>
        {dirty ? (
          <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">есть изменения — не сохранено</Badge>
        ) : submitted ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="mr-1 h-3 w-3" /> состав подан · {savedSet.size}
          </Badge>
        ) : (
          <Badge variant="secondary">не подан</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {/* счётчики по группам */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 border-zinc-200 px-2 text-xs" onClick={selectAllPlayers}>
            <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" /> Все игроки ({players.filter((p) => !p.suspension).length})
          </Button>
          <Button
            size="sm" variant="outline" className="h-7 border-zinc-200 px-2 text-xs"
            disabled={sel.size === 0}
            onClick={clearAll}
          >
            <X className="mr-1 h-3 w-3 text-zinc-400" /> Снять
          </Button>
          <span className={cn("ml-auto text-xs font-semibold", starterCount > limit ? "text-red-600" : "text-zinc-400")}>
            старт {starterCount}/{limit} · запас {selectedPlayers.length - starterCount} · штат {selectedStaff.length}
          </span>
        </div>

        {/* дубли номеров: предупреждение до отправки */}
        {hasDup && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            Одинаковые номера в одной команде запрещены:
            {dupNumbers.map(([num, names]) => (
              <span key={num}> №{num} — {names.join(", ")};</span>
            ))}{" "}
            Сохранение заблокировано.
          </div>
        )}
        {starterCount > limit && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Стартовый состав превышает лимит формата ({limit}): снимите лишних игроков со старта.
          </div>
        )}

        <p className="text-[11px] leading-snug text-zinc-400">
          Отметьте игроков — первые {limit} попадают в старт, остальные в запас. Номер вводится на матч:
          подставляется последний номер игрока в команде (или из заявки), можно изменить. Кнопка «К» —
          капитан (один на команду; смена — сначала снять прежнего повторным кликом, затем назначить нового).
          Затем добавьте тренера и руководство — без номеров.
        </p>

        {/* v1.0.46 · откуда берётся список: заявки сезона на дату матча */}
        <p className="text-[11px] leading-snug text-zinc-400">
          {m.season
            ? <>В списке — игроки с действующей заявкой за команду в сезоне «{m.season.name}». Нет нужного игрока? Добавьте его в заявку: карточка команды → «В заявку».</>
            : <>Товарищеский матч: в списке — последние действующие заявки команды (любой сезон).</>}
          {players.filter((p) => !p.registrationOk).length > 0 && (
            <span className="mt-0.5 block text-amber-600">
              {players.filter((p) => !p.registrationOk).length} заявл. после даты матча — видны с пометкой
              <CalendarClock className="ml-0.5 inline h-3 w-3" />; при подаче состава подтвердите перенос даты заявки.
            </span>
          )}
        </p>

        <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {/* ---------- Игроки ---------- */}
          {players.map((p) => {
            const isSelected = sel.has(p.personId);
            const suspended = !!p.suspension;
            const isStarter = isSelected && starters.has(p.personId);
            const num = numberValue(p.personId);
            const numStr = num == null ? "" : String(num);
            const inDup = hasDup && isSelected && num != null && dupNumbers.some(([n]) => n === num);
            return (
              <div
                key={p.personId}
                className={cn(
                  "s21-row-wrap flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
                  suspended
                    ? "border-red-200 bg-red-50 opacity-80"
                    : isSelected
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                )}
              >
                <button
                  onClick={() => togglePlayer(p)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  aria-label={isSelected ? `Убрать ${p.name} из протокола` : `Добавить ${p.name} в протокол`}
                >
                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", isSelected && !suspended ? "border-emerald-600 bg-emerald-600" : "border-zinc-300")}>
                    {isSelected && !suspended && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                  </span>
                  <span className="flex-1 truncate font-medium">{p.name}</span>
                  {p.position && <span className="shrink-0 text-xs text-zinc-400">{p.position}</span>}
                  {/* v1.0.46 · поздняя заявка: видно, почему игрок «не заявлен на дату» */}
                  {!p.registrationOk && (
                    <span
                      className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-600"
                      title={`Заявка с ${p.registrationStart ? new Date(p.registrationStart).toLocaleDateString("ru-RU") : "?"} — позже матча ${new Date(m.kickoff).toLocaleDateString("ru-RU")}. Подав состав, подтвердите перенос даты заявки.`}
                    >
                      <CalendarClock className="h-3 w-3" /> заявлен {p.registrationStart ? new Date(p.registrationStart).toLocaleDateString("ru-RU") : "позже матча"}
                    </span>
                  )}
                  {p.suspension && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-red-600">
                      <Ban className="h-3 w-3" />
                      {p.suspension.isLifetime ? "пожизненно" : `бан ${p.suspension.matchesRemaining} матч.`}
                    </span>
                  )}
                </button>

                {/* номер на матч: только у игроков в протоколе */}
                {isSelected && !suspended ? (
                  <span className={cn("flex shrink-0 items-center gap-1", inDup && "rounded-md ring-2 ring-red-400 px-1")}>
                    <Hash className="h-3 w-3 text-zinc-300" aria-hidden />
                    <Input
                      type="number" min={1} max={99}
                      value={numStr}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNumEdit(p.personId, v === "" ? null : Math.max(1, Math.min(99, Number(v))));
                      }}
                      placeholder="—"
                      title="Номер на матч: подставлен последний номер игрока в команде"
                      className="h-7 w-14 border-zinc-200 bg-white px-1.5 text-center font-mono text-xs"
                    />
                  </span>
                ) : (
                  !suspended && <span className="w-[76px] shrink-0" />
                )}

                {isSelected && !suspended && (
                  <button
                    onClick={() => toggleStarter(p)}
                    className={cn(
                      "shrink-0 rounded-md px-2 py-1 text-[11px] font-bold transition-colors",
                      isStarter
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    )}
                    title={isStarter ? "Перевести в запасные" : "Перевести в стартовые"}
                  >
                    {isStarter ? "Старт" : "Запас"}
                  </button>
                )}
                {isSelected && !suspended && p.regRole === "PLAYER" && (
                  <button
                    onClick={() => toggleCaptain(p)}
                    className={cn(
                      "shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors",
                      captain === p.personId
                        ? "border-gold/60 bg-gold/15 text-amber-600"
                        : captain
                          ? "border-zinc-200 bg-white text-zinc-300" // v1.0.52: капитан уже есть — кнопки приглушены
                          : "border-zinc-200 bg-white text-zinc-400 hover:border-amber-300 hover:text-amber-600"
                    )}
                    title={
                      captain === p.personId
                        ? "Снять капитана (клик повторно)"
                        : captain
                          ? `Капитан уже назначен — сначала снимите его (клик по его «К»)`
                          : "Назначить капитаном этого матча"
                    }
                    aria-pressed={captain === p.personId}
                  >
                    К
                  </button>
                )}
              </div>
            );
          })}

          {/* ---------- Штаб и руководство ---------- */}
          {staff.length > 0 && (
            <>
              <p className="px-1 pb-0.5 pt-3 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                Штаб и руководство · из заявки
              </p>
              {staff.map((p) => {
                const isSelected = sel.has(p.personId);
                const suspended = !!p.suspension;
                return (
                  <div
                    key={p.personId}
                    className={cn(
                      "s21-row-wrap flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
                      suspended
                        ? "border-red-200 bg-red-50 opacity-80"
                        : isSelected
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-zinc-200 bg-white hover:border-zinc-300"
                    )}
                  >
                    <button
                      onClick={() => toggleStaff(p)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-label={isSelected ? `Убрать ${p.name} из протокола` : `Добавить ${p.name} в протокол`}
                    >
                      <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", isSelected && !suspended ? "border-emerald-600 bg-emerald-600" : "border-zinc-300")}>
                        {isSelected && !suspended && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                      </span>
                      <span className="flex-1 truncate font-medium">{p.name}</span>
                      {!p.registrationOk && (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-600" title="Заявка началась позже матча — при подаче подтвердите перенос даты">
                          <CalendarClock className="h-3 w-3" />
                        </span>
                      )}
                      {p.suspension && (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-red-600">
                          <Ban className="h-3 w-3" />
                          {p.suspension.isLifetime ? "пожизненно" : `бан ${p.suspension.matchesRemaining} матч.`}
                        </span>
                      )}
                    </button>
                    <Badge variant="outline" className="shrink-0 border-zinc-200 font-normal text-zinc-500">
                      {REGISTRATION_ROLE_LABELS[p.regRole] ?? p.regRole}
                    </Badge>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <Button
          size="sm"
          className={cn("w-full", dirty ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700")}
          disabled={busy || selectedPlayers.length + selectedStaff.length === 0 || hasDup}
          onClick={() => submitLineup()}
        >
          {dirty ? "Сохранить состав" : "Подать состав повторно"} ({selectedPlayers.length + selectedStaff.length})
          {lateInLineup.length + lateStaff.length > 0 ? ` · заявка позже матча: ${lateInLineup.length + lateStaff.length}` : ""}
        </Button>

        {/* v1.0.46 · подтверждение: поздние заявки → переносим дату на матч */}
        <Dialog open={lateConfirm} onOpenChange={(o) => !o && setLateConfirm(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-600" /> Заявка позже даты матча
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm leading-relaxed text-zinc-600">
              {[...lateInLineup, ...lateStaff].map((p) => (
                <span key={p.personId} className="block">
                  <b>{p.name}</b> — заявка с {p.registrationStart ? new Date(p.registrationStart).toLocaleDateString("ru-RU") : "?"},
                  матч — {new Date(m.kickoff).toLocaleDateString("ru-RU")}.
                </span>
              ))}
              По регламенту игрок должен быть заявлен на дату матча. Перенести дату начала заявки на дату матча
              и подать состав? Действие попадёт в журнал аудита.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLateConfirm(false)}>Отмена</Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                disabled={busy}
                onClick={() => { setLateConfirm(false); void submitLineup(true); }}
              >
                {busy ? "Сохранение…" : "Перенести дату и подать"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
