"use client";

// CRUD матчей: создание (команды, дата МСК, стадион, бригада «+/−», тур),
// редактирование (в т.ч. безопасные поля завершённого: дата/стадион/тур/
// примечание/бригада), массовое выделение и удаление, переход в протокол.

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ClipboardPen, CalendarPlus, Flag, X, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost, useFetch, fmtDate } from "./hooks";
import type { MatchDTO, OverviewDTO } from "./types";
import { STATUS_LABELS } from "./types";
import { EmptyState, LoadingBlock, ScoreBox, StatusBadge } from "./ui-bits";
import { Field } from "./CrudPanels";
import { navigate } from "./router";
import { MATCH_OFFICIAL_ROLES } from "@/lib/roles";

interface AdminMatch extends MatchDTO {
  referee: { id: string; name: string } | null;
  officials: { id: string; role: string; person: { id: string; name: string } }[];
  eventsCount: number;
}

interface AdminTeam { id: string; name: string; club: { id: string; name: string } | null }
interface AdminStadium { id: string; name: string; city: string | null }
interface AdminPerson { id: string; name: string; isReferee: boolean; roles: string[] }

// МСК-конвертация для datetime-local
const toLocalInput = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 16);
const fromLocalInput = (v: string) => new Date(`${v}:00+03:00`).toISOString();

/** Кандидаты в бригаду: судейский корпус + врачи (по карточке) */
const isOfficialCandidate = (p: AdminPerson) =>
  p.isReferee || p.roles.some((r) => ["DOCTOR", "INSPECTOR", "DELEGATE"].includes(r));

interface OfficialRow { role: string; personId: string }

interface MatchFormState {
  id?: string;
  seasonId: string;
  isFriendly: boolean;
  homeTeamId: string;
  awayTeamId: string;
  kickoff: string;
  stadiumId: string;
  refereeId: string;
  round: string;
  note: string;
  status: string;
  isFinished: boolean;
  officials: OfficialRow[];
}

export function MatchesCrudPanel({ bump, version, overview, onOpenProtocol }: { bump: () => void; version: number; overview: OverviewDTO | null; onOpenProtocol: (matchId: string) => void }) {
  const [mode, setMode] = useState<"league" | "friendly">("league");
  const [leagueId, setLeagueId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [form, setForm] = useState<MatchFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const { data: teamsData } = useFetch<{ teams: AdminTeam[] }>(form ? "/api/admin/teams" : null);
  const { data: stadiumsData } = useFetch<{ stadiums: AdminStadium[] }>(form ? "/api/admin/stadiums" : null);
  const { data: personsData } = useFetch<{ persons: AdminPerson[] }>(form ? "/api/admin/persons" : null);

  const leagues = overview?.leagues ?? [];
  const league = leagues.find((l) => l.id === (leagueId || leagues[0]?.id));
  const seasons = league?.seasons ?? [];
  const leagueSeasonId = seasonId || seasons.find((s) => s.isCurrent)?.id || seasons[0]?.id || "";
  const effectiveSeasonId = mode === "friendly" ? "friendly" : leagueSeasonId;

  const { data, loading } = useFetch<{ matches: (AdminMatch & { isFriendly?: boolean })[] }>(effectiveSeasonId ? `/api/admin/matches?seasonId=${effectiveSeasonId}` : null, version);

  const matches = data?.matches ?? [];
  const teams = teamsData?.teams ?? [];
  const stadiums = stadiumsData?.stadiums ?? [];
  const officialsPool = useMemo(() => (personsData?.persons ?? []).filter(isOfficialCandidate), [personsData]);

  const allSelected = matches.length > 0 && matches.every((m) => selected.has(m.id));

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(matches.map((m) => m.id)));
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Удалить выбранные матчи (${selected.size})? Матчи с протоколом (события/составы/оценки) удалены не будут — они вернутся в список с пометкой.`)) return;
    setBulkBusy(true);
    const res = await apiPost<{ deleted: number; blocked: { id: string; label: string; reason: string }[] }>("/api/admin/matches", {
      action: "bulk-delete", ids: [...selected],
    });
    setBulkBusy(false);
    if (!res.ok) return toast.error(res.error);
    const blocked = res.data?.blocked ?? [];
    toast.success(`Удалено матчей: ${res.data?.deleted ?? 0}${blocked.length ? ` · пропущено с протоколом: ${blocked.length}` : ""}`);
    if (blocked.length > 0) {
      toast.info(`С протоколом (нужен Reset и очистка): ${blocked.slice(0, 3).map((b) => b.label).join("; ")}${blocked.length > 3 ? "…" : ""}`, { duration: 8000 });
    }
    setSelected(new Set());
    bump();
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const body = {
      seasonId: form.isFriendly ? null : form.seasonId,
      isFriendly: form.isFriendly,
      homeTeamId: form.homeTeamId,
      awayTeamId: form.awayTeamId,
      kickoff: fromLocalInput(form.kickoff),
      stadiumId: form.stadiumId || null,
      refereeId: form.refereeId || null,
      round: form.isFriendly ? null : form.round ? Number(form.round) : null,
      note: form.note || null,
      status: form.isFinished ? undefined : form.status || undefined,
      officials: form.officials.filter((o) => o.personId && o.role),
    };
    const res = await apiPost(form.id ? `/api/admin/matches/${form.id}` : "/api/admin/matches", body, form.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error, { duration: 7000 });
    toast.success(form.id ? "Матч обновлён" : "Матч создан");
    setForm(null);
    bump();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold"><CalendarPlus className="h-4 w-4 text-emerald-600" /> Матчи</h3>
          <p className="text-xs text-zinc-400">Чемпионат: лига → сезон → матч. Товарищеские — без лиги и сезона: без таблиц, статистики и дисквалификаций</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-zinc-100 p-0.5">
            {(["league", "friendly"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setSelected(new Set()); }} className={cn("rounded-md px-3 py-1 text-xs font-semibold", mode === m ? "bg-white shadow-sm text-emerald-700" : "text-zinc-500")}>
                {m === "league" ? "Чемпионат" : "Товарищеские"}
              </button>
            ))}
          </div>
          {mode === "league" && (
            <>
              <select
                value={leagueId || leagues[0]?.id || ""}
                onChange={(e) => { setLeagueId(e.target.value); setSeasonId(""); }}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm"
                aria-label="Лига"
              >
                {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select
                value={leagueSeasonId}
                onChange={(e) => setSeasonId(e.target.value)}
                className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm"
                aria-label="Сезон"
              >
                {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? " (тек.)" : ""}</option>)}
              </select>
            </>
          )}
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={mode === "league" && !leagueSeasonId}
            onClick={() => setForm({
              seasonId: leagueSeasonId, isFriendly: mode === "friendly", homeTeamId: "", awayTeamId: "",
              kickoff: toLocalInput(new Date().toISOString()), stadiumId: "", refereeId: "", round: "", note: "", status: "SCHEDULED",
              isFinished: false, officials: [],
            })}
          >
            <Plus className="mr-1 h-4 w-4" /> Матч
          </Button>
        </div>
      </div>

      {mode === "league" && !leagueSeasonId && (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-4 text-xs text-amber-700">
          Для чемпионатного матча нужны <b>лига и сезон</b> (раздел «Лиги и сезоны»). У лиги нет сезона — добавьте его в карточке лиги.
        </div>
      )}
      {mode === "friendly" && matches.length === 0 && !loading && (
        <EmptyState title="Товарищеских матчей нет" hint="Создайте матч: команды, дата, стадион и судья — без лиги, сезона и тура" />
      )}
      {loading && !data && effectiveSeasonId && <LoadingBlock />}
      {effectiveSeasonId && mode === "league" && matches.length === 0 && !loading && <EmptyState title="Матчей нет" hint="Создайте матч или сгенерируйте расписание (раздел «Расписание»)" />}

      {/* ---------- Панель массовых действий ---------- */}
      {matches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
          <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-emerald-700">
            {allSelected ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-zinc-300" />}
            {allSelected ? "Снять выделение" : "Выбрать все"}
          </button>
          <span className="text-xs text-zinc-300">·</span>
          <span className="text-xs text-zinc-400">{matches.length} матчей</span>
          {selected.size > 0 && (
            <>
              <span className="text-xs font-semibold text-emerald-700">выбрано: {selected.size}</span>
              <Button size="sm" variant="outline" className="ml-auto h-7 border-red-200 px-2 text-xs text-red-600 hover:bg-red-50" disabled={bulkBusy} onClick={bulkDelete}>
                <Trash2 className="mr-1 h-3 w-3" /> Удалить выбранные ({selected.size})
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-zinc-400" onClick={() => setSelected(new Set())}>Отменить</Button>
            </>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {matches.map((m) => {
          const isSel = selected.has(m.id);
          const brigade = m.officials.filter((o) => o.role !== "REFEREE");
          return (
            <div key={m.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-50 px-4 py-2.5 last:border-b-0 transition-colors", isSel && "bg-emerald-50/50")}>
              <button
                onClick={() => toggleSelect(m.id)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                aria-label={isSel ? "Снять выделение" : "Выбрать матч"}
              >
                {isSel ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-zinc-300 hover:text-zinc-400" />}
              </button>
              {m.isFriendly ? (
                <Badge variant="outline" className="border-zinc-200 text-zinc-400">друж.</Badge>
              ) : (
                <span className="w-14 shrink-0 font-mono text-xs text-zinc-400">{m.round ? `${m.round} тур` : "—"}</span>
              )}
              <span className="w-36 shrink-0 text-xs text-zinc-400">{fmtDate(m.kickoff)}</span>
              <span className="flex min-w-[200px] flex-1 items-center gap-2 text-sm font-medium text-zinc-700">
                {m.homeTeam.name}
                <ScoreBox score={m.homeScore !== null ? { home: m.homeScore, away: m.awayScore ?? 0 } : null} status={m.status} />
                {m.awayTeam.name}
              </span>
              <StatusBadge status={m.status} />
              {m.referee ? (
                <Badge variant="outline" className="font-normal text-zinc-500"><Flag className="mr-1 h-3 w-3" />{m.referee.name}</Badge>
              ) : (
                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-500">судья не назначен</Badge>
              )}
              {brigade.length > 0 && (
                <Badge variant="outline" className="font-normal text-zinc-400" title={brigade.map((o) => `${o.person.name} — ${MATCH_OFFICIAL_ROLES.find((r) => r.code === o.role)?.name ?? o.role}`).join("\n")}>
                  +{brigade.length} в бригаде
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setForm({
                  id: m.id, seasonId: m.isFriendly ? "" : effectiveSeasonId, isFriendly: !!m.isFriendly,
                  homeTeamId: m.homeTeam.id, awayTeamId: m.awayTeam.id,
                  kickoff: toLocalInput(m.kickoff),
                  stadiumId: m.stadium?.id ?? "", refereeId: m.referee?.id ?? "",
                  round: m.round ? String(m.round) : "", note: m.note ?? "",
                  status: m.status === "POSTPONED" ? "POSTPONED" : "SCHEDULED",
                  isFinished: m.status === "COMPLETED" || m.status === "WALKOVER" || m.status === "LIVE",
                  officials: m.officials.filter((o) => o.role !== "REFEREE").map((o) => ({ role: o.role, personId: o.person.id })),
                })} aria-label="Редактировать">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => onOpenProtocol(m.id)} aria-label="Протокол">
                  <ClipboardPen className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {matches.length > 0 && (
        <p className="text-xs text-zinc-400">
          Статус «Завершён» ставится протоколом (составы → события → «Завершить»), а не вручную · дату, стадион, тур и бригаду завершённого матча можно править без Reset
        </p>
      )}

      {/* ---------- Диалог матча ---------- */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? "Редактировать матч" : "Новый матч"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Хозяева">
                <select value={form.homeTeamId} disabled={form.isFinished} onChange={(e) => setForm({ ...form, homeTeamId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm disabled:bg-zinc-50 disabled:text-zinc-400">
                  <option value="">— выберите —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Гости">
                <select value={form.awayTeamId} disabled={form.isFinished} onChange={(e) => setForm({ ...form, awayTeamId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm disabled:bg-zinc-50 disabled:text-zinc-400">
                  <option value="">— выберите —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Дата и время (МСК)"><Input type="datetime-local" value={form.kickoff} onChange={(e) => setForm({ ...form, kickoff: e.target.value })} /></Field>
              <Field label="Тур" hint={form.isFriendly ? "У товарищеских нет тура" : undefined}><Input type="number" disabled={form.isFriendly} value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} placeholder="4" /></Field>
              <Field label="Стадион">
                <select value={form.stadiumId} onChange={(e) => setForm({ ...form, stadiumId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— не указан —</option>
                  {stadiums.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? `, ${s.city}` : ""}</option>)}
                </select>
              </Field>
              <Field label="Главный судья" hint="нужен для завершения матча">
                <select value={form.refereeId} onChange={(e) => setForm({ ...form, refereeId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— не назначен —</option>
                  {officialsPool.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
              {form.id && !form.isFinished && (
                <Field label="Статус">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                    <option value="SCHEDULED">Запланирован</option>
                    <option value="POSTPONED">Перенесён</option>
                  </select>
                </Field>
              )}
              {form.id && form.isFinished && (
                <div className="col-span-2">
                  <Field label="Статус">
                    <Input disabled value={STATUS_LABELS[form.status] ?? "Управляется протоколом"} className="bg-zinc-50 text-zinc-400" />
                  </Field>
                </div>
              )}

              {/* ---------- Бригада: динамические строки «+/−» ---------- */}
              <div className="col-span-2 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Бригада матча</p>
                  <Button
                    type="button" size="sm" variant="outline" className="h-7 border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50"
                    onClick={() => setForm({ ...form, officials: [...form.officials, { role: "ASSISTANT_REFEREE", personId: "" }] })}
                  >
                    <Plus className="mr-0.5 h-3.5 w-3.5" /> Добавить
                  </Button>
                </div>
                {form.officials.length === 0 && (
                  <p className="text-xs text-zinc-400">
                    По умолчанию — пусто (детский матч: достаточно главного судьи). «+» — помощник судьи, резервный, VAR, инспектор, делегат или врач; «✕» — убрать строку.
                  </p>
                )}
                {form.officials.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={row.role}
                      onChange={(e) => {
                        const next = [...form.officials];
                        next[i] = { ...next[i], role: e.target.value };
                        setForm({ ...form, officials: next });
                      }}
                      className="h-8 w-44 rounded-md border border-zinc-200 bg-white px-2 text-xs"
                      aria-label="Роль в бригаде"
                    >
                      {MATCH_OFFICIAL_ROLES.filter((r) => r.code !== "REFEREE").map((r) => (
                        <option key={r.code} value={r.code}>{r.name}</option>
                      ))}
                    </select>
                    <select
                      value={row.personId}
                      onChange={(e) => {
                        const next = [...form.officials];
                        next[i] = { ...next[i], personId: e.target.value };
                        setForm({ ...form, officials: next });
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 text-xs"
                      aria-label="Персона"
                    >
                      <option value="">— выбрать —</option>
                      {officialsPool.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, officials: form.officials.filter((_, j) => j !== i) })}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500"
                      aria-label="Убрать строку"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="col-span-2">
                <Field label="Примечание"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} placeholder="Причина переноса, организационная информация..." /></Field>
              </div>

              {/* подсказка для прошедшей даты: как ввести сыгранный матч */}
              {!form.id && form.kickoff && new Date(form.kickoff).getTime() < Date.now() && (
                <div className="col-span-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-700">
                  Дата в прошлом — вводите <b>уже сыгранный</b> матч? Создайте его, затем нажмите иконку протокола 📋 в списке:
                  составы → события → «Завершить». Статус «Завершён» и счёт выставятся автоматически.
                </div>
              )}
              {form.isFinished && (
                <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
                  Матч сыгран/закрыт: команды и статус не меняются (события привязаны к составам). Дата, стадион, тур, примечание и бригада — правятся свободно.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            <Button disabled={saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">{form?.id ? "Сохранить" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
