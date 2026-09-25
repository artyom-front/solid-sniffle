"use client";

// Админ-панели контента сайта (v1.0.29), группа «Сайт»:
//   • StatBlocksPanel — редакционные стат-карточки правой колонки с
//     опциональным фото (фото бомбардира, лого клуба). На сайте карточка
//     ВСЕГДА бокс h-[120px]: добавление фото не меняет разметку (анти-CLS).
//   • FormatsPanel — виды футбола в меню сайта: добавить/убрать/
//     переименовать/скрыть/сортировать (стандарт 11×11, футзал 5×5,
//     ЛФЛ 8×8 и разновидности — по ситуации).

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BarChart3, Pencil, Plus, Shapes, Eye, EyeOff } from "lucide-react";
import { apiPost, useFetch } from "./hooks";
import { EmptyState, LoadingBlock } from "./ui-bits";
import { Field, DeleteBtn } from "./CrudPanels";
import { MediaUpload } from "./MediaUpload";
import { cn } from "@/lib/utils";

interface CrudProps {
  bump: () => void;
  onReload: () => void;
  version?: number;
}

// ============================================================
// Стат-карточки
// ============================================================

interface AdminStatBlock {
  id: string; title: string; text: string | null; value: string | null;
  imageUrl: string | null; linkUrl: string | null;
  imageFit: string | null; imagePos: string | null;
  isActive: boolean; priority: number;
}

type StatForm = {
  id?: string; title: string; text: string; value: string; linkUrl: string; imageUrl: string;
  imageFit: string; imagePos: string; isActive: boolean; priority: number;
};

const EMPTY_STAT_FORM: StatForm = {
  title: "", text: "", value: "", linkUrl: "", imageUrl: "",
  imageFit: "cover", imagePos: "center", isActive: true, priority: 0,
};

/** Предпросмотр «как на сайте»: тёмная карточка фиксированной высоты 120px */
function StatBlockPreview({ form }: { form: StatForm }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="relative mx-auto h-[120px] w-full max-w-[300px] bg-zinc-900">
        {form.imageUrl ? (
          <img
            src={form.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: form.imageFit === "contain" ? "contain" : "cover", objectPosition: form.imagePos || "center" }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-amber-100/10 to-transparent" />
        )}
        <div className={cn(
          "absolute inset-0 flex flex-col gap-1 overflow-hidden p-3",
          form.imageUrl ? "justify-end bg-gradient-to-t from-zinc-950/95 via-zinc-950/55 to-transparent" : "justify-center"
        )}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-400">
            {form.title || "Заголовок карточки"}
          </p>
          {form.value && (
            <p className="font-mono text-2xl font-black leading-none text-white">
              {form.value}
              {form.text && <span className="ml-1.5 font-sans text-xs font-semibold text-zinc-300">{form.text}</span>}
            </p>
          )}
          {!form.value && form.text && <p className="text-xs font-semibold text-white">{form.text}</p>}
        </div>
      </div>
      <p className="border-t border-zinc-100 px-3 py-1.5 text-[11px] text-zinc-400">
        Так карточка выглядит в правой колонке сайта · размер всегда 120px — с фото и без (интерфейс не прыгает) · картинка ~260×120+
      </p>
    </div>
  );
}

export function StatBlocksPanel({ bump, onReload, version = 0 }: CrudProps) {
  const { data, loading } = useFetch<{ statBlocks: AdminStatBlock[] }>("/api/admin/statblocks", version);
  const [form, setForm] = useState<StatForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    if (!form) return;
    if (uploading) return toast.error("Картинка ещё грузится — одна секунда…");
    setSaving(true);
    const res = await apiPost(form.id ? `/api/admin/statblocks/${form.id}` : "/api/admin/statblocks", {
      title: form.title, text: form.text || null, value: form.value || null,
      linkUrl: form.linkUrl || null, imageUrl: form.imageUrl || null,
      imageFit: form.imageUrl ? form.imageFit : null, imagePos: form.imageUrl ? form.imagePos : null,
      isActive: form.isActive, priority: form.priority,
    }, form.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(form.id ? "Карточка обновлена" : "Карточка создана");
    setForm(null);
    bump();
    onReload();
  };

  const blocks = data?.statBlocks ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold"><BarChart3 className="h-4 w-4 text-emerald-600" /> Стат-карточки</h3>
          <p className="text-xs text-zinc-400">Правая колонка сайта: «Бомбардир тура» с фото игрока, «Клуб недели» с лого · размер карточки фиксирован — интерфейс не прыгает</p>
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setForm({ ...EMPTY_STAT_FORM })}>
          <Plus className="mr-1 h-4 w-4" /> Карточка
        </Button>
      </div>

      {loading && !data && <LoadingBlock />}
      {blocks.length === 0 && !loading && (
        <EmptyState title="Карточек нет" hint="Создайте первую: заголовок, цифра и фото (например, лучший бомбардир тура) — карточка появится в правой колонке" />
      )}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {blocks.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
            {b.imageUrl ? (
              <img src={b.imageUrl} alt="" className="h-8 w-14 rounded border border-zinc-200 object-cover" />
            ) : (
              <BarChart3 className="h-4 w-4 shrink-0 text-amber-400" />
            )}
            <span className="font-semibold text-zinc-800">{b.title}</span>
            {b.value && <Badge variant="outline" className="font-mono text-zinc-600">{b.value}</Badge>}
            {b.text && <span className="hidden text-xs text-zinc-400 sm:inline">{b.text}</span>}
            {!b.isActive && <Badge variant="secondary" className="bg-zinc-100 text-zinc-400">выключена</Badge>}
            <span className="ml-auto text-xs text-zinc-400">приоритет {b.priority}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600"
              onClick={() => setForm({
                id: b.id, title: b.title, text: b.text ?? "", value: b.value ?? "", linkUrl: b.linkUrl ?? "",
                imageUrl: b.imageUrl ?? "", imageFit: b.imageFit ?? "cover", imagePos: b.imagePos ?? "center",
                isActive: b.isActive, priority: b.priority,
              })}
              aria-label="Редактировать"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <DeleteBtn onClick={async () => {
              const res = await apiPost(`/api/admin/statblocks/${b.id}`, null, "DELETE");
              if (!res.ok) return toast.error(res.error);
              toast.success("Карточка удалена");
              bump();
              onReload();
            }} />
          </div>
        ))}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{form?.id ? "Редактировать карточку" : "Новая стат-карточка"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <StatBlockPreview form={form} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Заголовок" hint="«Бомбардир тура», «Клуб недели»"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Бомбардир тура" /></Field>
                <Field label="Цифра" hint="Крупно: «12», «+7»"><Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="12" /></Field>
                <Field label="Подпись" hint="Рядом с цифрой или вместо неё"><Input value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="голов · Иванов («Заря»)" /></Field>
                <Field label="Ссылка" hint="/player/…, /team/… или https://"><Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/player/abc123" /></Field>
                <Field label="Приоритет (0–100)" hint="Меньше — выше в колонке"><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></Field>
                <div className="flex items-center gap-2">
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                  <span className="text-sm text-zinc-600">Активна</span>
                </div>
                <div className="col-span-2">
                  <MediaUpload
                    value={form.imageUrl}
                    onChange={(url) => setForm((f) => (f ? { ...f, imageUrl: url } : f))}
                    onUploadingChange={setUploading}
                    label="Фото/картинка (опционально)"
                    hint="Фото игрока, лого клуба — загрузите с диска. Без картинки карточка останется текстовой ТОГО ЖЕ размера"
                  />
                </div>
                {form.imageUrl && (
                  <>
                    <Field label="Масштаб картинки">
                      <select value={form.imageFit} onChange={(e) => setForm({ ...form, imageFit: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                        <option value="cover">Заполнить (обрезать края)</option>
                        <option value="contain">Вписать целиком</option>
                      </select>
                    </Field>
                    <Field label="Позиция картинки">
                      <select value={form.imagePos} onChange={(e) => setForm({ ...form, imagePos: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                        <option value="center">По центру</option>
                        <option value="top">Сверху</option>
                        <option value="bottom">Снизу</option>
                      </select>
                    </Field>
                  </>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            <Button disabled={saving || uploading} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">
              {uploading ? "Загрузка картинки…" : form?.id ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Виды футбола (меню сайта)
// ============================================================

interface AdminFormatLink {
  id: string; code: string; label: string;
  sortOrder: number; isVisible: boolean;
  leagueCount: number; builtin: boolean;
}

type FormatForm = { id?: string; code: string; label: string; sortOrder: number; isVisible: boolean };

const EMPTY_FORMAT_FORM: FormatForm = { code: "", label: "", sortOrder: 50, isVisible: true };

export function FormatsPanel({ bump, onReload, version = 0 }: CrudProps) {
  const { data, loading } = useFetch<{ formats: AdminFormatLink[] }>("/api/admin/formats", version);
  const [form, setForm] = useState<FormatForm | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const res = await apiPost(form.id ? `/api/admin/formats/${form.id}` : "/api/admin/formats", {
      code: form.code, label: form.label, sortOrder: form.sortOrder, isVisible: form.isVisible,
    }, form.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(form.id ? "Формат обновлён" : "Формат добавлен");
    setForm(null);
    bump();
    onReload();
  };

  const toggleVisible = async (f: AdminFormatLink) => {
    const res = await apiPost(`/api/admin/formats/${f.id}`, { isVisible: !f.isVisible }, "PATCH");
    if (!res.ok) return toast.error(res.error);
    toast.success(!f.isVisible ? `«${f.label}» показана в меню` : `«${f.label}» скрыта из меню`);
    bump();
    onReload();
  };

  const formats = data?.formats ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold"><Shapes className="h-4 w-4 text-emerald-600" /> Виды футбола — меню сайта</h3>
          <p className="text-xs text-zinc-400">Ссылки под шапкой: «Футбол, 8×8, 6×6, Мини-футбол» · добавляйте и скрывайте форматы по ситуации</p>
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setForm({ ...EMPTY_FORMAT_FORM })}>
          <Plus className="mr-1 h-4 w-4" /> Формат
        </Button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs leading-relaxed text-amber-800">
        <b>Как это работает.</b> Ссылка в меню фильтрует главную ленту по формату лиг (код = формату лиги).
        Скрытая или удалённая ссылка НЕ удаляет лиги: они остаются на сайте и собираются в сайдбаре в группу «Другие форматы».
        Новый формат сначала добавьте здесь, затем выберите его при создании лиги. Лимит стартового состава для кастомных форматов — 11 (как у товарняков, с предупреждением в протоколе).
      </div>

      {loading && !data && <LoadingBlock />}
      {formats.length === 0 && !loading && (
        <EmptyState title="Список форматов пуст" hint="Добавьте базовые: F11 «Футбол», FUTSAL «Мини-футбол», F8 «8×8»…" />
      )}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {formats.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
            <span className="inline-flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600"
                onClick={() => toggleVisible(f)}
                aria-label={f.isVisible ? "Скрыть из меню" : "Показать в меню"}
                title={f.isVisible ? "Скрыть из меню" : "Показать в меню"}
              >
                {f.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              <span className="font-semibold text-zinc-800">{f.label}</span>
            </span>
            <Badge variant="outline" className="font-mono text-zinc-500">{f.code}</Badge>
            <span className="text-xs text-zinc-400">{f.leagueCount} лиг</span>
            {f.builtin && <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">базовый</Badge>}
            {!f.isVisible && <Badge variant="secondary" className="bg-zinc-100 text-zinc-400">скрыт</Badge>}
            <span className="ml-auto text-xs text-zinc-400">порядок {f.sortOrder}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600"
              onClick={() => setForm({ id: f.id, code: f.code, label: f.label, sortOrder: f.sortOrder, isVisible: f.isVisible })}
              aria-label="Редактировать"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <DeleteBtn onClick={async () => {
              const res = await apiPost(`/api/admin/formats/${f.id}`, null, "DELETE");
              if (!res.ok) return toast.error(res.error);
              toast.success("Формат убран из списка (лиги не тронуты)");
              bump();
              onReload();
            }} />
          </div>
        ))}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{form?.id ? "Редактировать формат" : "Новый вид футбола"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Код" hint="Как у лиг: F11, F8, FUTSAL, F7, LFL_8">
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })}
                  placeholder="F7"
                  disabled={!!form.id}
                  className="font-mono uppercase"
                />
              </Field>
              <Field label="Подпись в меню" hint="«7×7», «ЛФЛ 8×8»">
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="7×7" />
              </Field>
              <Field label="Порядок (0–1000)" hint="Меньше — левее в меню"><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></Field>
              <div className="flex items-center gap-2">
                <Switch checked={form.isVisible} onCheckedChange={(v) => setForm({ ...form, isVisible: v })} />
                <span className="text-sm text-zinc-600">Показывать в меню</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            <Button disabled={saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">{form?.id ? "Сохранить" : "Добавить"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
