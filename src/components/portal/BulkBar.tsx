"use client";

// ============================================================
// BulkBar — панель массовых действий для списков админки.
// Чекбокс «Выбрать все» + счётчик + массовое удаление с отчётом
// (заблокированные сущности пропускаются с причиной).
// ============================================================

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckSquare, Square, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { apiPost } from "./hooks";

interface Props<T extends { id: string }> {
  items: T[];
  selected: Set<string>;
  onSelect: (ids: Set<string>) => void;
  /** эндпоинт коллекции с action: "bulk-delete" (POST) */
  endpoint: string;
  /** что удаляем — для текстов: «Персоны», «Команды», «Матчи» */
  entityLabel: string;
  onDone: () => void;
  disabled?: boolean;
}

export function BulkBar<T extends { id: string }>({ items, selected, onSelect, endpoint, entityLabel, onDone, disabled }: Props<T>) {
  const [busy, setBusy] = useState(false);
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  const toggleAll = () => onSelect(allSelected ? new Set() : new Set(items.map((i) => i.id)));

  const bulkDelete = async (cascade: boolean) => {
    if (selected.size === 0) return;
    setBusy(true);
    const res = await apiPost<{ deleted: number; blocked: { id: string; label: string; reason: string }[] }>(endpoint, {
      action: "bulk-delete", ids: [...selected], cascade,
    });
    setBusy(false);
    if (!res.ok) {
      const blockedByRegs = (res.data as { dependencies?: { registrations?: number } } | undefined)?.dependencies?.registrations ?? 0;
      if (blockedByRegs > 0 && confirm(`У выбранных есть заявки состава (${blockedByRegs}). Удалить вместе с заявками?`)) {
        return void bulkDeleteWithCascade();
      }
      toast.error(res.error, { duration: 7000 });
      return;
    }
    const blocked = res.data?.blocked ?? [];
    toast.success(`Удалено: ${res.data?.deleted ?? 0}${blocked.length ? ` · пропущено: ${blocked.length}` : ""}`);
    if (blocked.length > 0) {
      toast.info(`Пропущены: ${blocked.slice(0, 3).map((b) => `${b.label} (${b.reason})`).join("; ")}${blocked.length > 3 ? "…" : ""}`, { duration: 9000 });
    }
    onSelect(new Set());
    onDone();
  };

  const bulkDeleteWithCascade = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    const res = await apiPost<{ deleted: number; blocked: { id: string; label: string; reason: string }[] }>(endpoint, {
      action: "bulk-delete", ids: [...selected], cascade: true,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error, { duration: 7000 });
    const blocked = res.data?.blocked ?? [];
    toast.success(`Удалено: ${res.data?.deleted ?? 0}${blocked.length ? ` · пропущено: ${blocked.length}` : ""}`);
    onSelect(new Set());
    onDone();
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2", disabled && "opacity-50")}>
      <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-emerald-700" disabled={disabled}>
        {allSelected ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-zinc-300" />}
        {allSelected ? "Снять выделение" : "Выбрать все"}
      </button>
      <span className="text-xs text-zinc-300">·</span>
      <span className="text-xs text-zinc-400">{items.length} записей</span>
      {selected.size > 0 && (
        <>
          <span className="text-xs font-semibold text-emerald-700">выбрано: {selected.size}</span>
          <Button
            size="sm" variant="outline"
            className="ml-auto h-7 border-red-200 px-2 text-xs text-red-600 hover:bg-red-50"
            disabled={busy || disabled}
            onClick={() => {
              if (confirm(`Удалить выбранные ${entityLabel} (${selected.size})?\nСущности с турнирной историей будут пропущены — удалится только безопасное.`)) {
                void bulkDelete(false);
              }
            }}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Удалить выбранные ({selected.size})
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-zinc-400" disabled={busy} onClick={() => onSelect(new Set())}>
            Отменить
          </Button>
        </>
      )}
    </div>
  );
}

/** Чекбокс строки списка */
export function RowCheckbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
      aria-label={label ?? (checked ? "Снять выделение" : "Выбрать")}
    >
      {checked ? <CheckSquare className="h-4 w-4 text-emerald-600" /> : <Square className="h-4 w-4 text-zinc-300 hover:text-zinc-400" />}
    </button>
  );
}
