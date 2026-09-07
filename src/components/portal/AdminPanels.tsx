"use client";

// Разделы панели управления: КДК, расписание, заявки, Merge профилей, аудит

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Ban, CalendarPlus, ArrowRightLeft, GitMerge, ScrollText, Save, Trash2, Plus, Clock } from "lucide-react";
import { apiPost, useFetch, fmtDate } from "./hooks";
import { SOURCE_LABELS } from "./types";

// ============================================================
// КДК: ручное управление дисквалификациями (Epic 1)
// ============================================================

interface KdcData {
  suspensions: {
    id: string; person: { id: string; name: string }; team: { id: string; name: string } | null;
    source: string; reason: string | null; matchesTotal: number; matchesServed: number;
    isLifetime: boolean; isActive: boolean; createdAt: string;
  }[];
  persons: { id: string; name: string; team: string }[];
}

export function KdcPanel({ seasonId, bump }: { seasonId: string; bump: () => void }) {
  const { data, loading, error } = useFetch<KdcData>(seasonId ? `/api/admin/suspensions?seasonId=${seasonId}` : null);
  const [newPerson, setNewPerson] = useState("");
  const [newTotal, setNewTotal] = useState("1");
  const [newReason, setNewReason] = useState("");
  const [newLifetime, setNewLifetime] = useState(false);
  const [busy, setBusy] = useState(false);

  async function update(id: string, patch: Record<string, unknown>) {
    setBusy(true);
    const res = await apiPost("/api/admin/suspensions", { action: "update", id, ...patch });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Санкция обновлена");
    bump();
  }

  async function create() {
    if (!newPerson) return toast.error("Выберите игрока");
    setBusy(true);
    const res = await apiPost("/api/admin/suspensions", {
      action: "create", personId: newPerson, seasonId, matchesTotal: newLifetime ? 0 : Number(newTotal) || 1, reason: newReason || "Решение КДК", isLifetime: newLifetime,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Дисквалификация назначена");
    setNewPerson(""); setNewReason(""); setNewLifetime(false); setNewTotal("1");
    bump();
  }

  if (!seasonId) return <p className="text-sm text-zinc-400">Выберите сезон</p>;
  if (loading && !data) return <p className="py-8 text-center text-sm text-zinc-400">Загрузка...</p>;
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Комитет по дисциплине (КДК)</h3>
        <p className="text-sm text-zinc-500">Изменение сроков, причин и отмена дисквалификаций. Все действия пишутся в журнал аудита.</p>
      </div>

      {/* Создать санкцию */}
      <Card className="border-zinc-200">
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4 text-emerald-600" /> Назначить санкцию вручную</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-xs">Игрок</Label>
            <Select value={newPerson} onValueChange={setNewPerson}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Выбрать" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {data.persons.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.team}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Матчей пропуска</Label>
            <Input type="number" min={1} value={newTotal} onChange={(e) => setNewTotal(e.target.value)} disabled={newLifetime} className="bg-white" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Причина</Label>
            <Input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="Агрессия / Оскорбление судьи / Договорной матч" className="bg-white" />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-1.5">
              <Switch checked={newLifetime} onCheckedChange={setNewLifetime} id="lifetime" />
              <Label htmlFor="lifetime" className="text-xs">Пожизненно</Label>
            </div>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={create}>Назначить</Button>
          </div>
        </CardContent>
      </Card>

      {/* Список */}
      <Card className="overflow-hidden border-zinc-200">
        <CardContent className="p-0">
          <div className="hidden items-center gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-500 md:flex">
            <span className="flex-1">Игрок</span><span className="w-40">Источник</span><span className="flex-1">Причина</span>
            <span className="w-44">Срок</span><span className="w-28">Статус</span><span className="w-20" />
          </div>
          {data.suspensions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 border-b border-zinc-100 px-4 py-3 text-sm">
              <div className="min-w-[160px] flex-1">
                <p className="font-medium">{s.person.name}</p>
                <p className="text-xs text-zinc-400">{s.team?.name ?? "—"} · {fmtDate(s.createdAt, false)}</p>
              </div>
              <span className={`w-40 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${s.source === "MANUAL" ? "bg-red-100 text-red-700" : s.source === "AUTO_RED" ? "bg-orange-100 text-orange-700" : "bg-yellow-100 text-yellow-700"}`}>
                {SOURCE_LABELS[s.source]}
              </span>
              <span className="min-w-[140px] flex-1 text-xs text-zinc-500">{s.reason ?? "—"}</span>
              <div className="flex w-44 shrink-0 items-center gap-1.5">
                {s.isLifetime ? (
                  <Badge variant="outline" className="border-red-300 text-red-600">Пожизненно</Badge>
                ) : (
                  <Select defaultValue={String(s.matchesTotal)} onValueChange={(v) => update(s.id, { matchesTotal: Number(v) })}>
                    <SelectTrigger className="h-8 bg-white text-xs"><div className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.matchesServed}/{s.matchesTotal} матч.</div></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 8, 10, 15].map((n) => <SelectItem key={n} value={String(n)}>{n} матчей</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <button
                  onClick={() => update(s.id, { isLifetime: !s.isLifetime, matchesTotal: s.isLifetime ? 1 : 0 })}
                  className="rounded p-1 text-xs text-red-500 hover:bg-red-50"
                  title={s.isLifetime ? "Снять пожизненную" : "Сделать пожизненной"}
                >
                  <Ban className="h-4 w-4" />
                </button>
              </div>
              <div className="w-28 shrink-0">
                {s.isActive ? <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Активна</Badge> : <Badge variant="secondary">Отбыта</Badge>}
              </div>
              <div className="flex w-20 shrink-0 justify-end gap-1">
                <button onClick={() => update(s.id, { isActive: !s.isActive })} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" title={s.isActive ? "Досрочно снять" : "Вернуть в силу"}>
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={async () => {
                    const res = await apiPost("/api/admin/suspensions", { action: "delete", id: s.id });
                    if (!res.ok) return toast.error(res.error);
                    toast.success("Санкция удалена");
                    bump();
                  }}
                  className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  title="Удалить"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {data.suspensions.length === 0 && <p className="py-8 text-center text-sm text-zinc-400">Дисквалификаций нет</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Генерация расписания (Milestone 2)
// ============================================================

export function SchedulePanel({ seasonId, bump }: { seasonId: string; bump: () => void }) {
  const [double, setDouble] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!startDate) return toast.error("Укажите дату первого тура");
    setBusy(true);
    const res = await apiPost<{ created: number; rounds: number }>("/api/admin/schedule", {
      seasonId, double, startDate, kickoffHour: 11, replaceScheduled: replace,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Создано матчей: ${res.data?.created} в ${res.data?.rounds} турах`);
    bump();
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Генерация расписания</h3>
        <p className="text-sm text-zinc-500">Круговая система (round-robin) по командам, заявленным в сезоне. Существующие сыгранные матчи не затрагиваются.</p>
      </div>
      <Card className="border-zinc-200">
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Дата 1-го тура</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-white" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Формат</Label>
            <div className="flex items-center gap-2 pt-1.5">
              <Switch checked={double} onCheckedChange={setDouble} id="double" />
              <Label htmlFor="double" className="text-xs">{double ? "Двойной круг" : "Одиночный круг"}</Label>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Незыгранные матчи</Label>
            <div className="flex items-center gap-2 pt-1.5">
              <Switch checked={replace} onCheckedChange={setReplace} id="replace" />
              <Label htmlFor="replace" className="text-xs">{replace ? "Пересоздать" : "Оставить"}</Label>
            </div>
          </div>
          <div className="flex items-end">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy || !seasonId} onClick={generate}>
              <CalendarPlus className="mr-1 h-4 w-4" /> Сгенерировать
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Заявки и трансферы (Epic 3)
// ============================================================

interface RegData {
  persons: { id: string; name: string; position: string | null; teams: string[] }[];
}

export function RegistrationsPanel({ seasonId, bump }: { seasonId: string; bump: () => void }) {
  const [personId, setPersonId] = useState("");
  const [number, setNumber] = useState("");
  const [endPrevious, setEndPrevious] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const { data } = useFetch<RegData>(seasonId ? `/api/admin/persons?seasonId=${seasonId}` : null);
  const { data: teamsData } = useFetch<{ teams: { id: string; name: string }[] }>(seasonId ? `/api/public/teams?seasonId=${seasonId}` : null);
  const [teamId, setTeamId] = useState("");

  const persons = (data?.persons ?? []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  async function submit() {
    if (!personId || !teamId) return toast.error("Выберите игрока и команду");
    setBusy(true);
    const res = await apiPost("/api/admin/registrations", {
      personId, teamId, seasonId, number: number ? Number(number) : null, endDatePrevious: endPrevious ? new Date().toISOString() : null,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error, { duration: 6000 });
    toast.success("Заявка оформлена");
    setPersonId(""); setNumber("");
    bump();
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Заявки и трансферы</h3>
        <p className="text-sm text-zinc-500">
          Заявка игрока за команду на сезон. При трансфере предыдущая заявка закрывается датой — система учитывает её при валидации событий (Epic 3).
          Трансферное окно лиги проверяется автоматически.
        </p>
      </div>
      <Card className="border-zinc-200">
        <CardContent className="grid gap-3 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Поиск игрока</Label>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Фамилия..." className="bg-white" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Игрок</Label>
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Выбрать" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {persons.slice(0, 100).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.teams.length ? ` (${p.teams.join(", ")})` : " — без команды"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Новая команда</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Выбрать" /></SelectTrigger>
              <SelectContent>
                {(teamsData?.teams ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Номер</Label>
            <div className="flex gap-2">
              <Input type="number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="10" className="bg-white" />
              <Button size="sm" className="shrink-0 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={submit}>
                <ArrowRightLeft className="mr-1 h-4 w-4" /> Заявить
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:col-span-4">
            <Switch checked={endPrevious} onCheckedChange={setEndPrevious} id="endprev" />
            <Label htmlFor="endprev" className="text-xs text-zinc-500">Закрыть предыдущую активную заявку игрока (трансфер)</Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Merge профилей (Epic 4)
// ============================================================

interface MergeData {
  persons: { id: string; name: string; position: string | null; isReferee: boolean; links: { registrations: number; events: number; suspensions: number; refereedMatches: number; teams: string[] } }[];
}

export function MergePanel({ bump }: { bump: () => void }) {
  const [query, setQuery] = useState("");
  const { data } = useFetch<MergeData>(`/api/admin/merge?q=${encodeURIComponent(query)}`);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [busy, setBusy] = useState(false);

  const from = data?.persons.find((p) => p.id === fromId);
  const to = data?.persons.find((p) => p.id === toId);

  async function merge() {
    if (!fromId || !toId) return toast.error("Выберите оба профиля");
    if (fromId === toId) return toast.error("Профили совпадают");
    setBusy(true);
    const res = await apiPost<{ transferred: Record<string, number> }>("/api/admin/merge", { fromId, toId });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    const t = res.data?.transferred;
    toast.success(`Профили объединены: перепривязано ${t?.events ?? 0} событий, ${t?.registrations ?? 0} заявок, ${t?.suspensions ?? 0} дисквалификаций`);
    setFromId(""); setToId("");
    bump();
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><GitMerge className="h-4 w-4 text-emerald-600" /> Гигиена данных: слияние профилей</h3>
        <p className="text-sm text-zinc-500">
          Секретари часто создают дубликаты («Иванов И.» и «Иванов Иван»). Выберите дубликат (источник) и канонический профиль (цель):
          все связи будут транзакционно перепривязаны, дубликат удалён, операция зафиксирована в журнале аудита.
        </p>
      </div>

      <Card className="border-zinc-200">
        <CardContent className="space-y-3">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по фамилии..." className="max-w-sm bg-white" />
          <div className="grid gap-3 md:grid-cols-2">
            {([["Дубликат (будет удалён)", fromId, setFromId, from], ["Канонический профиль (останется)", toId, setToId, to]] as const).map(([label, value, setter, preview]) => (
              <div key={label} className="space-y-1 rounded-xl border border-zinc-200 p-3">
                <Label className="text-xs font-semibold">{label}</Label>
                <Select value={value} onValueChange={setter}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Выбрать профиль" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(data?.persons ?? []).slice(0, 100).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {p.links.events} соб., {p.links.registrations} заявк.
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {preview && (
                  <div className="mt-2 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-500">
                    <p className="font-medium text-zinc-700">{preview.name}</p>
                    <p>Команды: {preview.links.teams.join(", ") || "—"}</p>
                    <p>Событий: {preview.links.events} · Заявок: {preview.links.registrations} · Дисквалификаций: {preview.links.suspensions} · Матчей судьёй: {preview.links.refereedMatches}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy || !fromId || !toId} onClick={merge}>
            <GitMerge className="mr-1 h-4 w-4" /> Объединить профили
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Журнал аудита (инвариант №4)
// ============================================================

interface AuditData {
  logs: { id: string; userEmail: string | null; entity: string; entityId: string; action: string; oldValue: unknown; newValue: unknown; createdAt: string }[];
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-zinc-100 text-zinc-600",
  DELETE: "bg-red-100 text-red-700",
  MERGE: "bg-violet-100 text-violet-700",
  COMPLETE: "bg-emerald-100 text-emerald-700",
  WO_ASSIGN: "bg-amber-100 text-amber-700",
  RESET: "bg-amber-100 text-amber-700",
};

export function AuditPanel() {
  const { data } = useFetch<AuditData>("/api/admin/audit?limit=150");
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-semibold"><ScrollText className="h-4 w-4 text-emerald-600" /> Журнал аудита</h3>
        <p className="text-sm text-zinc-500">Каждое пост-фактум изменение: пользователь, старое и новое значение, время (инвариант №4 PRD).</p>
      </div>
      <Card className="overflow-hidden border-zinc-200">
        <CardContent className="p-0">
          {(data?.logs ?? []).map((l) => (
            <button key={l.id} onClick={() => setExpanded(expanded === l.id ? null : l.id)} className="flex w-full flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-2 text-left text-sm hover:bg-zinc-50">
              <span className="w-36 shrink-0 text-xs text-zinc-400">{new Date(l.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLORS[l.action] ?? "bg-zinc-100"}`}>{l.action}</span>
              <span className="font-medium">{l.entity}</span>
              <span className="w-40 truncate font-mono text-xs text-zinc-400" title={l.entityId}>{l.entityId.slice(0, 14)}…</span>
              <span className="ml-auto text-xs text-zinc-500">{l.userEmail ?? "система"}</span>
              {expanded === l.id && (
                <div className="w-full space-y-1 rounded-lg bg-zinc-900 p-3 font-mono text-xs text-zinc-300">
                  <p><span className="text-red-400">old:</span> {l.oldValue ? JSON.stringify(l.oldValue, null, 1).slice(0, 500) : "—"}</p>
                  <p><span className="text-emerald-400">new:</span> {l.newValue ? JSON.stringify(l.newValue, null, 1).slice(0, 500) : "—"}</p>
                </div>
              )}
            </button>
          ))}
          {(data?.logs ?? []).length === 0 && <p className="py-8 text-center text-sm text-zinc-400">Журнал пуст</p>}
        </CardContent>
      </Card>
    </div>
  );
}
