"use client";

// Виджет загрузки фото/файла в медиатеку (/api/admin/media).
// Используется в формах персон, команд, клубов, стадионов, баннеров и протоколов.
// value = "/api/media/<id>" | "" — совместимо с полями logoUrl/photoUrl/imageUrl.

import { useRef, useState } from "react";
import { Loader2, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  accept?: string;
  round?: boolean;
  className?: string;
  previewAlt?: string;
}

export function MediaUpload({ value, onChange, label = "Фото", hint, accept = "image/*", round, className, previewAlt }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/admin/media", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j?.error || `Ошибка загрузки (${r.status})`);
        return;
      }
      onChange(j.url as string);
      toast.success("Файл загружен");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Сетевая ошибка");
    } finally {
      setUploading(false);
    }
  };

  const isImage = value.startsWith("/api/media/") && (accept === "image/*" || value.match(/\.(webp|png|jpe?g)/i));

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative shrink-0">
            {isImage ? (
               
              <img
                src={value}
                alt={previewAlt ?? "Загруженное изображение"}
                className={cn("h-16 w-16 border border-zinc-200 bg-white object-cover", round ? "rounded-full" : "rounded-lg")}
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-xs text-zinc-400">Файл</span>
            )}
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm hover:border-red-300 hover:text-red-600"
              aria-label="Убрать файл"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void upload(f);
            }}
            disabled={uploading}
            className={cn(
              "flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-zinc-400 transition-colors hover:border-emerald-400 hover:text-emerald-600",
              dragOver && "border-emerald-400 bg-emerald-50 text-emerald-600",
              round && "rounded-full"
            )}
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
            <span className="text-[10px] font-medium leading-none">{uploading ? "Загрузка…" : "Загрузить"}</span>
          </button>
        )}
        <div className="min-w-0 flex-1 text-xs text-zinc-500">
          <p className="font-semibold text-zinc-600">{label}</p>
          {hint && <p className="text-zinc-400">{hint}</p>}
          {value ? (
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs text-zinc-400" onClick={() => inputRef.current?.click()}>
              Заменить
            </Button>
          ) : null}
        </div>
      </div>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void upload(f);
        e.target.value = "";
      }} />
    </div>
  );
}
