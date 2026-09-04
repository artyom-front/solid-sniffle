"use client";

// CRUD-панели админки (часть 2): персоны (игроки/тренеры/судьи), стадионы, баннеры.

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, MapPin, Megaphone, Flag } from "lucide-react";
import { apiPost, useFetch } from "./hooks";
import { EmptyState, LoadingBlock } from "./ui-bits";
import { Field, DeleteBtn } from "./CrudPanels";

interface CrudProps {
  bump: () => void;
  onReload: () => void;
}

// ============================================================
// Персоны: игроки / тренеры / судьи
// ============================================================

interface AdminPerson {
  id: string; name: string; position: string | null; isReferee: boolean;
  teams: string[];
}

const emptyPerson = { firstName: "", lastName: "", middleName: "", position: "", birthDate: "", isReferee: false };

export function PeoplePanel({ bump, onReload }: CrudProps) {
  const [q, setQ] = useState("");
  const [form, setForm] = useState<(typeof emptyPerson) & { id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, loading } = useFetch<{ persons: AdminPerson[] }>(`/api/admin/persons${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const res = await apiPost(form.id ? `/api/admin/persons/${form.id}` : "/api/admin/persons", {
      firstName: form.firstName, lastName: form.lastName, middleName: form.middleName || null,
      position: form.position || null, birthDate: form.birthDate || null, isReferee: form.isReferee,
    }, form.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(form.id ? "Профиль обновлён" : "Персона создана");
    setForm(null);
    bump();
    onReload();
  };

  const persons = (data?.persons ?? []).slice(0, 100);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold"><Users className="h-4 w-4 text-emerald-600" /> Люди</h3>
          <p className="text-xs text-zinc-400">Игроки, тренеры и судьи. Удаление привязанных профилей — только через Merge</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Поиск по фамилии..." value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-52" />
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setForm({ ...emptyPerson })}>
            <Plus className="mr-1 h-4 w-4" /> Персона
          </Button>
        </div>
      </div>

      {loading && !data && <LoadingBlock />}
      {persons.length === 0 && !loading && <EmptyState title="Никого не найдено" />}
      {persons.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {persons.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
              <span className="font-semibold text-zinc-800">{p.name}</span>
              {p.position && <Badge variant="secondary">{p.position}</Badge>}
              {p.isReferee && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700"><Flag className="mr-1 h-3 w-3" />судья</Badge>}
              {p.teams.length > 0 && <span className="hidden max-w-[260px] truncate text-xs text-zinc-400 md:inline">{p.teams.join(", ")}</span>}
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => {
                  const [lastName, firstName, middleName] = p.name.split(" ");
                  setForm({ id: p.id, firstName: firstName ?? "", lastName: lastName ?? "", middleName: middleName ?? "", position: p.position ?? "", birthDate: "", isReferee: p.isReferee });
                }} aria-label="Редактировать">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <DeleteBtn onClick={async () => {
                  const res = await apiPost(`/api/admin/persons/${p.id}`, null, "DELETE");
                  if (!res.ok) return toast.error(res.error);
                  toast.success("Персона удалена");
                  bump();
                  onReload();
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{form?.id ? "Редактировать персону" : "Новая персона"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Фамилия"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
              <Field label="Имя"><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
              <Field label="Отчество"><Input value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} /></Field>
              <Field label="Позиция">
                <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— не указана —</option>
                  <option value="GK">Вратарь</option>
                  <option value="DF">Защитник</option>
                  <option value="MF">Полузащитник</option>
                  <option value="FW">Нападающий</option>
                </select>
              </Field>
              <Field label="Дата рождения"><Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
              <div className="flex items-center gap-2 pt-5">
                <Switch checked={form.isReferee} onCheckedChange={(v) => setForm({ ...form, isReferee: v })} />
                <span className="text-sm text-zinc-600">Судья</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            <Button disabled={saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">{form?.id ? "Сохранить" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Стадионы
// ============================================================

interface AdminStadium { id: string; name: string; city: string | null; address: string | null; capacity: number | null; matchesCount: number }

export function StadiumsPanel({ bump, onReload }: CrudProps) {
  const { data, loading } = useFetch<{ stadiums: AdminStadium[] }>("/api/admin/stadiums");
  const [form, setForm] = useState<{ id?: string; name: string; city: string; address: string; capacity: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const res = await apiPost(form.id ? `/api/admin/stadiums/${form.id}` : "/api/admin/stadiums", {
      name: form.name, city: form.city || null, address: form.address || null, capacity: form.capacity || null,
    }, form.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(form.id ? "Стадион обновлён" : "Стадион создан");
    setForm(null);
    bump();
    onReload();
  };

  const stadiums = data?.stadiums ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold"><MapPin className="h-4 w-4 text-emerald-600" /> Стадионы</h3>
          <p className="text-xs text-zinc-400">Арены турниров · используются в карточках матчей</p>
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setForm({ name: "", city: "", address: "", capacity: "" })}>
          <Plus className="mr-1 h-4 w-4" /> Стадион
        </Button>
      </div>

      {loading && !data && <LoadingBlock />}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {stadiums.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
            <MapPin className="h-4 w-4 text-zinc-300" />
            <span className="font-semibold text-zinc-800">{s.name}</span>
            {s.city && <span className="text-xs text-zinc-400">{s.city}</span>}
            {s.capacity && <Badge variant="secondary">{s.capacity.toLocaleString("ru-RU")} мест</Badge>}
            <span className="ml-auto text-xs text-zinc-400">{s.matchesCount} матчей</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setForm({ id: s.id, name: s.name, city: s.city ?? "", address: s.address ?? "", capacity: s.capacity ? String(s.capacity) : "" })} aria-label="Редактировать">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <DeleteBtn onClick={async () => {
              const res = await apiPost(`/api/admin/stadiums/${s.id}`, null, "DELETE");
              if (!res.ok) return toast.error(res.error);
              toast.success("Стадион удалён");
              bump();
              onReload();
            }} />
          </div>
        ))}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{form?.id ? "Редактировать стадион" : "Новый стадион"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <Field label="Название"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Центральный" /></Field>
              <Field label="Город"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Чебоксары" /></Field>
              <Field label="Адрес"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              <Field label="Вместимость"><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="15000" /></Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            <Button disabled={saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">{form?.id ? "Сохранить" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Баннеры (рекламные слоты)
// ============================================================

interface AdminBanner {
  id: string; title: string; placement: string; imageUrl: string | null; linkUrl: string | null;
  text: string | null; isActive: boolean; priority: number;
}

const PLACEMENT_LABELS: Record<string, string> = {
  TOP: "Верх (728×90)",
  RIGHT_TOP: "Правая колонка · верх",
  RIGHT_BOTTOM: "Правая колонка · низ",
};

export function BannersPanel({ bump, onReload }: CrudProps) {
  const { data, loading } = useFetch<{ banners: AdminBanner[] }>("/api/admin/banners");
  const [form, setForm] = useState<{ id?: string; title: string; text: string; linkUrl: string; imageUrl: string; placement: string; isActive: boolean; priority: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const res = await apiPost(form.id ? `/api/admin/banners/${form.id}` : "/api/admin/banners", {
      title: form.title, text: form.text || null, linkUrl: form.linkUrl || null, imageUrl: form.imageUrl || null,
      placement: form.placement, isActive: form.isActive, priority: form.priority,
    }, form.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(form.id ? "Баннер обновлён" : "Баннер создан");
    setForm(null);
    bump();
    onReload();
  };

  const banners = data?.banners ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold"><Megaphone className="h-4 w-4 text-emerald-600" /> Рекламные баннеры</h3>
          <p className="text-xs text-zinc-400">Слоты: верхний 728×90 и два в правой колонке 300×250 · ручное управление</p>
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setForm({ title: "", text: "", linkUrl: "", imageUrl: "", placement: "RIGHT_TOP", isActive: true, priority: 0 })}>
          <Plus className="mr-1 h-4 w-4" /> Баннер
        </Button>
      </div>

      {loading && !data && <LoadingBlock />}
      {banners.length === 0 && !loading && <EmptyState title="Баннеров нет" hint="Создайте первый баннер — он появится на сайте сразу" />}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {banners.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
            <Megaphone className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="font-semibold text-zinc-800">{b.title}</span>
            <Badge variant="outline" className="text-zinc-500">{PLACEMENT_LABELS[b.placement] ?? b.placement}</Badge>
            {!b.isActive && <Badge variant="secondary" className="bg-zinc-100 text-zinc-400">выключен</Badge>}
            <span className="ml-auto text-xs text-zinc-400">приоритет {b.priority}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setForm({ id: b.id, title: b.title, text: b.text ?? "", linkUrl: b.linkUrl ?? "", imageUrl: b.imageUrl ?? "", placement: b.placement, isActive: b.isActive, priority: b.priority })} aria-label="Редактировать">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <DeleteBtn onClick={async () => {
              const res = await apiPost(`/api/admin/banners/${b.id}`, null, "DELETE");
              if (!res.ok) return toast.error(res.error);
              toast.success("Баннер удалён");
              bump();
              onReload();
            }} />
          </div>
        ))}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? "Редактировать баннер" : "Новый баннер"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Заголовок"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="Слот">
                <select value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  {Object.entries(PLACEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Текст-слоган" hint="Показывается под заголовком"><Input value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
              <Field label="Ссылка"><Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://..." /></Field>
              <Field label="Картинка (URL)" hint="Необязательно — иначе текстовый баннер"><Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></Field>
              <Field label="Приоритет (0–100)"><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></Field>
              <div className="flex items-center gap-2">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <span className="text-sm text-zinc-600">Активен</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            <Button disabled={saving} onClick={save} className="bg-emerald-600 hover:bg-emerald-700">{form?.id ? "Сохранить" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
