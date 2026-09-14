"use client";

// ============================================================
// SmartDelete — умная кнопка удаления сущности из списка.
//
// Прежняя проблема: DELETE возвращал 409 с текстом-тупиком
// («нельзя удалить, удалите заявки») — а инструмента удалить эти
// заявки не существовало. Теперь API отдаёт структуру:
//   { code, dependencies: {…}, cascadeAllowed }
// и кнопка сама предлагает ПУТЬ РЕШЕНИЯ:
//   • cascadeAllowed → «Удалить вместе с N заявками» (второе подтверждение)
//   • есть карточка → «Открыть карточку» (там видны зависимости)
//   • история матчей → понятное объяснение, что делать
// ============================================================

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { apiPost } from "./hooks";

interface BlockInfo {
  code?: string;
  dependencies?: Record<string, number>;
  cascadeAllowed?: boolean;
}

/** Человекочитаемые названия зависимостей */
const DEP_LABELS: Record<string, [string, string, string]> = {
  matches: ["матч", "матча", "матчей"],
  registrations: ["заявка", "заявки", "заявок"],
  events: ["событие", "события", "событий"],
  lineups: ["матч в составе", "матча в составе", "матчей в составе"],
  suspensions: ["дисквалификация", "дисквалификации", "дисквалификаций"],
  ratings: ["оценка судейства", "оценки судейства", "оценок судейства"],
};

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function depsList(deps: Record<string, number>): string {
  return Object.entries(deps)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => {
      const forms = DEP_LABELS[k];
      return forms ? `${n} ${plural(n, forms)}` : `${k}: ${n}`;
    })
    .join(", ");
}

interface Props {
  /** URL DELETE-эндпоинта, например /api/admin/teams/<id> */
  endpoint: string;
  /** Название сущности для текстов: «Команда «Урняк» удалена» */
  entityLabel: string;
  /** Что удаляем — для заголовка диалога */
  title?: string;
  /** Вызывается после успешного удаления (bump + onReload) */
  onDone: () => void;
  /** Куда «провалиться», если сущность заблокирована зависимостями */
  onOpenDetail?: () => void;
  labelOpenDetail?: string;
}

export function SmartDelete({ endpoint, entityLabel, title = "Удаление", onDone, onOpenDetail, labelOpenDetail = "Открыть карточку" }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [blocked, setBlocked] = useState<{ message: string; info: BlockInfo } | null>(null);
  const [busy, setBusy] = useState(false);

  const doDelete = async (cascade: boolean) => {
    setBusy(true);
    const res = await apiPost<{ code?: string; dependencies?: Record<string, number>; cascadeAllowed?: boolean }>(
      endpoint,
      cascade ? { cascade: true } : {},
      "DELETE"
    );
    setBusy(false);
    if (!res.ok) {
      // Структурированный 409: показываем диалог с путём решения
      const info = res.data ?? {};
      if (info.code || info.dependencies) {
        setBlocked({ message: res.error ?? "Нельзя удалить", info });
        setConfirming(false);
      } else {
        toast.error(res.error, { duration: 7000 });
      }
      return;
    }
    toast.success(`${entityLabel} удалён(а)`);
    setConfirming(false);
    setBlocked(null);
    onDone();
  };

  const cascadeDeps = blocked?.info.dependencies?.registrations ?? 0;

  return (
    <>
      {confirming ? (
        <span className="flex items-center gap-1">
          <Button variant="destructive" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => doDelete(false)}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Точно"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setConfirming(false)}>Нет</Button>
        </span>
      ) : (
        <Button
          variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-red-600"
          onClick={() => setConfirming(true)} aria-label={`Удалить: ${entityLabel}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}

      {/* ---- Диалог «нельзя удалить»: зависимости + путь решения ---- */}
      <Dialog open={!!blocked} onOpenChange={(o) => !o && setBlocked(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" /> {title}: что мешает
            </DialogTitle>
          </DialogHeader>
          {blocked && (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-zinc-600">{blocked.message}</p>
              {blocked.info.dependencies && (
                <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                  <span className="font-semibold text-zinc-600">Зависимости:</span> {depsList(blocked.info.dependencies) || "нет"}
                </div>
              )}

              {blocked.info.cascadeAllowed && cascadeDeps > 0 && (
                <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-semibold text-red-800">
                    Удалить вместе с {cascadeDeps} {plural(cascadeDeps, DEP_LABELS.registrations)}?
                  </p>
                  <p className="text-xs leading-relaxed text-red-600">
                    Турнирной истории нет — удаление безопасно. Состав исчезнет из сезонов, матчи и события не затрагиваются (их нет).
                  </p>
                  <Button variant="destructive" size="sm" disabled={busy} onClick={() => doDelete(true)}>
                    {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1 h-3.5 w-3.5" />}
                    Удалить {entityLabel.toLowerCase()} и {cascadeDeps} {plural(cascadeDeps, DEP_LABELS.registrations)}
                  </Button>
                </div>
              )}

              {onOpenDetail && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => { setBlocked(null); onOpenDetail(); }}>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> {labelOpenDetail} — там видно всё и есть действия
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlocked(null)}>Понятно, не удалять</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
