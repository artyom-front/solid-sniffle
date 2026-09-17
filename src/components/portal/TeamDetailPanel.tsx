"use client";

// ============================================================
// TeamDetailPanel — карточка команды в админке («проваливание»).
//
// Как профиль: шапка с эмблемой и статистикой, редактирование
// полей, вкладки «Состав» и «Матчи». Состав — полноценный
// менеджер roster'а: добавить (поиск/создать), массово из CSV,
// номер/роль, отзаявить, удалить. Клик по игроку — его карточка.
//
// Практики: хлебные крошки, тупиковых состояний нет (удаление
// с каскадом и объяснениями), все действия — с тостами и аудитом.
// ============================================================

import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronRight, ExternalLink, Trash2, Pencil, UserPlus, FileSpreadsheet,
  Loader2, CheckCircle2, AlertTriangle, Users, CalendarDays, LogIn, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost, useFetch, fmtShortDate } from "./hooks";
import { navigate } from "./router";
import { LoadingBlock, EmptyState, PositionBadge } from "./ui-bits";
import { Field } from "./CrudPanels";
import { MediaUpload } from "./MediaUpload";
import { SmartDelete } from "./SmartDelete";
import { readFileTextSmart } from "@/lib/csvEncoding";
import { templateText } from "@/lib/importTemplates";
import type { OverviewDTO } from "./types";

const ROLE_OPTIONS = [
  { code: "PLAYER", name: "Игрок" },
  { code: "COACH", name: "Тренер" },
  { code: "ASSISTANT_COACH", name: "Помощник тренера" },
  { code: "GOALKEEPER_COACH", name: "Тренер вратарей" },
  { code: "FITNESS_COACH", name: "Тренер по физподготовке" },
  { code: "ADMINISTRATOR", name: "Администратор" },
  { code: "DELEGATE", name: "Делегат" },
  { code: "DOCTOR", name: "Врач" },
  { code: "MASSEUR", name: "Массажист" },
];
const roleLabel = (code: string) => ROLE_OPTIONS.find((r) => r.code === code)?.name ?? code;

interface RegRow {
  id: string; personId: string; personName: string; personPhoto: string | null;
  personPosition: string | null; personBirthYear: number | null;
  seasonId: string; seasonName: string; leagueName: string;
  number: number | null; role: string; startDate: string; endDate: string | null; status: string;
}

interface TeamDetailData {
  team: {
    id: string; name: string; city: string | null; logoUrl: string | null;
    club: { id: string; name: string } | null;
    matchesCount: number; registrationsCount: number;
    canDelete: boolean; deleteBlockers: { matches: number; registrations: number };
  };
  seasons: { id: string; name: string; isCurrent: boolean; league: { id: string; name: string; shortName: string | null } }[];
  registrations: RegRow[];
  matches: {
    id: string; kickoff: string; status: string; round: number | null; isFriendly: boolean;
    homeTeam: { id: string; name: string }; awayTeam: { id: string; name: string };
    homeScore: number | null; awayScore: number | null;
  }[];
}

interface Props {
  teamId: string;
  version: number;
  bump: () => void;
  onBack: () => void;
  onOpenPerson: (personId: string) => void;
  onOpenMatch: (matchId: string) => void;
  overview: OverviewDTO | null;
  canDeleteTeam: boolean;
}

export default function TeamDetailPanel({ teamId, version, bump, onBack, onOpenPerson, onOpenMatch, overview, canDeleteTeam }: Props) {
  const { data, loading, error } = useFetch<TeamDetailData>(`/api/admin/teams/${teamId}`, version);
  const { data: clubsData } = useFetch<{ clubs: { id: string; name: string }[] }>("/api/admin/clubs", version);

  const [tab, setTab] = useState<"roster" | "matches" | "info">("roster");
  const [seasonSel, setSeasonSel] = useState("");
  const [showEnded, setShowEnded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editReg, setEditReg] = useState<RegRow | null>(null);
  // Правки полей команды: хранятся ТОЛЬКО изменённые поля (поверх данных) —
  // форма не рассинхронизируется при обновлении данных после действий
  const [teamEdits, setTeamEdits] = useState<{ name?: string; clubId?: string; city?: string }>({});
  const [savingTeam, setSavingTeam] = useState(false);

  const team = data?.team;
  const teamForm = {
    name: teamEdits.name ?? team?.name ?? "",
    clubId: teamEdits.clubId ?? team?.club?.id ?? "",
    city: teamEdits.city ?? team?.city ?? "",
  };
  const teamDirty = Object.keys(teamEdits).length > 0;

  // ---- выбор сезона: сезоны команды + все сезоны из обзора (для новой команды) ----
  const seasonOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; isCurrent: boolean; label: string }>();
    for (const s of data?.seasons ?? []) {
      map.set(s.id, { id: s.id, name: s.name, isCurrent: s.isCurrent, label: `${s.league.shortName ?? s.league.name} · ${s.name}` });
    }
    for (const l of overview?.leagues ?? []) {
      for (const s of l.seasons ?? []) {
        if (!map.has(s.id)) {
          map.set(s.id, { id: s.id, name: s.name, isCurrent: s.isCurrent, label: `${l.shortName ?? l.name} · ${s.name}` });
        }
      }
    }
    return [...map.values()].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent));
  }, [data?.seasons, overview]);

  // сезон по умолчанию — текущий (вычисляется при рендере, без эффекта)
  const effectiveSeasonId = seasonSel || seasonOptions.find((s) => s.isCurrent)?.id || seasonOptions[0]?.id || "";

  const roster = (data?.registrations ?? []).filter((r) => r.seasonId === effectiveSeasonId);
  const activeRoster = roster.filter((r) => !r.endDate);
  const visibleRoster = showEnded ? roster : activeRoster;

  // ---------- действия ----------
  const saveTeam = async () => {
    if (!team) return;
    setSavingTeam(true);
    const res = await apiPost(`/api/admin/teams/${team.id}`, {
      name: teamForm.name, clubId: teamForm.clubId || null, city: teamForm.city || null,
    }, "PATCH");
    setSavingTeam(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Команда обновлена");
    setTeamEdits({});
    bump();
  };

  const saveLogo = async (url: string) => {
    if (!team) return;
    const res = await apiPost(`/api/admin/teams/${team.id}`, { logoUrl: url || null }, "PATCH");
    if (!res.ok) return toast.error(res.error);
    toast.success(url ? "Эмблема обновлена" : "Эмблема удалена");
    bump();
  };

  const endReg = async (r: RegRow) => {
    const res = await apiPost(`/api/admin/registrations/${r.id}`, { endDate: new Date().toISOString() }, "PATCH");
    if (!res.ok) return toast.error(res.error, { duration: 7000 });
    toast.success(`${r.personName} отзаявлен — история сохранена`);
    bump();
  };

  const reactivateReg = async (r: RegRow) => {
    const res = await apiPost(`/api/admin/registrations/${r.id}`, { status: "ACTIVE" }, "PATCH");
    if (!res.ok) return toast.error(res.error);
    toast.success(`${r.personName} снова в заявке`);
    bump();
  };

  const deleteReg = async (r: RegRow) => {
    const res = await apiPost(`/api/admin/registrations/${r.id}`, null, "DELETE");
    if (!res.ok) return toast.error(res.error, { duration: 9000 });
    toast.success("Заявка удалена");
    bump();
  };

  if (loading && !data) return <LoadingBlock />;
  if (error) return <EmptyState title="Команда не найдена" hint={error} />;
  if (!data || !team) return <LoadingBlock />;

  return (
    <div className="space-y-4">
      {/* ---- Хлебные крошки ---- */}
      <nav className="flex items-center gap-1 text-sm text-zinc-400" aria-label="Навигация">
        <button onClick={onBack} className="flex items-center gap-1 rounded px-1 py-0.5 font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Клубы и команды
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-bold text-zinc-800">{team.name}</span>
        {tab === "roster" && <><ChevronRight className="h-3.5 w-3.5" /><span className="text-zinc-500">Состав · {seasonOptions.find((s) => s.id === effectiveSeasonId)?.name}</span></>}
      </nav>

      {/* ---- Шапка-профиль ---- */}
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-start gap-4 p-4">
          <MediaUpload value={team.logoUrl ?? ""} onChange={saveLogo} label="" hint="" className="w-fit" previewAlt="Эмблема команды" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black tracking-tight text-zinc-900">{team.name}</h2>
              {team.club ? <Badge variant="outline" className="text-zinc-500">{team.club.name}</Badge> : <Badge variant="outline" className="border-zinc-200 text-zinc-300">без клуба</Badge>}
              {team.city && <span className="text-sm text-zinc-400">{team.city}</span>}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{activeRoster.length} в заявке{seasonOptions.find((s) => s.id === effectiveSeasonId) ? ` · ${seasonOptions.find((s) => s.id === effectiveSeasonId)!.name}` : ""}</span>
              <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{team.matchesCount} матчей</span>
              <span>всего заявок: {team.registrationsCount}</span>
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button variant="outline" size="sm" className="h-7 border-zinc-200 text-xs text-zinc-600" onClick={() => navigate(`/team/${team.id}`)}>
                <ExternalLink className="mr-1 h-3 w-3" /> На сайт
              </Button>
              {canDeleteTeam && (
                <SmartDelete
                  endpoint={`/api/admin/teams/${team.id}`}
                  entityLabel={`Команда «${team.name}»`}
                  title={`Удаление команды «${team.name}»`}
                  onDone={() => { onBack(); bump(); }}
                  blockedHint={<>Не хотите терять историю? Создайте команду-правопреёмника и объедините их в разделе <b>Система → Merge профилей → Команды</b>: матчи, заявки и события перейдут новой команде.</>}
                />
              )}
            </div>
          </div>
        </div>

        {/* ---- Вкладки ---- */}
        <div className="flex border-t border-zinc-100">
          {([["roster", "Состав"], ["matches", `Матчи (${team.matchesCount})`], ["info", "Основное"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "px-4 py-2.5 text-sm font-semibold transition-colors",
                tab === id ? "border-b-2 border-emerald-600 text-emerald-700" : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ================= СПИСОК ================= */}
      {tab === "roster" && (
        <div className="space-y-3">
          {/* селектор сезона + действия состава */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={effectiveSeasonId}
              onChange={(e) => setSeasonSel(e.target.value)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700"
              aria-label="Сезон"
            >
              {seasonOptions.map((s) => <option key={s.id} value={s.id}>{s.label}{s.isCurrent ? " · текущий" : ""}</option>)}
            </select>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-500">
              <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} className="h-3.5 w-3.5 accent-emerald-600" />
              Показать отзаявленных
            </label>
            <div className="ml-auto flex flex-wrap gap-1.5">
              <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-700" disabled={!effectiveSeasonId} onClick={() => setAddOpen(true)}>
                <UserPlus className="mr-1 h-4 w-4" /> Добавить игрока
              </Button>
              <Button size="sm" variant="outline" className="h-9" disabled={!effectiveSeasonId} onClick={() => setBulkOpen(true)}>
                <FileSpreadsheet className="mr-1 h-4 w-4" /> Массово из CSV
              </Button>
            </div>
          </div>

          {/* состав */}
          {visibleRoster.length === 0 ? (
            <EmptyState
              icon={<Users className="h-6 w-6 opacity-60" />}
              title={roster.length === 0 ? "В этом сезоне состав не заявлялся" : "Активной заявки нет"}
              hint={roster.length === 0
                ? "Добавьте игроков по одному («Добавить игрока») или вставьте список из Excel («Массово из CSV»)"
                : "Все заявки закрыты — включите «Показать отзаявленных» или добавьте игроков заново"}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {visibleRoster.map((r) => (
                <div key={r.id} className={cn("flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0", r.endDate && "bg-zinc-50/60")}>
                  <span className="w-8 text-center font-mono text-sm font-bold text-zinc-500">{r.number ?? "–"}</span>
                  {r.personPhoto
                    ? <img src={r.personPhoto} alt="" className="h-8 w-8 rounded-full border border-zinc-200 object-cover" />
                    : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-400">{r.personName.slice(0, 1)}</span>}
                  <button
                    onClick={() => onOpenPerson(r.personId)}
                    className="rounded font-semibold text-zinc-800 hover:bg-emerald-50 hover:text-emerald-700"
                    title="Открыть карточку игрока"
                  >
                    {r.personName}
                  </button>
                  <PositionBadge position={r.personPosition} />
                  {r.personBirthYear && <span className="hidden text-xs text-zinc-400 sm:inline">{r.personBirthYear} г.р.</span>}
                  <Badge variant={r.role === "PLAYER" ? "secondary" : "outline"} className="font-normal">{roleLabel(r.role)}</Badge>
                  <span className="ml-auto hidden text-xs text-zinc-400 md:inline">
                    заявлен {fmtShortDate(r.startDate)}{r.endDate ? ` — ${fmtShortDate(r.endDate)}` : ""}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "pointer-events-none",
                      r.endDate ? "border-zinc-200 text-zinc-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    )}
                  >
                    {r.endDate ? "отзаявлен" : "в заявке"}
                  </Badge>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setEditReg(r)} aria-label="Изменить номер/роль" title="Номер и роль в заявке">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {r.endDate ? (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => reactivateReg(r)} aria-label="Вернуть в заявку" title="Вернуть в заявку (снова активна)">
                        <LogIn className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-amber-600" onClick={() => endReg(r)} aria-label="Отзаявить" title="Отзаявить (закрыть датой, история сохранится)">
                        <LogOut className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-red-600" onClick={() => deleteReg(r)} aria-label="Удалить заявку" title="Полное удаление заявки (если матчей не было)">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs leading-relaxed text-zinc-400">
            «Отзаявить» закрывает заявку датой — игрок уходит из текущего состава, история сохраняется (для трансферов).
            Корзина удаляет заявку целиком — доступна, только если игрок не выходил в составах этого сезона.
          </p>
        </div>
      )}

      {/* ================= МАТЧИ ================= */}
      {tab === "matches" && (
        <div className="space-y-3">
          {data.matches.length === 0 ? (
            <EmptyState icon={<CalendarDays className="h-6 w-6 opacity-60" />} title="Матчей нет" hint="Создайте матчи в разделе «Матчи» или сгенерируйте календарь в «Расписание»" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {data.matches.map((m) => {
                const own = m.homeTeam.id === team.id ? "home" : "away";
                return (
                  <button key={m.id} onClick={() => onOpenMatch(m.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-50 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-zinc-50">
                    <span className="w-24 shrink-0 text-xs text-zinc-400">{fmtShortDate(m.kickoff)}</span>
                    {m.isFriendly && <Badge variant="outline" className="text-zinc-400">товарищеский</Badge>}
                    <span className="flex min-w-[200px] flex-1 items-center gap-2 text-sm">
                      <span className={cn(own === "home" ? "font-bold text-zinc-800" : "text-zinc-500")}>{m.homeTeam.name}</span>
                      <span className="font-mono font-bold text-zinc-700">
                        {m.homeScore !== null ? `${m.homeScore}:${m.awayScore ?? 0}` : "— : —"}
                      </span>
                      <span className={cn(own === "away" ? "font-bold text-zinc-800" : "text-zinc-500")}>{m.awayTeam.name}</span>
                    </span>
                    <span className="text-xs font-medium text-zinc-400">{m.status === "COMPLETED" ? "завершён" : m.status === "LIVE" ? "идёт" : m.status === "WALKOVER" ? "техпоражение" : "запланирован"}</span>
                    <ChevronRight className="h-4 w-4 text-zinc-300" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= ОСНОВНОЕ ================= */}
      {tab === "info" && (
        <div className="max-w-xl space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
          <Field label="Название"><Input value={teamForm.name} onChange={(e) => setTeamEdits({ ...teamEdits, name: e.target.value })} /></Field>
          <Field label="Клуб" hint="Клуб — бренд/юрлицо (несколько команд), команда — состав в лиге">
            <select value={teamForm.clubId} onChange={(e) => setTeamEdits({ ...teamEdits, clubId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
              <option value="">— без клуба —</option>
              {(clubsData?.clubs ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Город"><Input value={teamForm.city} onChange={(e) => setTeamEdits({ ...teamEdits, city: e.target.value })} placeholder="Чебоксары" /></Field>
          <div className="flex gap-2 pt-1">
            <Button disabled={savingTeam || !teamForm.name.trim()} onClick={saveTeam} className="bg-emerald-600 hover:bg-emerald-700">
              {savingTeam ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Сохранить
            </Button>
            <Button variant="outline" disabled={!teamDirty} onClick={() => setTeamEdits({})}>Сбросить</Button>
          </div>
          <p className="border-t border-zinc-100 pt-3 text-xs leading-relaxed text-zinc-400">
            Эмблема меняется в шапке карточки (клик по квадратику слева). Удаление команды — кнопка корзины в шапке:
            если за командой числятся только заявки, система предложит удалить их вместе с командой.
          </p>
        </div>
      )}

      {/* ---- Диалог: номер/роль в заявке ---- */}
      <Dialog open={!!editReg} onOpenChange={(o) => !o && setEditReg(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Заявка: {editReg?.personName}</DialogTitle></DialogHeader>
          {editReg && <EditRegForm reg={editReg} onDone={() => { setEditReg(null); bump(); }} />}
        </DialogContent>
      </Dialog>

      {/* ---- Диалог: добавить игрока ---- */}
      <AddPlayerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        teamId={team.id}
        seasonId={effectiveSeasonId}
        seasonLabel={seasonOptions.find((s) => s.id === effectiveSeasonId)?.label ?? ""}
        version={version}
        onAdded={() => { bump(); }}
      />

      {/* ---- Диалог: массовое добавление ---- */}
      <BulkAddDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        teamId={team.id}
        teamName={team.name}
        seasonId={effectiveSeasonId}
        seasonLabel={seasonOptions.find((s) => s.id === effectiveSeasonId)?.label ?? ""}
        onImported={() => bump()}
      />
    </div>
  );
}

// ============================================================
// Правка номера/роли в заявке
// ============================================================
function EditRegForm({ reg, onDone }: { reg: RegRow; onDone: () => void }) {
  const [number, setNumber] = useState(reg.number != null ? String(reg.number) : "");
  const [role, setRole] = useState(reg.role);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await apiPost(`/api/admin/registrations/${reg.id}`, {
      number: number.trim() === "" ? null : Number(number),
      role,
    }, "PATCH");
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Заявка обновлена");
    onDone();
  };

  return (
    <div className="space-y-3">
      <Field label="Номер в заявке"><Input type="number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="10" /></Field>
      <Field label="Роль в заявке">
        <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
          {ROLE_OPTIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
      </Field>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Отмена</Button>
        <Button disabled={busy} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">Сохранить</Button>
      </DialogFooter>
    </div>
  );
}

// ============================================================
// Добавление игрока: найти существующего или создать нового
// ============================================================
interface PersonLite { id: string; name: string; birthDate: string | null; position: string | null; isReferee: boolean; teams: string[] }

function AddPlayerDialog({ open, onClose, teamId, seasonId, seasonLabel, version, onAdded }: {
  open: boolean; onClose: () => void; teamId: string; seasonId: string; seasonLabel: string; version: number; onAdded: () => void;
}) {
  const [mode, setMode] = useState<"find" | "create">("find");
  const [q, setQ] = useState("");
  const [personId, setPersonId] = useState("");
  const [number, setNumber] = useState("");
  const [role, setRole] = useState("PLAYER");
  const [busy, setBusy] = useState(false);
  // форма создания нового
  const [np, setNp] = useState({ lastName: "", firstName: "", middleName: "", birthDate: "", position: "" });
  const [dupes, setDupes] = useState<{ id: string; name: string; birthDate: string | null }[] | null>(null);

  const { data } = useFetch<{ persons: PersonLite[] }>(open && mode === "find" && q.trim().length >= 2 ? `/api/admin/persons?q=${encodeURIComponent(q.trim())}` : null, version);
  const found = (data?.persons ?? []).slice(0, 12);
  const selected = found.find((p) => p.id === personId);

  const register = async (pid: string) => {
    setBusy(true);
    const res = await apiPost<{ registration: unknown }>("/api/admin/registrations", {
      personId: pid, teamId, seasonId, role,
      number: number.trim() === "" ? null : Number(number),
      endDatePrevious: new Date().toISOString(),
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error, { duration: 7000 });
    toast.success("Игрок заявлен");
    reset();
    onAdded();
  };

  const createAndRegister = async (force = false) => {
    if (!np.lastName.trim() || !np.firstName.trim()) return toast.error("Укажите фамилию и имя");
    setBusy(true);
    const res = await apiPost<{ person: { id: string }; duplicates?: { id: string; name: string; birthDate: string | null }[] }>("/api/admin/persons", {
      lastName: np.lastName, firstName: np.firstName, middleName: np.middleName || null,
      birthDate: np.birthDate || null, position: np.position || null,
      roles: ["PLAYER"], force,
    });
    if (!res.ok) {
      setBusy(false);
      if (res.data?.duplicates) {
        setDupes(res.data.duplicates);
        return toast.error("Похожая персона уже есть — проверьте список ниже");
      }
      return toast.error(res.error);
    }
    const pid = res.data?.person?.id;
    setDupes(null);
    if (!pid) { setBusy(false); return; }
    await register(pid);
    setBusy(false);
  };

  const reset = () => {
    setQ(""); setPersonId(""); setNumber(""); setRole("PLAYER");
    setNp({ lastName: "", firstName: "", middleName: "", birthDate: "", position: "" });
    setDupes(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-emerald-600" /> Добавить в заявку</DialogTitle>
          <p className="text-xs font-normal text-zinc-400">{seasonLabel}</p>
        </DialogHeader>

        <div className="flex rounded-lg bg-zinc-100 p-0.5">
          {(["find", "create"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setDupes(null); }} className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-semibold", mode === m ? "bg-white shadow-sm" : "text-zinc-500")}>
              {m === "find" ? "Найти существующего" : "Создать нового"}
            </button>
          ))}
        </div>

        {mode === "find" && (
          <div className="space-y-3">
            <Input placeholder="Поиск по фамилии или имени (минимум 2 буквы)..." value={q} onChange={(e) => { setQ(e.target.value); setPersonId(""); }} />
            {q.trim().length >= 2 && found.length === 0 && <p className="text-center text-xs text-zinc-400">Никого не найдено — переключитесь на «Создать нового»</p>}
            <div className="max-h-56 space-y-1 overflow-y-auto scrollbar-s21">
              {found.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPersonId(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    personId === p.id ? "border-emerald-400 bg-emerald-50" : "border-zinc-100 hover:bg-zinc-50"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-zinc-800">{p.name}</span>
                    <span className="block truncate text-xs text-zinc-400">
                      {p.birthDate ? new Date(p.birthDate).getFullYear() + " г.р." : "без даты рождения"}
                      {p.isReferee ? " · судья" : ""}{p.teams.length ? ` · ${p.teams.join(", ")}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {selected?.isReferee && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Это судья: заявка игроком пройдёт, только если он не судит матчи этого сезона (проверяется автоматически).
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Номер"><Input type="number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="10" /></Field>
              <Field label="Роль в заявке">
                <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  {ROLE_OPTIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                </select>
              </Field>
            </div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={!personId || busy} onClick={() => register(personId)}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1 h-4 w-4" />}
              Заявить {selected ? selected.name.split(" ")[0] : ""}
            </Button>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Фамилия"><Input value={np.lastName} onChange={(e) => setNp({ ...np, lastName: e.target.value })} /></Field>
              <Field label="Имя"><Input value={np.firstName} onChange={(e) => setNp({ ...np, firstName: e.target.value })} /></Field>
              <Field label="Отчество"><Input value={np.middleName} onChange={(e) => setNp({ ...np, middleName: e.target.value })} /></Field>
              <Field label="Дата рождения" hint="Защита от дублей"><Input type="date" value={np.birthDate} onChange={(e) => setNp({ ...np, birthDate: e.target.value })} /></Field>
              <Field label="Позиция">
                <select value={np.position} onChange={(e) => setNp({ ...np, position: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— не указана —</option>
                  <option value="GK">Вратарь</option>
                  <option value="DF">Защитник</option>
                  <option value="MF">Полузащитник</option>
                  <option value="FW">Нападающий</option>
                </select>
              </Field>
              <Field label="Номер"><Input type="number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="10" /></Field>
            </div>
            {dupes && dupes.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> Похоже, этот человек уже есть:</p>
                {dupes.map((d) => <p key={d.id} className="text-xs text-amber-700">{d.name}{d.birthDate ? ` · ${d.birthDate}` : ""}</p>)}
                <Button size="sm" variant="outline" className="h-7 border-amber-300 bg-white text-xs text-amber-800" disabled={busy} onClick={() => createAndRegister(true)}>
                  Это другой человек — создать и заявить
                </Button>
              </div>
            )}
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => createAndRegister(false)}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Создать персону и заявить
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Массовое добавление состава из CSV (кодировки детектируются)
// ============================================================
interface ImportRowResult { row: number; status: string; name: string; message?: string }
interface ImportResult { ok: boolean; dryRun: boolean; total: number; created: number; updated: number; exists: number; errors: number; rows: ImportRowResult[] }

function BulkAddDialog({ open, onClose, teamId, teamName, seasonId, seasonLabel, onImported }: {
  open: boolean; onClose: () => void; teamId: string; teamName: string; seasonId: string; seasonLabel: string; onImported: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (dryRun: boolean) => {
    if (!csv.trim()) return toast.error("Вставьте данные или загрузите файл");
    setBusy(true);
    const res = await apiPost<ImportResult>("/api/admin/import", { entity: "players", csv, dryRun, teamId, seasonId, closePrevious: false });
    setBusy(false);
    if (!res.ok) return toast.error(res.error, { duration: 8000 });
    setResult(res.data ?? null);
    if (!dryRun) {
      toast.success(`Импорт: создано ${res.data?.created ?? 0}, пропущено ${res.data?.exists ?? 0}, ошибок ${res.data?.errors ?? 0}`);
      onImported();
    } else {
      toast.info(`Проверка: будет создано ${res.data?.created ?? 0}, уже есть ${res.data?.exists ?? 0}, ошибок ${res.data?.errors ?? 0}`);
    }
  };

  const onFile = async (f: File) => {
    const { text, encoding } = await readFileTextSmart(f);
    setCsv(text);
    setResult(null);
    if (encoding === "windows-1251" || encoding === "koi8-r") {
      toast.success(`Кириллица восстановлена (${encoding}) — файл прочитан верно`);
    } else if (encoding === "unknown") {
      toast.error("Кодировка не распознана — надёжнее вставить текст из Excel через Ctrl+C / Ctrl+V");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setCsv(""); setResult(null); } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Массовое добавление в состав</DialogTitle>
          <p className="text-xs font-normal text-zinc-400">{teamName} · {seasonLabel}</p>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              Загрузить CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }} />
            <Button size="sm" variant="outline" onClick={() => { setCsv(templateText("players")); setResult(null); }}>
              Пример в поле
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href="/api/admin/import/template?type=players" download>Скачать шаблон</a>
            </Button>
          </div>
          <textarea
            value={csv}
            onChange={(e) => { setCsv(e.target.value); setResult(null); }}
            rows={7}
            placeholder="Вставьте список из Excel (Ctrl+V): Фамилия;Имя;Отчество;ДатаРождения;Позиция;Номер;Роль"
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy || !csv.trim()} onClick={() => run(true)}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Проверить (без записи)
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy || !csv.trim()} onClick={() => run(false)}>
              Заявить в состав
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold">{result.dryRun ? "Проверка (ничего не записано)" : "Заявки оформлены"}</span>
              <Badge className="bg-emerald-600/10 text-emerald-700">создано {result.created}</Badge>
              <Badge variant="secondary">уже есть {result.exists}</Badge>
              {result.errors > 0 && <Badge variant="destructive">ошибок {result.errors}</Badge>}
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-100 bg-white scrollbar-s21">
              {result.rows.slice(0, 100).map((r) => (
                <div key={r.row} className={cn("flex items-center gap-2 border-b border-zinc-50 px-3 py-1.5 text-xs last:border-b-0", r.status === "error" && "bg-red-50/50")}>
                  <span className="w-8 font-mono text-zinc-400">{r.row}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-700">{r.name || "—"}</span>
                  <span className={cn("shrink-0 font-medium", r.status === "created" ? "text-emerald-600" : r.status === "error" ? "text-red-600" : "text-zinc-400")}>
                    {r.status === "created" ? "заявлен" : r.status === "updated" ? "обновлён" : r.status === "error" ? "ошибка" : "уже есть"}
                  </span>
                  {r.message && <span className="hidden max-w-[220px] truncate text-zinc-400 sm:block" title={r.message}>{r.message}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs leading-relaxed text-zinc-400">
          Повторный импорт не создаёт дублей: существующие персоны находятся по ФИО и дате рождения.
          Формат даты любой (31.12.1990, 1990-12-31), кодировка определяется автоматически (UTF-8, cp1251, koi8-r).
        </p>
      </DialogContent>
    </Dialog>
  );
}
