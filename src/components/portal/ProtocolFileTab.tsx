"use client";

// ============================================================
// SCORESBOX · ProtocolFileTab — вкладка «Файл протокола»
// редактора (выделена из ProtocolEditor в v1.0.30).
// Скан/фото/PDF бумажного протокола: загрузка в медиатеку
// (sharp → WebP, до 10 МБ) и привязка к матчу. Файл виден
// с карточки матча на сайте.
// ============================================================

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiPost } from "./hooks";
import type { ProtocolTabProps } from "./protocol-shared";

export default function ProtocolFileTab({ matchId, data, onReload }: ProtocolTabProps) {
  const m = data.match;
  const [fileUploading, setFileUploading] = useState(false);

  /** Загрузка файла бумажного протокола (фото/PDF) в медиатеку и привязка к матчу */
  async function uploadProtocolFile(file: File) {
    setFileUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/admin/media", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j?.error || `Ошибка загрузки (${r.status})`); return; }
      const res = await apiPost(`/api/admin/matches/${matchId}`, {
        action: "protocol", protocolUrl: j.url, protocolFileName: file.name,
      });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Файл протокола прикреплён");
      onReload();
    } finally {
      setFileUploading(false);
    }
  }

  async function removeProtocolFile() {
    setFileUploading(true);
    try {
      const res = await apiPost(`/api/admin/matches/${matchId}`, { action: "protocol", protocolUrl: null, protocolFileName: null });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success("Файл протокола откреплён");
      onReload();
    } finally {
      setFileUploading(false);
    }
  }

  return (
    <Card className="border-zinc-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4 text-emerald-600" /> Бумажный протокол: скан или фото</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-zinc-500">
          Загрузите фото протокола или PDF (до 10 МБ). Файл хранится в базе, доступен с карточки матча на сайте и из любой точки админки.
          Ввод данных (составы, события) остаётся ручным — на вкладках выше; в будущем файл можно будет распарсить автоматически.
        </p>
        {m.protocolUrl ? (
          <div className="space-y-3">
            {m.protocolFileName?.toLowerCase().endsWith(".pdf") ? (
              <a href={m.protocolUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 hover:border-emerald-300">
                <FileText className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-zinc-800">{m.protocolFileName ?? "Протокол.pdf"}</p>
                  <p className="text-xs text-zinc-400">Открыть в новой вкладке</p>
                </div>
              </a>
            ) : (
              <div className="space-y-2">
                <img src={m.protocolUrl} alt="Скан протокола" className="max-h-[480px] w-full rounded-xl border border-zinc-200 object-contain" />
                <a href={m.protocolUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">Открыть оригинал →</a>
              </div>
            )}
            <Button size="sm" variant="outline" disabled={fileUploading} onClick={removeProtocolFile}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Открепить файл
            </Button>
          </div>
        ) : (
          <label className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50/60 py-10 text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-600",
            fileUploading && "opacity-60"
          )}>
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              disabled={fileUploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadProtocolFile(f);
                e.target.value = "";
              }}
            />
            {fileUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
            <span className="text-sm font-semibold">{fileUploading ? "Загрузка…" : "Выбрать файл или перетащить сюда"}</span>
            <span className="text-xs">JPG, PNG, WebP или PDF · до 10 МБ</span>
          </label>
        )}
      </CardContent>
    </Card>
  );
}
