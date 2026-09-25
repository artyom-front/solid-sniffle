"use client";

// ============================================================
// PersonDetailPanel — карточка персоны в админке («проваливание»).
//
// Полный профиль: фото, ФИО/ДР/пол/позиция, специализации-чипы
// (с инвариантом «судья ≠ игрок»), история заявок по сезонам с
// действиями (отзаявить/вернуть/удалить), сводка статистики,
// умное удаление (каскад с заявками / подсказка про Merge).
// ============================================================

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronRight, ExternalLink, Trash2, Loader2, LogIn, LogOut,
  AlertTriangle, User, Activity, Flag, Ban, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiPost, useFetch, fmtShortDate } from "./hooks";
import { navigate } from "./router";
import { LoadingBlock, EmptyState } from "./ui-bits";
import { Field } from "./CrudPanels";
import { MediaUpload } from "./MediaUpload";
import { SmartDelete } from "./SmartDelete";
import { SYSTEM_ROLES, ROLE_GROUP_LABELS, cardRoleConflict, CARD_ROLE_CONFLICT_HINT, type RoleDef } from "@/lib/roles";

interface RegRow {
  id: string; teamId: string; teamName: string; teamLogo: string | null;
  seasonId: string; seasonName: string; leagueName: string;
  number: number | null; role: string; startDate: string; endDate: string | null; status: string;
}

interface PersonDetailData {
  person: {
    id: string; firstName: string; lastName: string; middleName: string | null;
    birthDate: string | null; gender: string | null; position: string | null;
    roles: string[]; isReferee: boolean; photoUrl: string | null;
  };
  stats: {
    events: number; assists: number; lineups: number; registrations: number;
    suspensions: number; refereedMatches: number; ratings: number;
    linkedAccounts: number; goals: number; yellowCards: number; redCards: number;
  };
  canDelete: boolean;
  deleteBlockers: { events: number; lineups: number; registrations: number; suspensions: number; matches: number; ratings: number };
  registrations: RegRow[];
}

interface CustomRoleDTO { id: string; code: string; name: string }

interface Props {
  personId: string;
  version: number;
  bump: () => void;
  onBack: () => void;
  backLabel: string;
  onOpenTeam?: (teamId: string) => void;
  canDelete: boolean;
}

const ROLE_OPTIONS: Record<string, string> = {
  PLAYER: "Игрок", COACH: "Тренер", ASSISTANT_COACH: "Помощник тренера",
  GOALKEEPER_COACH: "Тренер вратарей", FITNESS_COACH: "Тренер по физподготовке",
  ADMINISTRATOR: "Администратор", DELEGATE: "Делегат", DOCTOR: "Врач", MASSEUR: "Массажист",
};
const regRoleLabel = (code: string) => ROLE_OPTIONS[code] ?? code;

export default function PersonDetailPanel({ personId, version, bump, onBack, backLabel, onOpenTeam, canDelete }: Props) {
  const { data, loading, error } = useFetch<PersonDetailData>(`/api/admin/persons/${personId}`, version);
  const { data: customRolesData } = useFetch<{ customRoles: CustomRoleDTO[] }>("/api/admin/customroles", version);
  // Правки профиля: хранятся ТОЛЬКО изменённые поля (поверх данных) —
  // форма не рассинхронизируется при обновлении данных после действий
  const [edits, setEdits] = useState<Partial<{ firstName: string; lastName: string; middleName: string; birthDate: string; gender: string; position: string; roles: string[] }>>({});
  const [saving, setSaving] = useState(false);
  const [regBusy, setRegBusy] = useState<string | null>(null);

  const person = data?.person;
  const customRoles = customRolesData?.customRoles ?? [];

  const form = {
    firstName: edits.firstName ?? person?.firstName ?? "",
    lastName: edits.lastName ?? person?.lastName ?? "",
    middleName: edits.middleName ?? person?.middleName ?? "",
    birthDate: edits.birthDate ?? (person?.birthDate ? person.birthDate.slice(0, 10) : ""),
    gender: edits.gender ?? person?.gender ?? "",
    position: edits.position ?? person?.position ?? "",
    roles: edits.roles ?? (person?.roles.length ? person.roles : ["PLAYER"]),
  };

  const roleName = (code: string): string => {
    const sys = SYSTEM_ROLES.find((r) => r.code === code);
    if (sys) return sys.name;
    const custom = customRoles.find((r) => r.code === code);
    return custom?.name ?? code;
  };

  const isPlayer = form.roles.includes("PLAYER");
  const roleConflict = cardRoleConflict(form.roles);

  const toggleRole = (code: string) => {
    const has = form.roles.includes(code);
    const roles = has ? form.roles.filter((r) => r !== code) : [...form.roles, code];
    setEdits({ ...edits, roles, position: has && code === "PLAYER" ? "" : form.position });
  };

  const groups: { group: RoleDef["group"]; roles: { code: string; name: string }[] }[] = (
    ["team", "officials", "medicine"] as const
  ).map((group) => ({
    group,
    roles: SYSTEM_ROLES.filter((r) => r.group === group).map((r) => ({ code: r.code, name: r.name })),
  }));

  const save = async () => {
    if (!person) return;
    setSaving(true);
    const res = await apiPost(`/api/admin/persons/${person.id}`, {
      firstName: form.firstName, lastName: form.lastName, middleName: form.middleName || null,
      birthDate: form.birthDate || null, gender: form.gender || null,
      position: form.position || null, roles: form.roles,
    }, "PATCH");
    setSaving(false);
    if (!res.ok) return toast.error(res.error, { duration: 7000 });
    toast.success("Профиль обновлён");
    setEdits({});
    bump();
  };

  const savePhoto = async (url: string) => {
    if (!person) return;
    const res = await apiPost(`/api/admin/persons/${person.id}`, { photoUrl: url || null }, "PATCH");
    if (!res.ok) return toast.error(res.error);
    toast.success(url ? "Фото обновлено" : "Фото удалено");
    bump();
  };

  const regAction = async (r: RegRow, action: "end" | "reactivate" | "delete") => {
    setRegBusy(r.id);
    const res =
      action === "end"
        ? await apiPost(`/api/admin/registrations/${r.id}`, { endDate: new Date().toISOString() }, "PATCH")
        : action === "reactivate"
          ? await apiPost(`/api/admin/registrations/${r.id}`, { status: "ACTIVE" }, "PATCH")
          : await apiPost(`/api/admin/registrations/${r.id}`, null, "DELETE");
    setRegBusy(null);
    if (!res.ok) return toast.error(res.error, { duration: 9000 });
    toast.success(action === "end" ? "Отзаявлен (история сохранена)" : action === "reactivate" ? "Снова в заявке" : "Заявка удалена");
    bump();
  };

  if (loading && !data) return <LoadingBlock />;
  if (error) return <EmptyState title="Персона не найдена" hint={error} />;
  if (!data || !person) return <LoadingBlock />;

  const fullName = `${person.lastName} ${person.firstName} ${person.middleName ?? ""}`.trim();
  const activeRegs = data.registrations.filter((r) => !r.endDate);

  return (
    <div className="space-y-4">
      {/* ---- Хлебные крошки ---- */}
      <nav className="flex items-center gap-1 text-sm text-zinc-400" aria-label="Навигация">
        <button onClick={onBack} className="flex items-center gap-1 rounded px-1 py-0.5 font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800">
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-bold text-zinc-800">{fullName}</span>
      </nav>

      {/* ---- Шапка-профиль ---- */}
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-start gap-4 p-4">
          <MediaUpload value={person.photoUrl ?? ""} onChange={savePhoto} label="" hint="" round className="w-fit" previewAlt="Фото персоны" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black tracking-tight text-zinc-900">{fullName}</h2>
              {person.roles.slice(0, 4).map((r) => (
                <Badge key={r} variant="secondary" className="font-normal">{roleName(r)}</Badge>
              ))}
              {person.roles.length > 4 && <Badge variant="secondary" className="font-normal">+{person.roles.length - 4}</Badge>}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-zinc-400">
              {person.birthDate && <span>{new Date(person.birthDate).toLocaleDateString("ru-RU")} · {new Date(person.birthDate).getFullYear()} г.р.</span>}
              {person.gender && <span>{person.gender === "MALE" ? "муж" : "жен"}</span>}
              {isPlayer && person.position && <span>{({ GK: "вратарь", DF: "защитник", MF: "полузащитник", FW: "нападающий" } as Record<string, string>)[person.position]}</span>}
              <span>заявок: {data.stats.registrations} (активных: {activeRegs.length})</span>
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button variant="outline" size="sm" className="h-7 border-zinc-200 text-xs text-zinc-600" onClick={() => navigate(`/player/${person.id}`)}>
                <ExternalLink className="mr-1 h-3 w-3" /> На сайт
              </Button>
              {canDelete && (
                <SmartDelete
                  endpoint={`/api/admin/persons/${person.id}`}
                  entityLabel="Профиль"
                  title={`Удаление профиля ${fullName}`}
                  onDone={() => { onBack(); bump(); }}
                  blockedHint={<>Профиль пересоздаётся? Объедините старый и новый в разделе <b>Система → Merge профилей</b>: голы, заявки и дисквалификации перейдут на новый профиль, статистика не потеряется.</>}
                />
              )}
            </div>
          </div>

          {/* мини-статистика */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <StatCell icon={<Activity className="h-3.5 w-3.5" />} value={data.stats.goals} label="голы" />
            <StatCell icon={<Activity className="h-3.5 w-3.5" />} value={data.stats.assists} label="пасы" />
            <StatCell icon={<User className="h-3.5 w-3.5" />} value={data.stats.lineups} label="матчи" />
            <StatCell icon={<Flag className="h-3.5 w-3.5" />} value={data.stats.refereedMatches} label="судейство" />
            <StatCell icon={<Ban className="h-3.5 w-3.5" />} value={data.stats.suspensions} label="дискв." />
            <StatCell icon={<Link2 className="h-3.5 w-3.5" />} value={data.stats.linkedAccounts} label="аккаунты" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Редактирование профиля ---- */}
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-700">
            <User className="h-4 w-4 text-emerald-600" /> Профиль
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Фамилия"><Input value={form.lastName} onChange={(e) => setEdits({ ...edits, lastName: e.target.value })} /></Field>
            <Field label="Имя"><Input value={form.firstName} onChange={(e) => setEdits({ ...edits, firstName: e.target.value })} /></Field>
            <Field label="Отчество"><Input value={form.middleName} onChange={(e) => setEdits({ ...edits, middleName: e.target.value })} /></Field>
            <Field label="Дата рождения" hint="Защита от дублей"><Input type="date" value={form.birthDate} onChange={(e) => setEdits({ ...edits, birthDate: e.target.value })} /></Field>
            <Field label="Пол">
              <select value={form.gender} onChange={(e) => setEdits({ ...edits, gender: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                <option value="">— не указан —</option>
                <option value="MALE">Мужской</option>
                <option value="FEMALE">Женский</option>
              </select>
            </Field>
            {isPlayer && (
              <Field label="Позиция (для роли «Игрок»)">
                <select value={form.position} onChange={(e) => setEdits({ ...edits, position: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— не указана —</option>
                  <option value="GK">Вратарь</option>
                  <option value="DF">Защитник</option>
                  <option value="MF">Полузащитник</option>
                  <option value="FW">Нападающий</option>
                </select>
              </Field>
            )}
          </div>

          {/* специализации */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-600">Специализации (можно несколько)</p>
            <p className="text-[11px] leading-snug text-zinc-400">
              Игрок совместим с тренером (играющий тренер). С судьёй — нет: играет и судит в разных лигах через заявки.
            </p>
            {groups.map((g) => (
              <div key={g.group}>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{ROLE_GROUP_LABELS[g.group]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.roles.map((r) => {
                    const active = form.roles.includes(r.code);
                    return (
                      <button
                        key={r.code} type="button" onClick={() => toggleRole(r.code)}
                        className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors", active ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200")}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {customRoles.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Свои роли</p>
                <div className="flex flex-wrap gap-1.5">
                  {customRoles.map((r) => {
                    const active = form.roles.includes(r.code);
                    return (
                      <button
                        key={r.code} type="button" onClick={() => toggleRole(r.code)}
                        className={cn("rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-colors", active ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50")}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {roleConflict.length > 0 && (
            <div className="space-y-1.5 rounded-lg border border-red-300 bg-red-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> Судья/врач не может быть игроком</p>
              <p className="text-xs text-red-600">{CARD_ROLE_CONFLICT_HINT}</p>
            </div>
          )}

          <Button disabled={saving || roleConflict.length > 0 || !form.lastName.trim() || !form.firstName.trim()} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Сохранить профиль
          </Button>
        </div>

        {/* ---- История заявок ---- */}
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-zinc-700">
            <LogIn className="h-4 w-4 text-emerald-600" /> Заявки по сезонам
          </h3>
          {data.registrations.length === 0 ? (
            <EmptyState title="Заявок не было" hint="Игрока можно заявить из карточки команды: «Клубы и команды» → команда → «Добавить игрока»" />
          ) : (
            <div className="space-y-1.5">
              {data.registrations.map((r) => (
                <div key={r.id} className={cn("rounded-lg border px-3 py-2", r.endDate ? "border-zinc-100 bg-zinc-50/60" : "border-emerald-200 bg-emerald-50/40")}>
                  <div className="flex flex-wrap items-center gap-2">
                    {onOpenTeam ? (
                      <button
                        onClick={() => onOpenTeam(r.teamId)}
                        className="rounded text-sm font-semibold text-zinc-800 hover:bg-emerald-100 hover:text-emerald-700"
                        title="Открыть карточку команды"
                      >
                        {r.teamName}
                      </button>
                    ) : (
                      <span className="text-sm font-semibold text-zinc-800">{r.teamName}</span>
                    )}
                    <Badge variant="outline" className="font-normal text-zinc-500">{r.leagueName} · {r.seasonName}</Badge>
                    {r.number != null && <span className="font-mono text-xs font-bold text-zinc-500">№{r.number}</span>}
                    <Badge variant={r.role === "PLAYER" ? "secondary" : "outline"} className="font-normal">{regRoleLabel(r.role)}</Badge>
                    <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", r.endDate ? "border-zinc-200 text-zinc-400" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
                      {r.endDate ? "закрыта" : "активна"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span>{fmtShortDate(r.startDate)}{r.endDate ? ` — ${fmtShortDate(r.endDate)}` : " — по н.в."}</span>
                    <span className="ml-auto flex items-center gap-0.5">
                      {regBusy === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                      ) : (
                        <>
                          {r.endDate ? (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => regAction(r, "reactivate")} title="Вернуть в заявку" aria-label="Вернуть в заявку">
                              <LogIn className="h-3 w-3" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-400 hover:text-amber-600" onClick={() => regAction(r, "end")} title="Отзаявить (закрыть датой)" aria-label="Отзаявить">
                              <LogOut className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-zinc-400 hover:text-red-600" onClick={() => regAction(r, "delete")} title="Удалить заявку (если матчей не было)" aria-label="Удалить заявку">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs leading-relaxed text-zinc-400">
            Заявка — членство человека в команде на сезон. Отзаявка закрывает её датой (трансферы, сохранение истории),
            удаление убирает её целиком — доступно, пока игрок не выходил в составах.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCell({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex min-w-16 flex-col items-center rounded-lg bg-zinc-50 px-2 py-1.5">
      <span className="flex items-center gap-1 text-sm font-black text-zinc-700">{icon}{value}</span>
      <span className="text-[10px] font-medium text-zinc-400">{label}</span>
    </div>
  );
}
