"use client";

// CRUD матчей: создание (команды, дата МСК, стадион, судья, тур), редактирование,
// удаление (без протокола), переход в редактор протокола.

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ClipboardPen, CalendarPlus, Flag } from "lucide-react";
import { apiPost, useFetch, fmtDate } from "./hooks";
import type { MatchDTO, OverviewDTO } from "./types";
import { STATUS_LABELS } from "./types";
import { EmptyState, LoadingBlock, ScoreBox, StatusBadge } from "./ui-bits";
import { Field, DeleteBtn } from "./CrudPanels";
import { navigate } from "./router";

interface AdminMatch extends MatchDTO {
  referee: { id: string; name: string } | null;
  eventsCount: number;
}

interface AdminTeam { id: string; name: string; club: { id: string; name: string } | null }
interface AdminStadium { id: string; name: string; city: string | null }
interface AdminPerson { id: string; name: string; isReferee: boolean }

// МСК-конвертация для datetime-local
const toLocalInput = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 16);
const fromLocalInput = (v: string) => new Date(`${v}:00+03:00`).toISOString();

interface MatchFormState {
  id?: string;
  seasonId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoff: string;
  stadiumId: string;
  refereeId: string;
  round: string;
  note: string;
  status: string;
}

export function MatchesCrudPanel({ bump, version, overview, onOpenProtocol }: { bump: () => void; version: number; overview: OverviewDTO | null; onOpenProtocol: (matchId: string) => void }) {
  const [leagueId, setLeagueId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [form, setForm] = useState<MatchFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: teamsData } = useFetch<{ teams: AdminTeam[] }>(form ? "/api/admin/teams" : null);
  const { data: stadiumsData } = useFetch<{ stadiums: AdminStadium[] }>(form ? "/api/admin/stadiums" : null);
  const { data: personsData } = useFetch<{ persons: AdminPerson[] }>(form ? "/api/admin/persons" : null);

  const leagues = overview?.leagues ?? [];
  const league = leagues.find((l) => l.id === (leagueId || leagues[0]?.id));
  const seasons = league?.seasons ?? [];
  const effectiveSeasonId = seasonId || seasons.find((s) => s.isCurrent)?.id || seasons[0]?.id || "";

  const { data, loading } = useFetch<{ matches: AdminMatch[] }>(effectiveSeasonId ? `/api/admin/matches?seasonId=${effectiveSeasonId}` : null, version);

  const matches = data?.matches ?? [];
  const teams = teamsData?.teams ?? [];
  const stadiums = stadiumsData?.stadiums ?? [];
  const referees = (personsData?.persons ?? []).filter((p) => p.isReferee);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const body = {
      seasonId: form.seasonId,
      homeTeamId: form.homeTeamId,
      awayTeamId: form.awayTeamId,
      kickoff: fromLocalInput(form.kickoff),
      stadiumId: form.stadiumId || null,
      refereeId: form.refereeId || null,
      round: form.round ? Number(form.round) : null,
      note: form.note || null,
      status: form.status || undefined,
    };
    const res = await apiPost(form.id ? `/api/admin/matches/${form.id}` : "/api/admin/matches", body, form.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(form.id ? "Матч обновлён" : "Матч создан");
    setForm(null);
    bump();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold"><CalendarPlus className="h-4 w-4 text-emerald-600" /> Матчи</h3>
          <p className="text-xs text-zinc-400">Создание и редактирование матчей · протокол — в разделе «Протоколы» или кнопкой ниже</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={leagueId || leagues[0]?.id || ""}
            onChange={(e) => { setLeagueId(e.target.value); setSeasonId(""); }}
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm"
            aria-label="Лига"
          >
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select
            value={effectiveSeasonId}
            onChange={(e) => setSeasonId(e.target.value)}
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm"
            aria-label="Сезон"
          >
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? " (тек.)" : ""}</option>)}
          </select>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={!effectiveSeasonId}
            onClick={() => setForm({
              seasonId: effectiveSeasonId, homeTeamId: "", awayTeamId: "",
              kickoff: toLocalInput(new Date().toISOString()), stadiumId: "", refereeId: "", round: "", note: "", status: "SCHEDULED",
            })}
          >
            <Plus className="mr-1 h-4 w-4" /> Матч
          </Button>
        </div>
      </div>

      {!effectiveSeasonId && <EmptyState title="Сезон не найден" />}
      {loading && !data && effectiveSeasonId && <LoadingBlock />}
      {effectiveSeasonId && matches.length === 0 && !loading && <EmptyState title="Матчей нет" hint="Создайте матч или сгенерируйте расписание" />}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {matches.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
            <span className="w-14 shrink-0 font-mono text-xs text-zinc-400">{m.round ? `${m.round} тур` : "—"}</span>
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
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setForm({
                id: m.id, seasonId: effectiveSeasonId,
                homeTeamId: m.homeTeam.id, awayTeamId: m.awayTeam.id,
                kickoff: toLocalInput(m.kickoff),
                stadiumId: m.stadium?.id ?? "", refereeId: m.referee?.id ?? "",
                round: m.round ? String(m.round) : "", note: m.note ?? "",
                status: m.status === "POSTPONED" ? "POSTPONED" : "SCHEDULED",
              })} aria-label="Редактировать">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => onOpenProtocol(m.id)} aria-label="Протокол">
                <ClipboardPen className="h-3.5 w-3.5" />
              </Button>
              <DeleteBtn onClick={async () => {
                const res = await apiPost(`/api/admin/matches/${m.id}`, null, "DELETE");
                if (!res.ok) return toast.error(res.error);
                toast.success("Матч удалён");
                bump();
              }} />
            </div>
          </div>
        ))}
      </div>
      {matches.length > 0 && (
        <p className="text-xs text-zinc-400">
          Всего {matches.length} · статусы: {Object.values(STATUS_LABELS).join(", ")} · переносить завершённые матчи нельзя (сначала Reset в «Протоколах»)
        </p>
      )}

      {/* ---------- Диалог матча ---------- */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? "Редактировать матч" : "Новый матч"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Хозяева">
                <select value={form.homeTeamId} onChange={(e) => setForm({ ...form, homeTeamId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— выберите —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Гости">
                <select value={form.awayTeamId} onChange={(e) => setForm({ ...form, awayTeamId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— выберите —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Дата и время (МСК)"><Input type="datetime-local" value={form.kickoff} onChange={(e) => setForm({ ...form, kickoff: e.target.value })} /></Field>
              <Field label="Тур"><Input type="number" value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} placeholder="4" /></Field>
              <Field label="Стадион">
                <select value={form.stadiumId} onChange={(e) => setForm({ ...form, stadiumId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— не указан —</option>
                  {stadiums.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? `, ${s.city}` : ""}</option>)}
                </select>
              </Field>
              <Field label="Судья">
                <select value={form.refereeId} onChange={(e) => setForm({ ...form, refereeId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— не назначен —</option>
                  {referees.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
              {form.id && (
                <Field label="Статус">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                    <option value="SCHEDULED">Запланирован</option>
                    <option value="POSTPONED">Перенесён</option>
                  </select>
                </Field>
              )}
              <div className="col-span-2">
                <Field label="Примечание"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} placeholder="Причина переноса, организационная информация..." /></Field>
              </div>
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
