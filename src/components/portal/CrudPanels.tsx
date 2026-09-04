"use client";

// CRUD-панели админки (часть 1): лиги+сезоны, клубы+команды.
// Полный продакшен-цикл: создание, редактирование, удаление — с защитами на API.

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Trophy, Building2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost, useFetch, fmtShortDate } from "./hooks";
import { FORMAT_LABELS } from "./types";
import { EmptyState, LoadingBlock } from "./ui-bits";

interface CrudProps {
  bump: () => void;
  onReload: () => void;
}

// ---------- Общие элементы ----------
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-zinc-600">{label}</Label>
      {children}
      {hint && <p className="text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}

export function DeleteBtn({ onClick }: { onClick: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <span className="flex items-center gap-1">
      <Button variant="destructive" size="sm" className="h-7 px-2 text-xs" onClick={onClick}>Точно</Button>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setConfirming(false)}>Нет</Button>
    </span>
  ) : (
    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-red-600" onClick={() => setConfirming(true)} aria-label="Удалить">
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

// ============================================================
// Турниры: лиги + сезоны
// ============================================================

interface AdminLeague {
  id: string; name: string; shortName: string | null; format: string; isPinned: boolean; priority: number;
  yellowCardLimit: number; yellowCardBanMatches: number; redCardBanMatches: number; walkoverScore: number;
  transferWindowEnd: string | null;
  seasons: { id: string; name: string; startDate: string; isCurrent: boolean }[];
}

const emptyLeague = {
  name: "", shortName: "", format: "F11", isPinned: true, priority: 0,
  yellowCardLimit: 3, yellowCardBanMatches: 1, redCardBanMatches: 1, walkoverScore: 3, transferWindowEnd: "",
};

export function TournamentsPanel({ bump, onReload }: CrudProps) {
  const { data, loading } = useFetch<{ leagues: AdminLeague[] }>("/api/admin/leagues");
  const [leagueForm, setLeagueForm] = useState<typeof emptyLeague & { id?: string } | null>(null);
  const [seasonForm, setSeasonForm] = useState<{ id?: string; leagueId: string; name: string; startDate: string; endDate: string; isCurrent: boolean } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saveLeague = async () => {
    if (!leagueForm) return;
    setSaving(true);
    const body = { ...leagueForm, transferWindowEnd: leagueForm.transferWindowEnd || null };
    const res = await apiPost(leagueForm.id ? `/api/admin/leagues/${leagueForm.id}` : "/api/admin/leagues", body, leagueForm.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(leagueForm.id ? "Лига обновлена" : "Лига создана");
    setLeagueForm(null);
    bump();
    onReload();
  };

  const saveSeason = async () => {
    if (!seasonForm) return;
    setSaving(true);
    const res = await apiPost(seasonForm.id ? `/api/admin/seasons/${seasonForm.id}` : "/api/admin/seasons", seasonForm, seasonForm.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(seasonForm.id ? "Сезон обновлён" : "Сезон создан (этап «Регулярный чемпионат» добавлен)");
    setSeasonForm(null);
    bump();
    onReload();
  };

  if (loading && !data) return <LoadingBlock />;
  const leagues = data?.leagues ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold"><Trophy className="h-4 w-4 text-emerald-600" /> Лиги и сезоны</h3>
          <p className="text-xs text-zinc-400">Форматы 11×11 / 8×8 / 6×6 / футзал · дисциплинарные правила · закрепление в «Топ-лигах»</p>
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setLeagueForm({ ...emptyLeague })}>
          <Plus className="mr-1 h-4 w-4" /> Создать лигу
        </Button>
      </div>

      {leagues.length === 0 && <EmptyState title="Лиг нет" hint="Создайте первую лигу" />}
      {leagues.map((l) => (
        <div key={l.id} className="rounded-xl border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
            <Badge className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/10">{FORMAT_LABELS[l.format] ?? l.format}</Badge>
            <span className="font-bold text-zinc-800">{l.name}</span>
            {l.shortName && <span className="text-xs text-zinc-400">({l.shortName})</span>}
            {l.isPinned && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Топ-лига · приоритет {l.priority}</Badge>}
            <span className="hidden text-xs text-zinc-400 sm:inline">{l.yellowCardLimit} ЖК → бан · КК → {l.redCardBanMatches} · WO {l.walkoverScore}:0</span>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setLeagueForm({ id: l.id, name: l.name, shortName: l.shortName ?? "", format: l.format, isPinned: l.isPinned, priority: l.priority, yellowCardLimit: l.yellowCardLimit, yellowCardBanMatches: l.yellowCardBanMatches, redCardBanMatches: l.redCardBanMatches, walkoverScore: l.walkoverScore, transferWindowEnd: l.transferWindowEnd?.slice(0, 10) ?? "" })} aria-label="Редактировать">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <DeleteBtn onClick={async () => {
                const res = await apiPost(`/api/admin/leagues/${l.id}`, null, "DELETE");
                if (!res.ok) return toast.error(res.error);
                toast.success("Лига удалена");
                bump();
                onReload();
              }} />
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}>
                Сезоны ({l.seasons.length})
              </Button>
            </div>
          </div>

          {expandedId === l.id && (
            <div className="space-y-1.5 px-4 py-3">
              {l.seasons.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                  <span className="font-semibold text-zinc-700">{s.name}</span>
                  <span className="text-xs text-zinc-400">старт {fmtShortDate(s.startDate)}</span>
                  {s.isCurrent && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">текущий</Badge>}
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setSeasonForm({ id: s.id, leagueId: l.id, name: s.name, startDate: s.startDate.slice(0, 10), endDate: "", isCurrent: s.isCurrent })} aria-label="Редактировать сезон">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <DeleteBtn onClick={async () => {
                      const res = await apiPost(`/api/admin/seasons/${s.id}`, null, "DELETE");
                      if (!res.ok) return toast.error(res.error);
                      toast.success("Сезон удалён");
                      bump();
                      onReload();
                    }} />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setSeasonForm({ leagueId: l.id, name: "Сезон 2027", startDate: "", endDate: "", isCurrent: false })}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Добавить сезон
              </Button>
            </div>
          )}
        </div>
      ))}

      {/* ---------- Диалог лиги ---------- */}
      <Dialog open={!!leagueForm} onOpenChange={(o) => !o && setLeagueForm(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{leagueForm?.id ? "Редактировать лигу" : "Новая лига"}</DialogTitle>
          </DialogHeader>
          {leagueForm && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Название"><Input value={leagueForm.name} onChange={(e) => setLeagueForm({ ...leagueForm, name: e.target.value })} placeholder="Премьер-лига ФФ Чувашии" /></Field>
              <Field label="Короткое имя" hint="Для сайдбара и виджетов"><Input value={leagueForm.shortName} onChange={(e) => setLeagueForm({ ...leagueForm, shortName: e.target.value })} placeholder="Премьер-лига" /></Field>
              <Field label="Формат">
                <select value={leagueForm.format} onChange={(e) => setLeagueForm({ ...leagueForm, format: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  {Object.entries(FORMAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Приоритет (0–100)" hint="Меньше — выше в «Топ-лигах»"><Input type="number" value={leagueForm.priority} onChange={(e) => setLeagueForm({ ...leagueForm, priority: Number(e.target.value) })} /></Field>
              <Field label="ЖК до бана"><Input type="number" value={leagueForm.yellowCardLimit} onChange={(e) => setLeagueForm({ ...leagueForm, yellowCardLimit: Number(e.target.value) })} /></Field>
              <Field label="Матчей бана за ЖК"><Input type="number" value={leagueForm.yellowCardBanMatches} onChange={(e) => setLeagueForm({ ...leagueForm, yellowCardBanMatches: Number(e.target.value) })} /></Field>
              <Field label="Матчей бана за КК"><Input type="number" value={leagueForm.redCardBanMatches} onChange={(e) => setLeagueForm({ ...leagueForm, redCardBanMatches: Number(e.target.value) })} /></Field>
              <Field label="Регламент WO" hint="3 — футбол, 5 — мини-футбол"><Input type="number" value={leagueForm.walkoverScore} onChange={(e) => setLeagueForm({ ...leagueForm, walkoverScore: Number(e.target.value) })} /></Field>
              <Field label="Конец трансферного окна"><Input type="date" value={leagueForm.transferWindowEnd} onChange={(e) => setLeagueForm({ ...leagueForm, transferWindowEnd: e.target.value })} /></Field>
              <div className="flex items-center gap-2 pt-5">
                <Switch checked={leagueForm.isPinned} onCheckedChange={(v) => setLeagueForm({ ...leagueForm, isPinned: v })} />
                <span className="text-sm text-zinc-600">Закрепить в «Топ-лигах»</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeagueForm(null)}>Отмена</Button>
            <Button disabled={saving} onClick={saveLeague} className="bg-emerald-600 hover:bg-emerald-700">{leagueForm?.id ? "Сохранить" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Диалог сезона ---------- */}
      <Dialog open={!!seasonForm} onOpenChange={(o) => !o && setSeasonForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{seasonForm?.id ? "Редактировать сезон" : "Новый сезон"}</DialogTitle></DialogHeader>
          {seasonForm && (
            <div className="space-y-3">
              <Field label="Название"><Input value={seasonForm.name} onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })} placeholder="Сезон 2027" /></Field>
              <Field label="Дата начала"><Input type="date" value={seasonForm.startDate} onChange={(e) => setSeasonForm({ ...seasonForm, startDate: e.target.value })} /></Field>
              <div className="flex items-center gap-2">
                <Switch checked={seasonForm.isCurrent} onCheckedChange={(v) => setSeasonForm({ ...seasonForm, isCurrent: v })} />
                <span className="text-sm text-zinc-600">Текущий сезон</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeasonForm(null)}>Отмена</Button>
            <Button disabled={saving} onClick={saveSeason} className="bg-emerald-600 hover:bg-emerald-700">{seasonForm?.id ? "Сохранить" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Клубы и команды
// ============================================================

interface AdminClub { id: string; name: string; city: string | null; description: string | null; teams: { id: string; name: string }[]; teamsCount: number }
interface AdminTeam { id: string; name: string; city: string | null; club: { id: string; name: string } | null; registrationsCount: number; matchesCount: number }

export function ClubsTeamsPanel({ bump, onReload }: CrudProps) {
  const [tab, setTab] = useState<"teams" | "clubs">("teams");
  const { data: teamsData, loading: teamsLoading } = useFetch<{ teams: AdminTeam[] }>("/api/admin/teams");
  const { data: clubsData, loading: clubsLoading } = useFetch<{ clubs: AdminClub[] }>("/api/admin/clubs");
  const [teamForm, setTeamForm] = useState<{ id?: string; name: string; clubId: string; city: string } | null>(null);
  const [clubForm, setClubForm] = useState<{ id?: string; name: string; city: string; description: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const clubs = clubsData?.clubs ?? [];
  const teams = teamsData?.teams ?? [];

  const saveTeam = async () => {
    if (!teamForm) return;
    setSaving(true);
    const res = await apiPost(teamForm.id ? `/api/admin/teams/${teamForm.id}` : "/api/admin/teams", { name: teamForm.name, clubId: teamForm.clubId || null, city: teamForm.city || null }, teamForm.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(teamForm.id ? "Команда обновлена" : "Команда создана");
    setTeamForm(null);
    bump();
    onReload();
  };

  const saveClub = async () => {
    if (!clubForm) return;
    setSaving(true);
    const res = await apiPost(clubForm.id ? `/api/admin/clubs/${clubForm.id}` : "/api/admin/clubs", { name: clubForm.name, city: clubForm.city, description: clubForm.description }, clubForm.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(clubForm.id ? "Клуб обновлён" : "Клуб создан");
    setClubForm(null);
    bump();
    onReload();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold"><Shield className="h-4 w-4 text-emerald-600" /> Клубы и команды</h3>
          <p className="text-xs text-zinc-400">Инвариант №1: клуб (бренд/юрлицо) ≠ команда (состав в лиге)</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-zinc-100 p-0.5">
            {(["teams", "clubs"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1 text-xs font-semibold", tab === t ? "bg-white shadow-sm" : "text-zinc-500")}>
                {t === "teams" ? `Команды (${teams.length})` : `Клубы (${clubs.length})`}
              </button>
            ))}
          </div>
          {tab === "teams" ? (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setTeamForm({ name: "", clubId: "", city: "" })}>
              <Plus className="mr-1 h-4 w-4" /> Команда
            </Button>
          ) : (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setClubForm({ name: "", city: "", description: "" })}>
              <Plus className="mr-1 h-4 w-4" /> Клуб
            </Button>
          )}
        </div>
      </div>

      {/* ---------- Команды ---------- */}
      {tab === "teams" && (teamsLoading && !teamsData ? <LoadingBlock /> : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {teams.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
              <span className="font-semibold text-zinc-800">{t.name}</span>
              {t.club ? <Badge variant="outline" className="text-zinc-500">{t.club.name}</Badge> : <Badge variant="outline" className="border-zinc-200 text-zinc-300">без клуба</Badge>}
              {t.city && <span className="text-xs text-zinc-400">{t.city}</span>}
              <span className="ml-auto text-xs text-zinc-400">{t.matchesCount} матчей · {t.registrationsCount} заявок</span>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setTeamForm({ id: t.id, name: t.name, clubId: t.club?.id ?? "", city: t.city ?? "" })} aria-label="Редактировать">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <DeleteBtn onClick={async () => {
                const res = await apiPost(`/api/admin/teams/${t.id}`, null, "DELETE");
                if (!res.ok) return toast.error(res.error);
                toast.success("Команда удалена");
                bump();
                onReload();
              }} />
            </div>
          ))}
        </div>
      ))}

      {/* ---------- Клубы ---------- */}
      {tab === "clubs" && (clubsLoading && !clubsData ? <LoadingBlock /> : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {clubs.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
              <Building2 className="h-4 w-4 text-zinc-300" />
              <span className="font-semibold text-zinc-800">{c.name}</span>
              {c.city && <span className="text-xs text-zinc-400">{c.city}</span>}
              <span className="ml-auto text-xs text-zinc-400">{c.teamsCount} команд</span>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setClubForm({ id: c.id, name: c.name, city: c.city ?? "", description: c.description ?? "" })} aria-label="Редактировать">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <DeleteBtn onClick={async () => {
                const res = await apiPost(`/api/admin/clubs/${c.id}`, null, "DELETE");
                if (!res.ok) return toast.error(res.error);
                toast.success("Клуб удалён");
                bump();
                onReload();
              }} />
            </div>
          ))}
        </div>
      ))}

      {/* ---------- Диалог команды ---------- */}
      <Dialog open={!!teamForm} onOpenChange={(o) => !o && setTeamForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{teamForm?.id ? "Редактировать команду" : "Новая команда"}</DialogTitle></DialogHeader>
          {teamForm && (
            <div className="space-y-3">
              <Field label="Название"><Input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} placeholder="Урняк-КУ" /></Field>
              <Field label="Клуб">
                <select value={teamForm.clubId} onChange={(e) => setTeamForm({ ...teamForm, clubId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— без клуба —</option>
                  {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Город"><Input value={teamForm.city} onChange={(e) => setTeamForm({ ...teamForm, city: e.target.value })} placeholder="Чебоксары" /></Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamForm(null)}>Отмена</Button>
            <Button disabled={saving} onClick={saveTeam} className="bg-emerald-600 hover:bg-emerald-700">{teamForm?.id ? "Сохранить" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Диалог клуба ---------- */}
      <Dialog open={!!clubForm} onOpenChange={(o) => !o && setClubForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{clubForm?.id ? "Редактировать клуб" : "Новый клуб"}</DialogTitle></DialogHeader>
          {clubForm && (
            <div className="space-y-3">
              <Field label="Название"><Input value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} placeholder="ФК «Урняк»" /></Field>
              <Field label="Город"><Input value={clubForm.city} onChange={(e) => setClubForm({ ...clubForm, city: e.target.value })} /></Field>
              <Field label="Описание"><Input value={clubForm.description} onChange={(e) => setClubForm({ ...clubForm, description: e.target.value })} /></Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClubForm(null)}>Отмена</Button>
            <Button disabled={saving} onClick={saveClub} className="bg-emerald-600 hover:bg-emerald-700">{clubForm?.id ? "Сохранить" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
