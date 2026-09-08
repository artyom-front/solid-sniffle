"use client";

// ============================================================
// Массовый импорт из CSV — заявки игроков, персоны, команды,
// стадионы, клубы. 10 команд × 50 игроков руками — больше не надо.
//
// • Вставьте текст из Excel (разделитель ; , или таб) или загрузите CSV
// • «Проверить» — сухой прогон без записи: ошибки и дубли видны заранее
// • «Импортировать» — идемпотентно: повторы не создают дублей
// ============================================================

import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { FileSpreadsheet, FileUp, CheckCircle2, AlertTriangle, Loader2, CopyX, Plus, History } from "lucide-react";
import { apiPost, useFetch } from "./hooks";
import type { OverviewDTO } from "./types";
import { IMPORT_SPECS, templateText, IMPORT_RULES, type ImportEntity } from "@/lib/importTemplates";
import { cn } from "@/lib/utils";

const ENTITY_TABS: { id: ImportEntity; label: string }[] = [
  { id: "players", label: "Заявка (игроки+тренеры)" },
  { id: "persons", label: "Персоны" },
  { id: "teams", label: "Команды" },
  { id: "stadiums", label: "Стадионы" },
  { id: "clubs", label: "Клубы" },
];

/** Пример в поле ввода — из того же источника, что и скачиваемый шаблон */
const TEMPLATES: Record<ImportEntity, string> = {
  players: templateText("players"),
  persons: templateText("persons"),
  teams: templateText("teams"),
  stadiums: templateText("stadiums"),
  clubs: templateText("clubs"),
};

interface ImportRowResult {
  row: number;
  status: "created" | "updated" | "exists" | "error";
  name: string;
  message?: string;
}
interface ImportResult {
  ok: boolean;
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  exists: number;
  errors: number;
  rows: ImportRowResult[];
  team?: string | null;
}

export function ImportPanel({ bump, version, overview }: { bump: () => void; version: number; overview: OverviewDTO | null }) {
  const [entity, setEntity] = useState<ImportEntity>("players");
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [closePrevious, setClosePrevious] = useState(false);
  const [leagueId, setLeagueId] = useState("");
  const [seasonId, setSeasonId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const leagues = overview?.leagues ?? [];
  const league = leagues.find((l) => l.id === (leagueId || leagues[0]?.id));
  const seasons = league?.seasons ?? [];
  const effectiveSeasonId = seasonId || seasons.find((s) => s.isCurrent)?.id || seasons[0]?.id || "";

  const { data: teamsData } = useFetch<{ teams: { id: string; name: string }[] }>(entity === "players" ? "/api/admin/teams" : null, version);
  const teams = teamsData?.teams ?? [];

  const needsContext = entity === "players";
  const contextReady = !needsContext || (!!effectiveSeasonId && !!teamId);

  const run = async (dryRun: boolean) => {
    if (!csv.trim()) return toast.error("Вставьте данные или загрузите файл");
    if (!contextReady) return toast.error("Выберите лигу, сезон и команду");
    setBusy(true);
    const res = await apiPost<ImportResult>("/api/admin/import", {
      entity, csv, dryRun,
      ...(entity === "players" ? { seasonId: effectiveSeasonId, teamId, closePrevious } : {}),
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setResult(res.data ?? null);
    if (!dryRun) {
      toast.success(`Импорт: создано ${res.data?.created ?? 0}, пропущено ${res.data?.exists ?? 0}, ошибок ${res.data?.errors ?? 0}`);
      bump();
    } else {
      toast.info(`Проверка: будет создано ${res.data?.created ?? 0}, уже есть ${res.data?.exists ?? 0}, ошибок ${res.data?.errors ?? 0}`);
    }
  };

  const onFile = async (f: File) => {
    const text = await f.text();
    setCsv(text);
    setResult(null);
    toast.success(`Файл загружен: ${f.name}`);
  };

  const rowsForDisplay = useMemo(() => result?.rows.slice(0, 300) ?? [], [result]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Массовый импорт
          </h3>
          <p className="text-xs text-zinc-400">CSV из Excel или вставка текстом · идемпотентно (повторный импорт не создаёт дублей)</p>
        </div>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => setHistoryOpen(true)}>
          <History className="mr-1 h-3.5 w-3.5" /> Как подготовить файл
        </Button>
      </div>

      {/* ---------- Тип сущности ---------- */}
      <div className="flex flex-wrap gap-1.5">
        {ENTITY_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setEntity(t.id); setResult(null); }}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              entity === t.id ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- Контекст заявки ---------- */}
      {needsContext && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="mb-2 text-xs font-bold text-amber-800">Куда заявлять игроков</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={leagueId || leagues[0]?.id || ""}
              onChange={(e) => { setLeagueId(e.target.value); setSeasonId(""); }}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm"
              aria-label="Лига"
            >
              {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select
              value={effectiveSeasonId}
              onChange={(e) => setSeasonId(e.target.value)}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm"
              aria-label="Сезон"
            >
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? " (тек.)" : ""}</option>)}
            </select>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="h-8 min-w-44 rounded-md border border-zinc-200 bg-white px-2 text-sm"
              aria-label="Команда"
            >
              <option value="">— выберите команду —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-zinc-600">
              <Switch checked={closePrevious} onCheckedChange={setClosePrevious} />
              Закрыть предыдущие заявки (трансферы)
            </label>
          </div>
        </div>
      )}

      {/* ---------- Ввод данных ---------- */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUp className="mr-1 h-3.5 w-3.5" /> Загрузить CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }} />
          {/* Скачиваемый CSV-шаблон: BOM + «;» + строки-примеры — открывается в Excel */}
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/admin/import/template?type=${entity}`} download>
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Скачать шаблон CSV
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setCsv(TEMPLATES[entity]); setResult(null); }}>
            <CopyX className="mr-1 h-3.5 w-3.5" /> Пример в поле
          </Button>
          {csv && (
            <Button size="sm" variant="ghost" className="text-xs text-zinc-400" onClick={() => { setCsv(""); setResult(null); }}>
              Очистить
            </Button>
          )}
        </div>
        <Textarea
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setResult(null); }}
          rows={8}
          placeholder="Вставьте строки из Excel (Ctrl+V) — первая строка: заголовки колонок"
          className="font-mono text-xs"
        />
        <p className="text-xs text-zinc-400">
          {IMPORT_SPECS[entity].summary}
        </p>
      </div>

      {/* ---------- Кнопки ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy || !csv.trim()} onClick={() => run(true)}>
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
          Проверить (без записи)
        </Button>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy || !csv.trim() || !contextReady} onClick={() => run(false)}>
          <Plus className="mr-1 h-4 w-4" /> Импортировать
        </Button>
      </div>

      {/* ---------- Результат ---------- */}
      {result && (
        <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold">{result.dryRun ? "Проверка (ничего не записано)" : "Импорт выполнен"}</span>
            <Badge className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/10">создано {result.created}</Badge>
            <Badge className="bg-blue-600/10 text-blue-700 hover:bg-blue-600/10">обновлено {result.updated}</Badge>
            <Badge variant="secondary">уже есть {result.exists}</Badge>
            {result.errors > 0 && <Badge className="bg-red-600/10 text-red-700 hover:bg-red-600/10">ошибок {result.errors}</Badge>}
            <span className="text-xs text-zinc-400">из {result.total} строк</span>
          </div>
          {rowsForDisplay.length > 0 && (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-zinc-100">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-3 py-1.5 font-semibold">Стр.</th>
                    <th className="px-3 py-1.5 font-semibold">Имя</th>
                    <th className="px-3 py-1.5 font-semibold">Статус</th>
                    <th className="px-3 py-1.5 font-semibold">Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForDisplay.map((r) => (
                    <tr key={r.row} className={cn("border-t border-zinc-50", r.status === "error" && "bg-red-50/50")}>
                      <td className="px-3 py-1.5 font-mono text-zinc-400">{r.row}</td>
                      <td className="px-3 py-1.5 font-medium text-zinc-700">{r.name || "—"}</td>
                      <td className="px-3 py-1.5">
                        {r.status === "created" && <Badge className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/10">создано</Badge>}
                        {r.status === "updated" && <Badge className="bg-blue-600/10 text-blue-700 hover:bg-blue-600/10">обновлено</Badge>}
                        {r.status === "exists" && <Badge variant="secondary">уже есть</Badge>}
                        {r.status === "error" && <Badge variant="destructive">ошибка</Badge>}
                      </td>
                      <td className="px-3 py-1.5 text-zinc-500">{r.message ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.rows.length > 300 && (
            <p className="text-xs text-zinc-400">Показаны первые 300 строк из {result.rows.length}</p>
          )}
        </div>
      )}

      {/* ---------- Инструкция ---------- */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Как подготовить файл: {IMPORT_SPECS[entity].label.toLowerCase()}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm text-zinc-600">
            {/* Сводка + таблица колонок текущей сущности */}
            <p className="text-xs leading-relaxed text-zinc-500">{IMPORT_SPECS[entity].summary}</p>
            <div className="overflow-hidden rounded-lg border border-zinc-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="px-2.5 py-1.5 font-semibold">Колонка</th>
                    <th className="px-2.5 py-1.5 font-semibold">Обяз.</th>
                    <th className="px-2.5 py-1.5 font-semibold">Формат и что вносить</th>
                    <th className="px-2.5 py-1.5 font-semibold">Пример</th>
                  </tr>
                </thead>
                <tbody>
                  {IMPORT_SPECS[entity].fields.map((f) => (
                    <tr key={f.name} className="border-t border-zinc-100">
                      <td className="px-2.5 py-1.5 font-semibold text-zinc-700">{f.name}</td>
                      <td className="px-2.5 py-1.5">
                        {f.required ? (
                          <span className="font-bold text-red-600">да</span>
                        ) : (
                          <span className="text-zinc-400">нет</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-zinc-500">{f.format}</td>
                      <td className="px-2.5 py-1.5 font-mono text-[11px] text-zinc-600">{f.example || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed">
              {IMPORT_RULES.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ol>
            <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-700">
              Совет: заявка ветеранов на 50 человек вводится за один раз. Сначала создайте клубы и команды (импорт «Клубы»/«Команды»), затем стадионы, и только потом заявите каждую команду отдельным импортом «Заявка».
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
