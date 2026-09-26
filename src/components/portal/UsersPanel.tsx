"use client";

// ============================================================
// Пользователи и доступы (только SUPER_ADMIN).
// v1.0.33 · ПРИГЛАШЕНИЯ ПО ЗОЛОТОМУ СТАНДАРТУ:
//   • SMTP-режим (SMTP_HOST в .env): приглашение и сброс пароля
//     уходят ПИСЬМОМ на email пользователя — ссылку админ не видит;
//     клик по письму подтверждает владение ящиком;
//   • manual-режим (без SMTP): одноразовая ссылка показывается
//     админу для передачи лично; получатель при установке пароля
//     ПОДТВЕРЖДАЕТ адрес (или исправляет опечатку — смена видна
//     админу бейджем «почта не подтверждена»);
//   • пароли никто не знает и не задаёт; смена почты сбрасывает
//     подтверждение и повторно приглашает пользователя.
// Блокировка входа, сброс 2FA, скоуп лиги — как раньше.
// ============================================================

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KeyRound, Loader2, Plus, ShieldCheck, UserCog, Users2, Lock, Unlock, RotateCcw, Copy, Check, Send, MailCheck, MailWarning, MailQuestion } from "lucide-react";
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
  emailVerified: boolean;
  passwordSet: boolean;
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

/** Диалог с одноразовой ссылкой (только manual-режим): показать,
 *  скопировать, передать лично. TTL зависит от вида ссылки. */
function LinkDialog({ open, onOpenChange, token, title, note, ttl }: { open: boolean; onOpenChange: (o: boolean) => void; token: string; title: string; note: string; ttl: string }) {
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
        <DialogHeader><DialogTitle className="flex min-w-0 items-start gap-2 break-all"><Send className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-zinc-600">{note}</p>
          {/* v1.0.33 · break-all: ссылка с HMAC-токеном не имеет точек
              переноса — без этого grid-трек диалога раздувался и ссылка
              вылезала за рамку (репро: +884px на 1440px) */}
          <div className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
            <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-zinc-700">{link}</code>
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            <b>Один раз · {ttl}.</b> Передайте ссылку лично или по защищённому каналу. Открыв её,
            получатель увидит адрес аккаунта и подтвердит его (или исправит опечатку — вы увидите
            это бейджем «почта не подтверждена»). Пароль задаёт сам пользователь: его не знает
            никто, включая вас. После установки все прежние входы аккаунта закрываются.
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

/** Диалог «письмо ушло» (SMTP-режим): без ссылки — она только у получателя. */
function SentDialog({ open, onOpenChange, to, what }: { open: boolean; onOpenChange: (o: boolean) => void; to: string; what: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MailCheck className="h-4 w-4 text-emerald-600" /> {what}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-zinc-700">
            Письмо отправлено на <b className="break-all">{to}</b>. Ссылка из письма не показывается
            никому — клик по ней подтверждает, что ящик принадлежит приглашённому.
          </p>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-600">
            Не пришло письмо? Проверьте адрес (опечатка видна бейджем «почта не подтверждена»),
            папку «Спам» и настройки сервера (SMTP в .env). Повторная отправка — кнопкой
            «Приглашение» / «Сброс пароля».
          </div>
        </div>
        <DialogFooter>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => onOpenChange(false)}>Понятно</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPanel({ version, bump, selfId }: { version: number; bump: () => void; selfId: string }) {
  const { data, loading } = useFetch<{ mailMode: "smtp" | "manual"; users: AdminUser[] }>("/api/admin/users", version);
  const { data: personsData } = useFetch<{ persons: AdminPerson[] }>("/api/admin/persons", version);
  const { data: clubsData } = useFetch<{ clubs: AdminClub[] }>("/api/admin/clubs", version);
  const { data: leaguesData } = useFetch<{ leagues: AdminLeague[] }>("/api/admin/leagues", version);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ token: string; title: string; note: string; ttl: string } | null>(null);
  const [sent, setSent] = useState<{ to: string; what: string } | null>(null);
  const [leagueDialog, setLeagueDialog] = useState<AdminUser | null>(null);
  const [leagueValue, setLeagueValue] = useState("");
  const [emailDialog, setEmailDialog] = useState<AdminUser | null>(null);
  const [emailValue, setEmailValue] = useState("");

  const [form, setForm] = useState<{ email: string; role: string; personId: string; clubId: string; leagueId: string } | null>(null);

  const users = data?.users ?? [];
  const persons = personsData?.persons ?? [];
  const clubs = clubsData?.clubs ?? [];
  const leagues = leaguesData?.leagues ?? [];
  const smtp = data?.mailMode === "smtp";

  const openCreate = () => {
    setForm({ email: "", role: "LEAGUE_ADMIN", personId: "", clubId: "", leagueId: "" });
    setCreateOpen(true);
  };

  const create = async () => {
    if (!form) return;
    setBusy(true);
    const res = await apiPost<{ setupToken?: string; delivered?: string }>("/api/admin/users", {
      email: form.email, role: form.role,
      personId: form.personId || null, clubId: form.clubId || null, leagueId: form.leagueId || null,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error, { duration: 7000 });
    const email = form.email.trim().toLowerCase();
    setCreateOpen(false);
    setForm(null);
    bump();
    if (res.data?.delivered === "email") {
      toast.success("Пользователь создан — приглашение отправлено письмом");
      setSent({ to: email, what: "Приглашение отправлено" });
      return;
    }
    toast.success("Пользователь создан — передайте ему ссылку приглашения");
    // ссылка показывается один раз — второй раз её не увидеть
    setLink({
      token: res.data!.setupToken!,
      title: `Приглашение для ${email}`,
      note: "Пользователь ещё без пароля. Откройте ссылку — он подтвердит почту и задаст пароль сам (автовход). Если окно закрылось, ссылку можно запросить заново кнопкой «Приглашение».",
      ttl: "48 часов",
    });
  };

  const action = async (u: AdminUser, act: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    const res = await apiPost<Record<string, unknown>>("/api/admin/users", { id: u.id, action: act, ...payload }, "PATCH");
    setBusy(false);
    if (!res.ok) return toast.error(res.error, { duration: 7000 });
    const delivered = res.data?.delivered;
    bump();

    if (act === "resendInvite") {
      if (delivered === "email") {
        toast.success("Приглашение повторно отправлено");
        setSent({ to: u.email, what: "Приглашение отправлено повторно" });
      } else {
        setLink({
          token: String(res.data!.token),
          title: `Приглашение для ${u.email}`,
          note: "Пользователь ещё без пароля. Откройте ссылку — он подтвердит почту и задаст пароль сам (автовход).",
          ttl: "48 часов",
        });
      }
      return;
    }
    if (act === "requestPasswordReset") {
      if (delivered === "email") {
        toast.success(`Письмо со ссылкой сброса отправлено на ${u.email}`);
        setSent({ to: u.email, what: "Ссылка сброса пароля отправлена" });
      } else {
        setLink({
          token: String(res.data!.resetToken),
          title: `Ссылка сброса пароля — ${u.email}`,
          note: "Пользователь забыл пароль: откройте ссылку и задайте новый (прежде входы закроются).",
          ttl: "15 минут",
        });
      }
      return;
    }
    if (act === "setEmail") {
      const newEmail = String(res.data?.email ?? "");
      if (delivered === "email") {
        toast.success(`Почта изменена на ${newEmail} — на новый адрес ушло письмо-приглашение`);
        setSent({ to: newEmail, what: "Подтверждение нового адреса отправлено" });
      } else {
        toast.success(`Почта изменена на ${newEmail} — подтверждение сброшено`);
        setLink({
          token: String(res.data!.token),
          title: `Подтверждение для ${newEmail}`,
          note: "Новый адрес требует подтверждения: передайте ссылку — получатель подтвердит его при установке пароля.",
          ttl: "48 часов",
        });
      }
      setEmailDialog(null);
      return;
    }
    toast.success("Готово");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-base font-bold">
            <Users2 className="h-4 w-4 text-emerald-600" /> Пользователи и доступы
          </h3>
          <p className="text-xs text-zinc-400">Роли и скоупы · приглашения по email · одноразовые ссылки · блокировка входа · сброс 2FA</p>
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Пользователь
        </Button>
      </div>

      {/* ---------- Баннер режима доставки приглашений ---------- */}
      <div className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs leading-relaxed",
        smtp ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800",
      )}>
        {smtp ? <MailCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />}
        {smtp ? (
          <p>
            <b>Письма включены (SMTP).</b> Приглашения и сбросы пароля уходят на email пользователей
            автоматически — одноразовые ссылки не показываются никому, клик по письму подтверждает
            владение ящиком. Если письмо не дошло — проверьте адрес (бейдж «почта не подтверждена»),
            папку «Спам» и настройки SMTP в .env.
          </p>
        ) : (
          <p>
            <b>Письма не настроены (без SMTP_HOST).</b> Одноразовые ссылки показываются вам и
            передаются получателю лично: мессенджер/телефон. Получатель при установке пароля
            <b> подтвердит адрес</b> или исправит опечатку — смена отразится здесь бейджем.
            Включить автоматические письма: .env → SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS
            (инструкция — ADMIN-GUIDE.md, раздел «Почта и приглашения»).
          </p>
        )}
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
                {!u.passwordSet && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700" title="Приглашение не принято: пароль не установлен, вход невозможен">
                    без пароля
                  </Badge>
                )}
                {!u.emailVerified && (
                  <Badge variant="outline" className="border-zinc-200 bg-zinc-50 text-zinc-500" title="Адрес не подтверждён получателем (опечатка?) — сбросы идут на него вслепую">
                    <MailQuestion className="mr-1 h-3 w-3" /> почта не подтверждена
                  </Badge>
                )}
                {u.totpEnabled && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">2FA вкл</Badge>}
                {u.id === selfId && <Badge variant="secondary">это вы</Badge>}
                {!u.isActive && <Badge variant="destructive">отключён</Badge>}
                {!u.passwordSet ? (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500 hover:text-emerald-600" disabled={busy} onClick={() => action(u, "resendInvite")}
                    title="Повторно отправить приглашение (ссылку на установку пароля)">
                    <Send className="mr-1 h-3 w-3" /> Приглашение
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500 hover:text-emerald-600" disabled={busy} onClick={() => action(u, "requestPasswordReset")}
                    title={smtp ? "Отправить пользователю письмо со ссылкой сброса" : "Выдать одноразовую ссылку сброса и передать лично"}>
                    <KeyRound className="mr-1 h-3 w-3" /> Сброс пароля
                  </Button>
                )}
                <Button
                  variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500 hover:text-emerald-600"
                  disabled={busy || u.id === selfId}
                  title="Сменить логин/email (подтверждение сбросится, пользователю уйдёт новое приглашение)"
                  onClick={() => { setEmailDialog(u); setEmailValue(u.email); }}
                >
                  Почта
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
        Пароли никто не задаёт и не видит: приглашённый и забывший пароль получают одноразовую
        ссылку {smtp ? "письмом на email" : "(передаётся лично)"} и сами устанавливают пароль,
        подтверждая адрес. Роль, скоуп и почту меняет только супер-администратор; смена почты
        требует повторного подтверждения от пользователя.
      </p>

      {/* ---------- Создание (приглашение без пароля) ---------- */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новый пользователь</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600">Email (логин)</label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
                <p className="text-xs text-zinc-400">Проверьте адрес до создания: {smtp ? "приглашение уйдёт письмом именно на него" : "именно его получатель будет подтверждать при установке пароля"}</p>
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
                Пароль задавать не нужно: {smtp
                  ? "после создания приглашение уйдёт письмом на указанный email — получатель сам подтвердит адрес и задаст пароль."
                  : "после создания вы получите одноразовую ссылку (48 ч) — передайте её человеку, он подтвердит адрес и задаст пароль сам."}
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
          <DialogHeader><DialogTitle className="break-all">Лига — {leagueDialog?.email}</DialogTitle></DialogHeader>
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

      {/* ---------- Смена почты ---------- */}
      <Dialog open={!!emailDialog} onOpenChange={(o) => !o && setEmailDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="break-all">Почта — {emailDialog?.email}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-600">Новый email (логин)</label>
              <Input type="email" value={emailValue} onChange={(e) => setEmailValue(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              Смена почты сбрасывает подтверждение: {smtp
                ? "на новый адрес сразу уйдёт письмо-приглашение (подтвердить адрес + задать пароль)."
                : "получателю понадобится новая одноразовая ссылка — она покажется после сохранения."}
              Прежний адрес перестаёт быть логином немедленно.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialog(null)}>Отмена</Button>
            <Button
              disabled={busy || !emailValue.trim() || emailValue.trim().toLowerCase() === emailDialog?.email}
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => emailDialog && action(emailDialog, "setEmail", { email: emailValue.trim() })}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Диалоги доставки ---------- */}
      <LinkDialog
        open={!!link}
        onOpenChange={(o) => !o && setLink(null)}
        token={link?.token ?? ""}
        title={link?.title ?? ""}
        note={link?.note ?? ""}
        ttl={link?.ttl ?? ""}
      />
      <SentDialog
        open={!!sent}
        onOpenChange={(o) => !o && setSent(null)}
        to={sent?.to ?? ""}
        what={sent?.what ?? ""}
      />
    </div>
  );
}
