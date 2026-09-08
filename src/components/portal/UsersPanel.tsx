"use client";

// ============================================================
// Раздел админки «Пользователи» (SUPER_ADMIN): выдача боевых
// доступов, глобальный тумблер TOTP-логина, сброс паролей и
// 2FA (утерян телефон), удаление аккаунтов.
// ============================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, KeyRound, ShieldOff, Trash2, ShieldCheck, Users, Copy } from "lucide-react";
import { apiPost, useFetch } from "./hooks";
import { ROLE_LABELS } from "@/lib/labels";

interface AdminUserDTO {
  id: string;
  email: string;
  role: string;
  personId: string | null;
  personName: string | null;
  clubId: string | null;
  clubName: string | null;
  totpEnabled: boolean;
  recoveryLeft: number;
  createdAt: string;
}

interface SettingsDTO {
  totpRequired: boolean;
}

const ROLE_ORDER = ["SUPER_ADMIN", "LEAGUE_ADMIN", "CLUB_ADMIN", "REFEREE", "PLAYER"];
const CREATE_ROLES = ROLE_ORDER.slice(1); // SUPER_ADMIN создаётся только bootstrap'ом

function genPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const rnd = new Uint32Array(12);
  crypto.getRandomValues(rnd);
  for (const n of rnd) out += alphabet[n % alphabet.length];
  return out;
}

export default function UsersPanel({ version, user: me }: { version: number; user: { id: string; email: string; role: string } }) {
  const { data, loading } = useFetch<{ users: AdminUserDTO[] }>("/api/admin/users", version);
  const { data: settings, reload: reloadSettings } = useFetch<SettingsDTO>("/api/admin/settings", version);
  const { data: clubsData } = useFetch<{ clubs: { id: string; name: string }[] }>("/api/admin/clubs", version);

  const [v, setV] = useState(0); // локальная версия для мгновенного обновления списка
  const bump = () => setV((x) => x + 1);

  const [form, setForm] = useState<{ email: string; password: string; role: string; clubId: string } | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetFor, setResetFor] = useState<{ id: string; email: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const users = data?.users ?? [];
  const protectedCount = users.filter((u) => u.totpEnabled).length;

  // ---------- Глобальный тумблер TOTP ----------
  const toggleTotp = async (checked: boolean) => {
    const res = await apiPost("/api/admin/settings", { totpRequired: checked });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    reloadSettings();
    toast.success(
      checked
        ? "TOTP-логин включён: при входе запрашивается код из приложения"
        : "TOTP-логин отключён: все входят только по паролю"
    );
  };

  // ---------- Создание ----------
  const createUser = async () => {
    if (!form) return;
    setBusy(true);
    const res = await apiPost<{ id: string }>("/api/admin/users", {
      email: form.email,
      password: form.password,
      role: form.role,
      ...(form.role === "CLUB_ADMIN" && form.clubId ? { clubId: form.clubId } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setCreated({ email: form.email, password: form.password });
    setForm(null);
    bump();
    toast.success("Аккаунт создан — передайте доступ сотруднику");
  };

  // ---------- Сброс пароля ----------
  const applyReset = async () => {
    if (!resetFor) return;
    setBusy(true);
    const res = await apiPost(`/api/admin/users/${resetFor.id}`, { password: resetPassword }, "PATCH");
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setCreated({ email: resetFor.email, password: resetPassword });
    setResetFor(null);
    setResetPassword("");
    toast.success("Пароль сброшен");
  };

  // ---------- Сброс 2FA ----------
  const resetTotp = async (u: AdminUserDTO) => {
    const res = await apiPost(`/api/admin/users/${u.id}`, { totpReset: true }, "PATCH");
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    bump();
    toast.success(`2FA отключена для ${u.email} — при следующем входе только пароль`);
  };

  // ---------- Удаление ----------
  const removeUser = async (id: string) => {
    const res = await apiPost(`/api/admin/users/${id}`, null, "DELETE");
    setConfirmDelete(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    bump();
    toast.success("Аккаунт удалён");
  };

  const copyCreds = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(`${created.email} / ${created.password}`);
    toast.success("Логин и пароль скопированы");
  };

  return (
    <div className="space-y-4">
      {/* ---------- Глобальный TOTP-тумблер ---------- */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 text-sm font-bold text-zinc-700">
          <ShieldCheck className="h-4 w-4 text-emerald-600" /> Логин по TOTP (для всех пользователей)
        </div>
        <div className="flex flex-wrap items-center gap-4 p-4">
          <Switch checked={settings?.totpRequired ?? true} onCheckedChange={toggleTotp} aria-label="TOTP-логин" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-800">
              {settings?.totpRequired === false ? "Отключён — вход только по паролю" : "Включён — вход с кодом из приложения"}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {settings?.totpRequired === false
                ? "Аварийный режим: шаг 2FA пропускается для всех, даже с включённой защитой. Включите обратно как только проблема решена."
                : `Сотрудники с включённой 2FA подтверждают вход кодом. Сейчас защищено аккаунтов: ${protectedCount} из ${users.length}.`}
            </p>
          </div>
        </div>
      </div>

      {/* ---------- Создание аккаунта ---------- */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm font-bold text-zinc-700">
            <UserPlus className="h-4 w-4 text-emerald-600" /> Выдача доступа
          </p>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() =>
              setForm(form ? null : { email: "", password: genPassword(), role: "LEAGUE_ADMIN", clubId: "" })
            }
          >
            {form ? "Скрыть форму" : "Создать аккаунт"}
          </Button>
        </div>
        {form && (
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-500">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@scoresbox.ru"
                className="border-zinc-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-500">Пароль (минимум 8 символов)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="border-zinc-200 font-mono"
                />
                <Button variant="outline" size="sm" className="shrink-0 border-zinc-200" onClick={() => setForm({ ...form, password: genPassword() })}>
                  <Copy className="h-3.5 w-3.5" /> Сгенерировать
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-500">Роль</Label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value, clubId: "" })}
                className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
              >
                {CREATE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            {form.role === "CLUB_ADMIN" && (
              <div className="space-y-1.5">
                <Label className="text-zinc-500">Клуб (область видимости)</Label>
                <select
                  value={form.clubId}
                  onChange={(e) => setForm({ ...form, clubId: e.target.value })}
                  className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                >
                  <option value="">— выберите клуб —</option>
                  {(clubsData?.clubs ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-end gap-2 sm:col-span-2">
              <Button onClick={createUser} disabled={busy || !form.email || form.password.length < 8} className="bg-emerald-600 hover:bg-emerald-700">
                <UserPlus className="mr-1 h-4 w-4" /> Создать
              </Button>
              <p className="text-xs text-zinc-400">
                Сотрудник сменит пароль и включит 2FA сам — раздел «Безопасность» после первого входа.
              </p>
            </div>
          </div>
        )}
        {created && (
          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 bg-emerald-50 px-4 py-3 text-sm">
            <p className="text-emerald-800">
              Доступ: <code className="rounded bg-white px-2 py-0.5 font-mono">{created.email}</code>{" "}
              / <code className="rounded bg-white px-2 py-0.5 font-mono">{created.password}</code>
            </p>
            <Button size="sm" variant="outline" className="border-emerald-200 bg-white" onClick={copyCreds}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Скопировать
            </Button>
            <Button size="sm" variant="ghost" className="text-zinc-500" onClick={() => setCreated(null)}>
              Скрыть
            </Button>
          </div>
        )}
      </div>

      {/* ---------- Список сотрудников ---------- */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 text-sm font-bold text-zinc-700">
          <Users className="h-4 w-4 text-emerald-600" /> Сотрудники · {users.length}
        </div>
        {loading && !users.length && <p className="py-8 text-center text-sm text-zinc-400">Загрузка...</p>}
        {!loading && users.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-400">Пока только вы — создайте аккаунты для коллег выше</p>
        )}
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-100 px-4 py-3 last:border-b-0 hover:bg-zinc-50/60">
            <div className="min-w-[200px] flex-1">
              <p className="text-sm font-semibold text-zinc-800">
                {u.email}
                {u.id === me.id && <span className="ml-2 text-xs font-medium text-zinc-400">(это вы)</span>}
              </p>
              <p className="text-xs text-zinc-400">
                {u.personName ?? u.clubName ?? "без привязки к профилю"}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                u.role === "SUPER_ADMIN"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "text-zinc-500"
              }
            >
              {ROLE_LABELS[u.role] ?? u.role}
            </Badge>
            <span className={`flex items-center gap-1 text-xs font-medium ${u.totpEnabled ? "text-emerald-700" : "text-zinc-400"}`}>
              <ShieldCheck className={`h-3.5 w-3.5 ${u.totpEnabled ? "text-emerald-600" : "text-zinc-300"}`} />
              {u.totpEnabled ? `2FA · кодов: ${u.recoveryLeft}` : "без 2FA"}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-zinc-400 hover:text-emerald-600"
                onClick={() => { setResetFor({ id: u.id, email: u.email }); setResetPassword(genPassword()); setConfirmDelete(null); }}
                title="Сбросить пароль"
              >
                <KeyRound className="h-4 w-4" />
              </Button>
              {u.totpEnabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-amber-600"
                  onClick={() => resetTotp(u)}
                  title="Отключить 2FA (утерян телефон)"
                >
                  <ShieldOff className="h-4 w-4" />
                </Button>
              )}
              {u.id !== me.id && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-red-600"
                  onClick={() => setConfirmDelete(confirmDelete === u.id ? null : u.id)}
                  title="Удалить аккаунт"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {confirmDelete === u.id && (
                <Button variant="outline" size="sm" className="h-8 border-red-200 text-red-600 hover:bg-red-50" onClick={() => removeUser(u.id)}>
                  Точно удалить?
                </Button>
              )}
            </div>

            {/* Инлайн-форма сброса пароля */}
            {resetFor?.id === u.id && (
              <div className="flex w-full flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
                <div className="min-w-[220px] flex-1 space-y-1.5">
                  <Label className="text-zinc-500">Новый пароль для {u.email}</Label>
                  <div className="flex gap-2">
                    <Input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className="border-zinc-200 font-mono" />
                    <Button variant="outline" size="sm" className="shrink-0 border-zinc-200" onClick={() => setResetPassword(genPassword())}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={applyReset} disabled={busy || resetPassword.length < 8}>
                  Сохранить
                </Button>
                <Button size="sm" variant="ghost" className="text-zinc-500" onClick={() => setResetFor(null)}>
                  Отмена
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
