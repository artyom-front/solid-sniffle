"use client";

// ============================================================
// Пользователи и доступы (только SUPER_ADMIN).
// v1.0.32 · ЗОЛОТОЙ СТАНДАРТ ПАРОЛЕЙ:
//   • создание — БЕЗ пароля: система выдаёт одноразовую ссылку
//     установки (15 минут); пользователь сам задаёт пароль;
//   • «сбросить пароль» = запросить такую же ссылку и передать
//     человеку по защищённому каналу. Пароли никто не видит;
//   • скоуп лиги для LEAGUE_ADMIN: админ конкретной лиги.
// Блокировка входа и сброс 2FA — как раньше.
// ============================================================

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { KeyRound, Loader2, Plus, ShieldCheck, UserCog, Users2, Lock, Unlock, RotateCcw, Copy, Check, Send } from "lucide-react";
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
  leagueId: string | null;
  leagueName: string | null;
  createdAt: string;
}

interface AdminPerson { id: string; name: string; roles: string[]; isReferee: boolean }
interface AdminClub { id: string; name: string }
interface AdminLeague { id: string; name: string; seasons?: unknown[] }

const ROLE_OPTIONS = [
  { code: "SUPER_ADMIN", label: "Супер-администратор", hint: "Полный доступ ко всему" },
  { code: "LEAGUE_ADMIN", label: "Администратор лиги", hint: "Турниры/протоколы/справочники; с привязкой к лиге — только её" },
  { code: "CLUB_ADMIN", label: "Администратор клуба (команды)", hint: "Заявки и свои команды (привязка к клубу)" },
  { code: "REFEREE", label: "Судья", hint: "Только свои матчи (привязка к персоне)" },
  { code: "PLAYER", label: "Игрок", hint: "Личный профиль (вход на сайт)" },
];

/** Диалог с одноразовой ссылкой: показать один раз, скопировать, передать */
function LinkDialog({ open, onOpenChange, token, title, note }: { open: boolean; onOpenChange: (o: boolean) => void; token: string; title: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/admin?pwset=${token}`;
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-4 w-4 text-emerald-600" /> {title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-zinc-600">{note}</p>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700">{link}</code>
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            <b>Один раз · 15 минут.</b> Ссылку видит только тот, у кого она открыта: пароль
            задаёт сам пользователь, супер-администратор его не знает и не видит. Передайте
            ссылку лично или по защищённому каналу. После установки все прежние входы
            аккаунта закрываются.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={copy}>
            {copied ? <><Check className="mr-1 h-3.5 w-3.5" /> Скопировано</> : <><Copy className="mr-1 h-3.5 w-3.5" /> Скопировать ссылку</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPanel({ version, bump, selfId }: { version: number; bump: () => void; selfId: string }) {
  const { data, loading } = useFetch<{ users: AdminUser[] }>("/api/admin/users", version);
  const { data: personsData } = useFetch<{ persons: AdminPerson[] }>("/api/admin/persons", version);
  const { data: clubsData } = useFetch<{ clubs: AdminClub[] }>("/api/admin/clubs", version);
  const { data: leaguesData } = useFetch<{ leagues: AdminLeague[] }>("/api/admin/leagues", version);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ token: string; title: string; note: string } | null>(null);
  const [leagueDialog, setLeagueDialog] = useState<AdminUser | null>(null);
  const [leagueValue, setLeagueValue] = useState("");

  const [form, setForm] = useState<{ email: string; role: string; personId: string; clubId: string; leagueId: string } | null>(null);

  const users = data?.users ?? [];
  const persons = personsData?.persons ?? [];
  const clubs = clubsData?.clubs ?? [];
  const leagues = leaguesData?.leagues ?? [];

  const openCreate = () => {
    setForm({ email: "", role: "LEAGUE_ADMIN", personId: "", clubId: "", leagueId: "" });
    setCreateOpen(true);
  };

  const create = async () => {
    if (!form) return;
    setBusy(true);
    const res = await apiPost<{ setupToken: string }>("/api/admin/users", {
      email: form.email, role: form.role,
      personId: form.personId || null, clubId: form.clubId || null, leagueId: form.leagueId || null,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Пользователь ${form.email} создан — передайте ему ссылку установки пароля`);
    setCreateOpen(false);
    setForm(null);
    bump();
    // сразу показываем ссылку — второй раз её не увидеть
    setLink({
      token: res.data!.setupToken,
      title: `Ссылка для ${form.email}`,
      note: "Пользователь ещё без пароля. Откройте ссылку — он задаст пароль сам (автовход). Если окно закрылось, ссылку можно запросить заново кнопкой «Ссылка на пароль».",
    });
  };

  const action = async (u: AdminUser, act: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    const res = await apiPost<Record<string, unknown>>("/api/admin/users", { id: u.id, action: act, ...payload }, "PATCH");
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    if (act === "requestPasswordReset" && typeof res.data?.resetToken === "string") {
      setLink({
        token: res.data.resetToken,
        title: `Ссылка сброса пароля — ${u.email}`,
        note: "Пользователь забыл пароль: откройте ссылку и задайте новый (прежние входы закроются). Ссылка действует 15 минут и работает один раз.",
      });
      return;
    }
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
          <p className="text-xs text-zinc-400">Роли и скоупы · одноразовые ссылки на пароль · блокировка входа · сброс 2FA</p>
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
                  {u.personName ? ` · персона: ${u.personName}` : ""}
                  {u.clubName ? ` · клуб: ${u.clubName}` : ""}
                  {u.leagueName ? ` · лига: ${u.leagueName}` : ""}
                  {u.role === "LEAGUE_ADMIN" && !u.leagueId ? " · все лиги" : ""}
                </p>
                {roleHint && <p className="hidden truncate text-xs text-zinc-300 sm:block">{roleHint}</p>}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {u.totpEnabled && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">2FA вкл</Badge>}
                {u.id === selfId && <Badge variant="secondary">это вы</Badge>}
                {!u.isActive && <Badge variant="destructive">отключён</Badge>}
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500 hover:text-emerald-600" disabled={busy} onClick={() => action(u, "requestPasswordReset")}>
                  <KeyRound className="mr-1 h-3 w-3" /> Ссылка на пароль
                </Button>
                {u.role === "LEAGUE_ADMIN" && (
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500 hover:text-emerald-600"
                    disabled={busy}
                    title="Скоуп: ограничить админа одной лигой (или снять ограничение)"
                    onClick={() => { setLeagueDialog(u); setLeagueValue(u.leagueId ?? ""); }}
                  >
                    Лига
                  </Button>
                )}
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
        Пароли никто не задаёт и не видит: новый пользователь и забывший пароль получают одноразовую
        ссылку (15 минут) и сами устанавливают пароль. Роль и скоуп меняет только супер-администратор;
        смена роли LEAGUE_ADMIN на другую снимает привязку к лиге.
      </p>

      {/* ---------- Создание (без пароля — по ссылке) ---------- */}
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
                <label className="text-xs font-semibold text-zinc-600">Роль</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, leagueId: "" })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
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
              {form.role === "LEAGUE_ADMIN" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-600">Лига (опционально) — ограничить доступ только ей</label>
                  <select value={form.leagueId} onChange={(e) => setForm({ ...form, leagueId: e.target.value })} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
                    <option value="">— все лиги (оператор турнирного ядра) —</option>
                    {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <p className="text-xs text-zinc-400">С привязкой админ видит только матчи/сезоны/заявки/КДК своей лиги; без — все лиги, но без контента сайта и доступов.</p>
                </div>
              )}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-800">
                Пароль задавать не нужно: после создания получите <b>одноразовую ссылку</b> —
                передайте её человеку, он сам установит пароль при первом входе.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
            <Button disabled={busy || !form?.email} onClick={create} className="bg-emerald-600 hover:bg-emerald-700">Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Скоуп лиги ---------- */}
      <Dialog open={!!leagueDialog} onOpenChange={(o) => !o && setLeagueDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Лига — {leagueDialog?.email}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600">Доступ к лигам</label>
            <select value={leagueValue} onChange={(e) => setLeagueValue(e.target.value)} className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm">
              <option value="">— все лиги (оператор турнирного ядра) —</option>
              {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <p className="text-xs text-zinc-400">
              С привязкой — админ работает только внутри этой лиги (её сезоны, матчи, протоколы, заявки, КДК).
              Товарищеские матчи, контент сайта и пользователи — только у супер-администратора.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeagueDialog(null)}>Отмена</Button>
            <Button disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" onClick={() => leagueDialog && action(leagueDialog, "setLeague", { leagueId: leagueValue || null }).then(() => setLeagueDialog(null))}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Одноразовая ссылка ---------- */}
      <LinkDialog
        open={!!link}
        onOpenChange={(o) => !o && setLink(null)}
        token={link?.token ?? ""}
        title={link?.title ?? ""}
        note={link?.note ?? ""}
      />
    </div>
  );
}
