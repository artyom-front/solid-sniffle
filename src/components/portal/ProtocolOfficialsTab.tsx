"use client";

// ============================================================
// SCORESBOX · ProtocolOfficialsTab — вкладка «Бригада» редактора
// протокола (выделена из ProtocolEditor в v1.0.30).
//  • черновик строк поверх данных из БД (синхронизация PATCH'ем
//    массивом): «+» — новая строка, «✕» — убрать;
//  • роли: помощники, резервный, VAR/AVAR, инспектор, делегат, врач;
//  • одна персона — одна роль; главный судья завершённого матча
//    не снимается (инвариант);
//  • REFEREE видит заглушку: бригаду назначают администраторы.
// ============================================================

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Flag } from "lucide-react";
import { toast } from "sonner";
import { MATCH_OFFICIAL_ROLES } from "@/lib/roles";
import { apiPost } from "./hooks";
import { type OfficialsRow, type ProtocolTabProps } from "./protocol-shared";

interface Props extends ProtocolTabProps {
  /** роль текущего пользователя: REFEREE — только ввод протокола */
  userRole: string;
}

export default function ProtocolOfficialsTab({ matchId, data, userRole, onReload }: Props) {
  const m = data.match;

  // бригада: черновик строк (синхронизируется PATCH'ем массивом).
  // null = брать из БД; любые правки = локальный черновик.
  // Сброс черновика при перезагрузке данных делает ОБОЛОЧКА:
  // <ProtocolOfficialsTab key={version} …> — ремаунт на reload.
  const [officialsDraft, setOfficialsDraft] = useState<OfficialsRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  // ---------- строки бригады поверх данных из БД ----------
  const officialsRows = useMemo(() => {
    if (officialsDraft) return officialsDraft;
    const rows: OfficialsRow[] = [];
    if (data.match.referee) rows.push({ role: "REFEREE", personId: data.match.referee.id });
    for (const o of data.officials) {
      if (o.role === "REFEREE" && data.match.referee?.id === o.person.id) continue;
      rows.push({ role: o.role, personId: o.person.id });
    }
    return rows;
  }, [data, officialsDraft]);

  const officialsDirty = useMemo(() => {
    if (!officialsDraft) return false;
    const saved: OfficialsRow[] = [];
    if (data.match.referee) saved.push({ role: "REFEREE", personId: data.match.referee.id });
    for (const o of data.officials) saved.push({ role: o.role, personId: o.person.id });
    const key = (r: OfficialsRow) => `${r.role}:${r.personId}`;
    const a = new Set(saved.map(key));
    const b = new Set(officialsDraft.map(key));
    if (a.size !== b.size) return true;
    for (const k of a) if (!b.has(k)) return true;
    return false;
  }, [data, officialsDraft]);

  async function saveOfficials() {
    const rows = officialsRows.filter((r) => r.personId && r.role);
    const hasReferee = rows.some((r) => r.role === "REFEREE");
    if (data.match.status === "COMPLETED" && !hasReferee && data.match.referee) {
      // не критично: PATCH синхронизирует refereeId=null — но завершённому
      // матчу главный судья нужен по инварианту; предупредим
      toast.error("У завершённого матча нельзя снимать главного судью");
      return;
    }
    setBusy(true);
    const res = await apiPost(`/api/admin/matches/${matchId}`, { officials: rows }, "PATCH");
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error, { duration: 7000 });
      return;
    }
    toast.success(`Бригада сохранена (${rows.length} чел.)`);
    onReload();
  }

  if (userRole === "REFEREE") {
    return (
      <Card className="border-zinc-200">
        <CardContent className="py-6 text-sm text-zinc-400">Бригаду назначают администраторы лиги. Вам доступен ввод протокола.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Flag className="h-4 w-4 text-emerald-600" /> Судейская бригада и официальные лица</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-zinc-500">
          «+» — добавить строку (помощник судьи, VAR, инспектор, делегат, врач — сколько нужно: у детских матчей часто только главный судья, у взрослых — два помощника).
          «✕» — убрать лишнюю. Один человек — одна роль: главный судья не может быть сам себе помощником. Нейтральные лица не могут быть заявлены за команды-участницы.
        </p>

        <div className="space-y-2">
          {officialsRows.map((row, i) => {
            const canRemove = row.role !== "REFEREE" || !m.referee || m.status !== "COMPLETED";
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2">
                <Select
                  value={row.role}
                  onValueChange={(v) => {
                    const next = [...officialsRows];
                    next[i] = { ...next[i], role: v };
                    setOfficialsDraft(next);
                  }}
                >
                  <SelectTrigger className="h-9 w-56 bg-white text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATCH_OFFICIAL_ROLES.map((r) => (
                      <SelectItem key={r.code} value={r.code}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={row.personId || undefined}
                  onValueChange={(v) => {
                    const next = [...officialsRows];
                    next[i] = { ...next[i], personId: v };
                    setOfficialsDraft(next);
                  }}
                >
                  <SelectTrigger className="h-9 min-w-48 flex-1 bg-white text-sm"><SelectValue placeholder="Выбрать персону" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {data.referees.map((r) => {
                      // одна роль на персону: главный судья не может быть сам
                      // себе помощником — занятые в других строках блокируются
                      const taken = officialsRows.some((o, j) => j !== i && o.personId === r.id);
                      return (
                        <SelectItem key={r.id} value={r.id} disabled={taken}>
                          {r.name}{taken ? " — уже в бригаде" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => setOfficialsDraft(officialsRows.filter((_, j) => j !== i))}
                  disabled={!canRemove}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                  title={canRemove ? "Убрать из бригады" : "Главный судья завершённого матча не снимается"}
                  aria-label="Убрать из бригады"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            onClick={() => setOfficialsDraft([...officialsRows, { role: "ASSISTANT_REFEREE", personId: "" }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Добавить официальное лицо
          </Button>
          <Button
            size="sm" className={officialsDirty ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}
            disabled={busy || officialsRows.some((r) => !r.personId)}
            onClick={saveOfficials}
          >
            {officialsDirty ? "Сохранить бригаду" : "Бригада актуальна"}
          </Button>
          {officialsDirty && <span className="text-xs font-medium text-amber-600">есть несохранённые изменения</span>}
        </div>
      </CardContent>
    </Card>
  );
}
