"use client";

// CRUD-панели админки (часть 2): персоны (роли/фото/антидубли), стадионы, баннеры.
// Персона ≠ игрок: общие поля (ФИО, ДР, пол, фото) + специализации (мульти-роли).

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Users, MapPin, Megaphone, AlertTriangle, PlusCircle, UserPlus } from "lucide-react";
import { apiPost, useFetch } from "./hooks";
import { EmptyState, LoadingBlock } from "./ui-bits";
import { Field, DeleteBtn } from "./CrudPanels";
import { MediaUpload } from "./MediaUpload";
import { SmartDelete } from "./SmartDelete";
import { BulkBar, RowCheckbox } from "./BulkBar";
import { AdMark } from "./visuals";
import { SYSTEM_ROLES, ROLE_GROUP_LABELS, cardRoleConflict, CARD_ROLE_CONFLICT_HINT, type RoleDef } from "@/lib/roles";
import { cn } from "@/lib/utils";

interface CrudProps {
  bump: () => void;
  onReload: () => void;
  version?: number;
}

interface CustomRoleDTO { id: string; code: string; name: string }

// ============================================================
// Персоны: игроки / тренеры / судьи / врачи / делегаты / VAR…
// ============================================================

interface AdminPerson {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  position: string | null;
  gender: string | null;
  roles: string[];
  isReferee: boolean;
  photoUrl: string | null;
  teams: string[];
}

interface Duplicate { id: string; name: string; birthDate: string | null; roles: string[]; teams: string[] }

const emptyPerson = {
  firstName: "", lastName: "", middleName: "", birthDate: "", position: "",
  gender: "", roles: ["PLAYER"] as string[], photoUrl: "",
};

export function PeoplePanel({ bump, onReload, version = 0, onOpenPerson, userRole }: CrudProps & { onOpenPerson?: (personId: string, backLabel?: string) => void; userRole?: string }) {
  const [q, setQ] = useState("");
  const [form, setForm] = useState<(typeof emptyPerson) & { id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dupes, setDupes] = useState<Duplicate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data, loading } = useFetch<{ persons: AdminPerson[] }>(`/api/admin/persons${q ? `?q=${encodeURIComponent(q)}` : ""}`, version);
  const { data: customRolesData, reload: reloadCustomRoles } = useFetch<{ customRoles: CustomRoleDTO[] }>("/api/admin/customroles", version);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const canDelete = userRole === "LEAGUE_ADMIN" || userRole === "SUPER_ADMIN";

  const customRoles = customRolesData?.customRoles ?? [];
  const roleName = (code: string): string => {
    const sys = SYSTEM_ROLES.find((r) => r.code === code);
    if (sys) return sys.name;
    const custom = customRoles.find((r) => r.code === code);
    return custom?.name ?? code;
  };
  const isPlayer = form?.roles.includes("PLAYER") ?? false;
  // «Нейтральная роль ≠ игрок»: судейский корпус/врач несовместимы с игроком на карточке
  const roleConflict = form ? cardRoleConflict(form.roles) : [];

  const save = async (force = false) => {
    if (!form) return;
    setSaving(true);
    const res = await apiPost<{ duplicates?: Duplicate[] }>(form.id ? `/api/admin/persons/${form.id}` : "/api/admin/persons", {
      firstName: form.firstName, lastName: form.lastName, middleName: form.middleName || null,
      position: form.position || null, birthDate: form.birthDate || null,
      gender: form.gender || null, photoUrl: form.photoUrl || null,
      roles: form.roles, force,
    }, form.id ? "PATCH" : "POST");
    setSaving(false);
    if (!res.ok) {
      // 409 с кандидатами-дублями — показываем, создаём только осознанно
      if (res.data?.duplicates) setDupes(res.data.duplicates);
      return toast.error(res.error);
    }
    toast.success(form.id ? "Профиль обновлён" : "Персона создана");
    setForm(null);
    setDupes(null);
    bump();
    onReload();
  };

  const toggleRole = (code: string) => {
    if (!form) return;
    const has = form.roles.includes(code);
    const roles = has ? form.roles.filter((r) => r !== code) : [...form.roles, code];
    setForm({ ...form, roles, position: has && code === "PLAYER" ? "" : form.position });
  };

  const createCustomRole = async () => {
    const name = newRoleName.trim();
    if (!name) return;
    const res = await apiPost("/api/admin/customroles", { name });
    if (!res.ok) return toast.error(res.error);
    toast.success(`Роль «${name}» добавлена`);
    setNewRoleName("");
    setNewRoleOpen(false);
    reloadCustomRoles();
  };

  const persons = (data?.persons ?? []).slice(0, 100);

  const groups: { group: RoleDef["group"]; roles: { code: string; name: string }[] }[] = (
    ["team", "officials", "medicine"] as const
  ).map((group) => ({
    group,
    roles: SYSTEM_ROLES.filter((r) => r.group === group).map((r) => ({ code: r.code, name: r.name })),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold"><Users className="h-4 w-4 text-emerald-600" /> Люди</h3>
          <p className="text-xs text-zinc-400">Клик по имени — карточка с профилем, заявками и статистикой · один человек, много ролей</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Поиск по фамилии..." value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-52" />
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setForm({ ...emptyPerson }); setDupes(null); }}>
            <Plus className="mr-1 h-4 w-4" /> Персона
          </Button>
        </div>
      </div>

      {loading && !data && <LoadingBlock />}
      {persons.length === 0 && !loading && <EmptyState title="Никого не найдено" hint="Добавьте вручную или массово через раздел «Импорт»" />}
      {canDelete && persons.length > 0 && (
        <BulkBar
          items={persons}
          selected={selected}
          onSelect={setSelected}
          endpoint="/api/admin/persons"
          entityLabel="профили"
          onDone={() => { bump(); onReload(); }}
        />
      )}
      {persons.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {persons.map((p) => (
            <div key={p.id} className={cn("group flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0 hover:bg-zinc-50/60", selected.has(p.id) && "bg-emerald-50/50")}>
              {canDelete && (
                <RowCheckbox
                  checked={selected.has(p.id)}
                  onChange={() => {
                    const next = new Set(selected);
                    if (next.has(p.id)) next.delete(p.id);
                    else next.add(p.id);
                    setSelected(next);
                  }}
                />
              )}
              {p.photoUrl ? (
                 
                <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-full border border-zinc-200 object-cover" />
              ) : null}
              <button
                onClick={() => onOpenPerson?.(p.id)}
                className="rounded font-semibold text-zinc-800 hover:bg-emerald-50 hover:text-emerald-700"
                title="Открыть карточку: профиль, заявки, статистика"
              >
                {p.name}
              </button>
              <span className="flex flex-wrap gap-1">
                {p.roles.slice(0, 3).map((r) => (
                  <Badge key={r} variant="secondary" className="font-normal">{roleName(r)}</Badge>
                ))}
                {p.roles.length > 3 && <Badge variant="secondary" className="font-normal">+{p.roles.length - 3}</Badge>}
              </span>
              {p.birthDate && <span className="hidden text-xs text-zinc-400 sm:inline">{new Date(p.birthDate).getFullYear()} г.р.</span>}
              {p.teams.length > 0 && <span className="hidden max-w-[240px] truncate text-xs text-zinc-400 md:inline">{p.teams.join(", ")}</span>}
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-emerald-600" onClick={() => {
                  setForm({
                    id: p.id,
                    firstName: p.firstName, lastName: p.lastName, middleName: p.middleName ?? "",
                    birthDate: p.birthDate ? p.birthDate.slice(0, 10) : "",
                    position: p.position ?? "", gender: p.gender ?? "",
                    roles: p.roles.length ? p.roles : ["PLAYER"], photoUrl: p.photoUrl ?? "",
                  });
                  setDupes(null);
                }} aria-label="Быстрое редактирование">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {canDelete ? (
                  <SmartDelete
                    endpoint={`/api/admin/persons/${p.id}`}
                    entityLabel="Профиль"
                    title={`Удаление профиля ${p.name}`}
                    onDone={() => { bump(); onReload(); }}
                    onOpenDetail={onOpenPerson ? () => onOpenPerson(p.id) : undefined}
                    labelOpenDetail="Открыть карточку персоны"
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{form?.id ? "Редактировать персону" : "Новая персона"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Фамилия"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
              <Field label="Имя"><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
              <Field label="Отчество"><Input value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} /></Field>
              <Field label="Дата рождения" hint="Защита от дублей — по ФИО и дате"><Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
              <Field label="Пол">
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  <option value="">— не указан —</option>
                  <option value="MALE">Мужской</option>
                  <option value="FEMALE">Женский</option>
                </select>
              </Field>
              {isPlayer && (
                <Field label="Позиция (для роли «Игрок»)">
                  <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                    <option value="">— не указана —</option>
                    <option value="GK">Вратарь</option>
                    <option value="DF">Защитник</option>
                    <option value="MF">Полузащитник</option>
                    <option value="FW">Нападающий</option>
                  </select>
                </Field>
              )}
              <div className="col-span-2">
                <MediaUpload value={form.photoUrl} onChange={(url) => setForm({ ...form, photoUrl: url })} label="Фото персоны" hint="JPG/PNG/WebP, до 6 МБ — сожмётся автоматически" round />
              </div>
              <div className="col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-600">Специализации (можно несколько)</label>
                  <button onClick={() => setNewRoleOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                    <PlusCircle className="h-3.5 w-3.5" /> своя роль
                  </button>
                </div>
                <p className="text-[11px] leading-snug text-zinc-400">
                  Игрок совместим с тренером (играющий тренер), администратором, президентом. С судьёй — нет: играет и судит в разных лигах через заявки.
                </p>
                {groups.map((g) => (
                  <div key={g.group}>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{ROLE_GROUP_LABELS[g.group]}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.roles.map((r) => {
                        const active = form.roles.includes(r.code);
                        return (
                          <button
                            key={r.code}
                            type="button"
                            onClick={() => toggleRole(r.code)}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                              active ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                            )}
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
                            key={r.code}
                            type="button"
                            onClick={() => toggleRole(r.code)}
                            className={cn(
                              "rounded-full border border-dashed px-2.5 py-1 text-xs font-medium transition-colors",
                              active ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
                            )}
                          >
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ---- несовместимость «судья × игрок» ---- */}
              {roleConflict.length > 0 && (
                <div className="col-span-2 space-y-1.5 rounded-lg border border-red-300 bg-red-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> Судья/врач не может быть игроком
                  </p>
                  <p className="text-xs text-red-600">{CARD_ROLE_CONFLICT_HINT}</p>
                </div>
              )}

              {/* ---- предупреждение о дубле ---- */}
              {dupes && dupes.length > 0 && (
                <div className="col-span-2 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5" /> Похоже, этот человек уже есть:
                  </p>
                  {dupes.map((d) => (
                    <p key={d.id} className="text-xs text-amber-700">
                      {d.name}{d.birthDate ? ` · ${d.birthDate}` : ""}{d.roles.length ? ` · ${d.roles.map(roleName).join(", ")}` : ""}{d.teams.length ? ` · ${d.teams.join(", ")}` : ""}
                    </p>
                  ))}
                  <Button size="sm" variant="outline" className="h-7 border-amber-300 bg-white text-xs text-amber-800 hover:bg-amber-100" disabled={saving} onClick={() => save(true)}>
                    <UserPlus className="mr-1 h-3 w-3" /> Это другой человек — создать всё равно
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            <Button disabled={saving || roleConflict.length > 0} onClick={() => save(false)} className="bg-emerald-600 hover:bg-emerald-700">{form?.id ? "Сохранить" : "Создать"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- создание кастомной роли ---- */}
      <Dialog open={newRoleOpen} onOpenChange={setNewRoleOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Своя роль персоны</DialogTitle></DialogHeader>
          <Field label="Название" hint="Например: «Координатор лиги», «Оператор VAR»">
            <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewRoleOpen(false)}>Отмена</Button>
            <Button onClick={createCustomRole} className="bg-emerald-600 hover:bg-emerald-700">Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Стадионы
// ============================================================

interface AdminStadium { id: string; name: string; city: string | null; address: string | null; capacity: number | null; matchesCount: number; photoUrl: string | null }

export function StadiumsPanel({ bump, onReload, version = 0 }: CrudProps) {
  const { data, loading } = useFetch<{ stadiums: AdminStadium[] }>("/api/admin/stadiums", version);
  const [form, setForm] = useState<{ id?: string; name: string; city: string; address: string; capacity: string; photoUrl: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const res = await apiPost(form.id ? `/api/admin/stadiums/${form.id}` : "/api/admin/stadiums", {
      name: form.name, city: form.city || null, address: form.address || null, capacity: form.capacity || null,
      photoUrl: form.photoUrl || null,
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
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setForm({ name: "", city: "", address: "", capacity: "", photoUrl: "" })}>
          <Plus className="mr-1 h-4 w-4" /> Стадион
        </Button>
      </div>

      {loading && !data && <LoadingBlock />}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {stadiums.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
            {s.photoUrl ? (
               
              <img src={s.photoUrl} alt="" className="h-8 w-12 rounded border border-zinc-200 object-cover" />
            ) : (
              <MapPin className="h-4 w-4 text-zinc-300" />
            )}
            <span className="font-semibold text-zinc-800">{s.name}</span>
            {s.city && <span className="text-xs text-zinc-400">{s.city}</span>}
            {s.capacity && <Badge variant="secondary">{s.capacity.toLocaleString("ru-RU")} мест</Badge>}
            <span className="ml-auto text-xs text-zinc-400">{s.matchesCount} матчей</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setForm({ id: s.id, name: s.name, city: s.city ?? "", address: s.address ?? "", capacity: s.capacity ? String(s.capacity) : "", photoUrl: s.photoUrl ?? "" })} aria-label="Редактировать">
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
              <MediaUpload value={form.photoUrl} onChange={(url) => setForm({ ...form, photoUrl: url })} label="Фото арены" hint="Появится на странице стадиона" />
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
// Баннеры (рекламные слоты) — v1.0.20
// Слоты: полосы верх/низ, блоки в виджетах и ФОН ЭКРАНА (виден
// слева/справа от колонки сайта 800px — как брендирование на
// cybersport.ru). Предпросмотр «как на сайте», масштабирование
// картинки и настраиваемая маркировка «Реклама» (кегль/прозрачность).
// Создание — ОДНИМ нажатием: кнопка ждёт окончания загрузки фото.
// ============================================================

interface AdminBanner {
  id: string; title: string; placement: string; imageUrl: string | null; linkUrl: string | null;
  text: string | null; isActive: boolean; priority: number;
  imageFit: string | null; imagePos: string | null; markSize: number | null; markOpacity: number | null;
}

const PLACEMENTS: { code: string; label: string; size: string }[] = [
  { code: "TOP", label: "Верх — полоса под шапкой (центр)", size: "800×90" },
  { code: "BOTTOM", label: "Низ — полоса над футером (центр)", size: "800×90" },
  { code: "LEFT_TOP", label: "Колонка слева · верх (данные и статистика)", size: "300×250" },
  { code: "LEFT_BOTTOM", label: "Колонка слева · низ", size: "300×250" },
  { code: "RIGHT_TOP", label: "Колонка справа · верх (под лигами)", size: "260×250" },
  { code: "RIGHT_BOTTOM", label: "Колонка справа · низ", size: "260×250" },
  { code: "BACKGROUND", label: "Фон экрана — слева/справа от сайта", size: "1920×1080" },
];
const PLACEMENT_LABELS: Record<string, string> = Object.fromEntries(PLACEMENTS.map((p) => [p.code, p.label]));
const PLACEMENT_SIZES: Record<string, string> = Object.fromEntries(PLACEMENTS.map((p) => [p.code, p.size]));

type BannerForm = {
  id?: string; title: string; text: string; linkUrl: string; imageUrl: string;
  placement: string; isActive: boolean; priority: number;
  imageFit: string; imagePos: string; markSize: number; markOpacity: number;
};

const EMPTY_BANNER_FORM: BannerForm = {
  title: "", text: "", linkUrl: "", imageUrl: "", placement: "RIGHT_TOP", isActive: true, priority: 0,
  imageFit: "cover", imagePos: "center", markSize: 9, markOpacity: 70,
};

/** css background-size по режиму масштабирования */
function fitSize(fit: string): string {
  return fit === "contain" ? "contain" : fit === "repeat" ? "auto" : "cover";
}

/** Предпросмотр баннера «как на сайте» — живой, реагирует на все настройки */
function BannerPreview({ form }: { form: BannerForm }) {
  const fit = form.imageFit || "cover";
  const pos = form.imagePos || "center";
  const mark = <AdMark size={form.markSize} opacity={form.markOpacity} />;

  // ФОН ЭКРАНА: мини-макет — картинка вокруг тёмной колонки сайта
  if (form.placement === "BACKGROUND") {
    return (
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="relative h-44 bg-zinc-100">
          {form.imageUrl ? (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${form.imageUrl})`,
                backgroundSize: fitSize(fit),
                backgroundPosition: pos,
                backgroundRepeat: fit === "repeat" ? "repeat" : "no-repeat",
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-zinc-400">
              Загрузите большую картинку (1920×1080) — она станет фоном всего экрана
            </div>
          )}
          {/* имитация контентной колонки сайта (макс. 800px) поверх фона */}
          <div className="absolute inset-y-0 left-1/2 w-[34%] -translate-x-1/2 bg-zinc-900/95 p-2.5">
            <div className="h-2 w-10 rounded bg-zinc-700" />
            <div className="mt-2.5 space-y-1.5">
              <div className="h-3.5 rounded bg-zinc-800" />
              <div className="h-3.5 w-4/5 rounded bg-zinc-800" />
              <div className="h-3.5 w-3/5 rounded bg-zinc-800" />
            </div>
          </div>
          <span className="absolute left-1.5 top-1.5">{mark}</span>
          <span className="absolute right-1.5 top-1.5">{mark}</span>
        </div>
        <p className="border-t border-zinc-100 px-3 py-1.5 text-[11px] leading-snug text-zinc-400">
          Фон виден слева и справа от колонки сайта; клик по фону ведёт на рекламируемый сайт. Меняйте масштаб, позицию и маркировку — предпросмотр обновится.
        </p>
      </div>
    );
  }

  const isRail = ["RIGHT_TOP", "RIGHT_BOTTOM", "LEFT_TOP", "LEFT_BOTTOM"].includes(form.placement);
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className={cn("relative bg-zinc-100", isRail ? "mx-auto h-[190px] w-full max-w-[300px]" : "h-[72px] w-full")}>
        {form.imageUrl ? (
          <img
            src={form.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: fit === "contain" ? "contain" : "cover", objectPosition: pos }}
          />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-4 text-center">
            <span className="text-sm font-bold text-zinc-800">{form.title || "Заголовок баннера"}</span>
            {form.text && <span className="text-xs text-zinc-500">{form.text}</span>}
          </span>
        )}
        <span className="absolute bottom-1.5 right-1.5">{mark}</span>
      </div>
      <p className="border-t border-zinc-100 px-3 py-1.5 text-[11px] text-zinc-400">
        Так баннер выглядит на сайте · рекомендуемая картинка {PLACEMENT_SIZES[form.placement] ?? "—"}
      </p>
    </div>
  );
}

export function BannersPanel({ bump, onReload, version = 0 }: CrudProps) {
  const { data, loading } = useFetch<{ banners: AdminBanner[] }>("/api/admin/banners", version);
  const [form, setForm] = useState<BannerForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    if (!form) return;
    if (uploading) return toast.error("Картинка ещё грузится — одна секунда…");
    setSaving(true);
    const res = await apiPost(form.id ? `/api/admin/banners/${form.id}` : "/api/admin/banners", {
      title: form.title, text: form.text || null, linkUrl: form.linkUrl || null, imageUrl: form.imageUrl || null,
      placement: form.placement, isActive: form.isActive, priority: form.priority,
      imageFit: form.imageFit || null, imagePos: form.imagePos || null,
      markSize: form.markSize || null, markOpacity: form.markOpacity || null,
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
          <p className="text-xs text-zinc-400">Полосы верх/низ, блоки в виджетах и фон экрана · без активных баннеров блоков на сайте нет</p>
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setForm({ ...EMPTY_BANNER_FORM })}>
          <Plus className="mr-1 h-4 w-4" /> Баннер
        </Button>
      </div>

      {loading && !data && <LoadingBlock />}
      {banners.length === 0 && !loading && <EmptyState title="Баннеров нет" hint="Создайте первый: выберите слот, загрузите картинку и посмотрите предпросмотр" />}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {banners.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
            {b.imageUrl ? (
              <img src={b.imageUrl} alt="" className="h-8 w-16 rounded border border-zinc-200 object-cover" />
            ) : (
              <Megaphone className="h-4 w-4 shrink-0 text-amber-400" />
            )}
            <span className="font-semibold text-zinc-800">{b.title}</span>
            <Badge variant="outline" className="text-zinc-500">{PLACEMENT_LABELS[b.placement] ?? b.placement}</Badge>
            {!b.isActive && <Badge variant="secondary" className="bg-zinc-100 text-zinc-400">выключен</Badge>}
            <span className="ml-auto text-xs text-zinc-400">приоритет {b.priority}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-zinc-400 hover:text-emerald-600" onClick={() => setForm({
              id: b.id, title: b.title, text: b.text ?? "", linkUrl: b.linkUrl ?? "", imageUrl: b.imageUrl ?? "",
              placement: b.placement, isActive: b.isActive, priority: b.priority,
              imageFit: b.imageFit ?? "cover", imagePos: b.imagePos ?? "center",
              markSize: b.markSize ?? 9, markOpacity: b.markOpacity ?? 70,
            })} aria-label="Редактировать">
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{form?.id ? "Редактировать баннер" : "Новый баннер"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <BannerPreview form={form} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Заголовок"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
                <Field label="Слот">
                  <select value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                    {PLACEMENTS.map((p) => <option key={p.code} value={p.code}>{p.label} · {p.size}</option>)}
                  </select>
                </Field>
                <Field label="Текст-слоган" hint="Показывается под заголовком"><Input value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
                <Field label="Ссылка"><Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://..." /></Field>
                <Field label="Приоритет (0–100)"><Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} /></Field>
                <div className="flex items-center gap-2">
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                  <span className="text-sm text-zinc-600">Активен</span>
                </div>
                <div className="col-span-2">
                  <MediaUpload
                    value={form.imageUrl}
                    onChange={(url) => setForm((f) => (f ? { ...f, imageUrl: url } : f))}
                    onUploadingChange={setUploading}
                    label="Картинка баннера"
                    hint={`Загрузите с диска — или оставьте пустым для текстового баннера. Рекомендация: ${PLACEMENT_SIZES[form.placement] ?? "300×250"}${form.placement === "BACKGROUND" ? ", крупный формат на весь экран" : ""}`}
                  />
                </div>
                {form.imageUrl && (
                  <>
                    <Field label="Масштаб картинки">
                      <select value={form.imageFit} onChange={(e) => setForm({ ...form, imageFit: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                        <option value="cover">Заполнить (обрезать края)</option>
                        <option value="contain">Вписать целиком</option>
                        <option value="repeat">Замостить повтором</option>
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
                <Field label="Маркировка «Реклама»: кегль, px (6–16)">
                  <Input type="number" min={6} max={16} value={form.markSize} onChange={(e) => setForm({ ...form, markSize: Number(e.target.value) })} />
                </Field>
                <Field label="Маркировка: прозрачность, % (20–100)">
                  <Input type="number" min={20} max={100} value={form.markOpacity} onChange={(e) => setForm({ ...form, markOpacity: Number(e.target.value) })} />
                </Field>
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
