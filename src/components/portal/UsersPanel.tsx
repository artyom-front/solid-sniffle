"use client";

// ============================================================
// Пользователи и доступы (только SUPER_ADMIN).
// Выдача боевых доступов: создать учётку с ролью, привязать к
// персоне (для судей) или клубу (для CLUB_ADMIN), сбросить пароль,
// временно отключить вход, сбросить 2FA (потерян телефон).
// ============================================================

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { KeyRound, Loader2, Plus, ShieldCheck, UserCog, Users2, Lock, Unlock, RotateCcw } from "lucide-react";
import { apiPost, useFetch } from "./hooks";
import { ROLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  totpEnabled: boolean;
  personId: string | null;
  personName: string | null;
  clubId: string | null;
  clubName: string | null;
  createdAt: string;
}

interface AdminPerson { id: string; name: string; roles: string[]; isReferee: boolean }
interface AdminClub { id: string; name: string }

const ROLE_OPTIONS = [
  { code: "SUPER_ADMIN", label: "Супер-администратор", hint: "Полный доступ ко всему" },
  { code: "LEAGUE_ADMIN", label: "Администратор лиги", hint: "Турниры, протоколы, справочники" },
  { code: "CLUB_ADMIN", label: "Администратор клуба", hint: "Заявки и своя команда (привязка к клубу)" },
  { code: "REFEREE", label: "Судья", hint: "Только свои матчи (привязка к персоне)" },
  { code: "PLAYER", label: "Игрок", hint: "Личный профиль (вход на сайт)" },
];

export function UsersPanel({ version, bump, selfId }: { version: number; bump: () => void; selfId: string }) {
  const { data, loading } = useFetch<{ users: AdminUser[] }>("/api/admin/users", version);
  const { data: personsData } = useFetch<{ persons: AdminPerson[] }>("/api/admin/persons", version);
  const { data: clubsData } = useFetch<{ clubs: AdminClub[] }>("/api/admin/clubs", version);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwDialog, setPwDialog] = useState<AdminUser | null>(null);
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<{ email: string; password: string; role: string; personId: string; clubId: string } | null>(null);

  const users = data?.users ?? [];
  const persons = personsData?.persons ?? [];
  const clubs = clubsData?.clubs ?? [];

  const openCreate = () => {
    setForm({ email: "", password: "", role: "LEAGUE_ADMIN", personId: "", clubId: "" });
    setCreateOpen(true);
  };

  const create = async () => {
    if (!form) return;
    setBusy(true);
    const res = await apiPost("/api/admin/users", {
      email: form.email, password: form.password, role: form.role,
      personId: form.personId || null, clubId: form.clubId || null,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Пользователь ${form.email} создан`);
    setCreateOpen(false);
    setForm(null);
    bump();
  };

  const action = async (u: AdminUser, act: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    const res = await apiPost("/api/admin/users", { id: u.id, action: act, ...payload }, "PATCH");
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Готово");
    bump();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold">
            <Users2 className="h-4 w-4 text-emerald-600" /> Пользователи и доступы
          </h3>
          <p className="text-xs text-zinc-400">Выдача боевых доступов · сброс пароля и 2FA · блокировка входа</p>
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Пользователь
        </Button>
      </div>

      {loading && !data && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-300" /></div>}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {users.map((u) => {
          const roleHint = ROLE_OPTIONS.find((r) => r.code === u.role)?.hint;
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0">
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", u.role === "SUPER_ADMIN" ? "bg-amber-100 text-amber-600" : "bg-zinc-100 text-zinc-500")}>
                {u.role === "SUPER_ADMIN" ? <ShieldCheck className="h-4 w-4" /> : <UserCog className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-800">{u.email}</p>
                <p className="truncate text-xs text-zinc-400">
                  {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
                  {roleHint ? ` · ${roleHint}` : ""}
                  {u.personName ? ` · персона: ${u.personName}` : ""}
                  {u.clubName ? ` · клуб: ${u.clubName}` : ""}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {u.totpEnabled && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">2FA вкл</Badge>}
                {u.id === selfId && <Badge variant="secondary">это вы</Badge>}
                {!u.isActive && <Badge variant="destructive">отключён</Badge>}
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500 hover:text-emerald-600" onClick={() => { setPwDialog(u); setNewPw(""); }}>
                  <KeyRound className="mr-1 h-3 w-3" /> Пароль
                </Button>
                <Button
                  variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500 hover:text-emerald-600"
                  disabled={busy || u.id === selfId}
                  title={u.isActive ? "Отключить вход" : "Включить вход"}
                  onClick={() => action(u, "setActive", { active: !u.isActive })}
                >
                  {u.isActive ? <><Lock className="mr-1 h-3 w-3" /> Отключить</> : <><Unlock className="mr-1 h-3 w-3" /> Включить</>}
                </Button>
                {u.totpEnabled && (
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500 hover:text-amber-600"
                    disabled={busy}
                    title="Отключить пользователю двухфакторную аутентификацию (потерян телефон)"
                    onClick={() => action(u, "resetTotp")}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" /> Сброс 2FA
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-400">
        Роли: SUPER_ADMIN — всё; LEAGUE_ADMIN — турниры/протоколы/справочники; CLUB_ADMIN — заявки и своя команда; REFEREE — ввод протоколов своих матчей.
        Каждый пользователь сам включает себе 2FA в разделе «Безопасность»; «Сброс 2FA» здесь — аварийное отключение.
      </p>

      {/* ---------- Создание ---------- */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новый пользователь</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600">Email (логин)</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600">Пароль (минимум 8 символов)</label>
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Выдайте и попросите сменить после входа" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600">Роль</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                  {ROLE_OPTIONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
                <p className="text-xs text-zinc-400">{ROLE_OPTIONS.find((r) => r.code === form.role)?.hint}</p>
              </div>
              {form.role === "REFEREE" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-600">Персона (судья) — кому назначаются матчи</label>
                  <select value={form.personId} onChange={(e) => setForm({ ...form, personId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                    <option value="">— не привязана —</option>
                    {persons.filter((p) => p.isReferee).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              {form.role === "CLUB_ADMIN" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-600">Клуб — чьи команды администрирует</label>
                  <select value={form.clubId} onChange={(e) => setForm({ ...form, clubId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                    <option value="">— не привязан —</option>
                    {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button disabled={busy} onClick={create} className="bg-emerald-600 hover:bg-emerald-700">Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Сброс пароля ---------- */}
      <Dialog open={!!pwDialog} onOpenChange={(o) => !o && setPwDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Новый пароль — {pwDialog?.email}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600">Пароль (минимум 8 символов)</label>
            <Input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialog(null)}>Отмена</Button>
            <Button disabled={busy || newPw.length < 8} onClick={() => pwDialog && action(pwDialog, "resetPassword", { password: newPw }).then(() => setPwDialog(null))} className="bg-emerald-600 hover:bg-emerald-700">
              Сменить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
