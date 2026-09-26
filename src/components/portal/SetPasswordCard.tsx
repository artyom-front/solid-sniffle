"use client";

// ============================================================
// v1.0.33 · Установка пароля по одноразовой ссылке (золотой
// стандарт). Ссылку доставляет письмо на email (SMTP) либо
// супер-админ лично (manual). Ключевая защита от опечатки в адресе:
// ПЕРЕД установкой пароля получатель видит email аккаунта и
// подтверждает его — либо исправляет (админ увидит смену в панели).
// Виды ссылок: приглашение (48 ч) и сброс пароля (15 минут).
// ============================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck, Eye, EyeOff, MailCheck, PencilLine } from "lucide-react";
import { apiPost, useFetch } from "./hooks";
import { navigate } from "./router";
import type { SessionUserDTO } from "./types";
import { BRAND } from "./brand";

interface Props {
  token: string;
  onDone: (user: SessionUserDTO) => void;
}

interface Preview {
  email: string;
  emailVerified: boolean;
  kind: "invite" | "pwset";
  ttl: number;
  roleLabel: string;
}

const ttlText = (p: Preview) => (p.ttl >= 24 * 60 ? `${Math.round(p.ttl / 60 / 24)} дн.` : `${Math.round(p.ttl / 60)} мин.`);

export function SetPasswordCard({ token, onDone }: Props) {
  const { data: preview, error: previewError } = useFetch<Preview>(`/api/auth/password/set?token=${encodeURIComponent(token)}`);

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  // решение по почте: null — вопрос ещё открыт (совпадает с «не
  // подтверждена» в предпросмотре), true — подтверждена, "edit" —
  // исправление опечатки. Хранится ЛОКАЛЬНО — в API уходит при submit.
  const [decision, setDecision] = useState<null | boolean | "edit">(null);
  const [fixedEmail, setFixedEmail] = useState("");

  const needEmailStep = !!preview && !preview.emailVerified;
  const emailStep: null | boolean | "edit" = needEmailStep && decision === null ? false : decision;
  const emailConfirmed = emailStep === true;

  const submit = async () => {
    if (password.length < 8) return toast.error("Пароль — минимум 8 символов");
    if (password !== repeat) return toast.error("Пароли не совпадают");
    if (needEmailStep && emailStep === false) {
      return toast.error("Подтвердите email — отметьте, что адрес верен, или исправьте его");
    }
    const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (emailStep === "edit" && !emailRe.test(fixedEmail.trim())) {
      return toast.error("Введите корректный email — на него придут следующие сбросы");
    }
    setBusy(true);
    const res = await apiPost<SessionUserDTO>("/api/auth/password/set", {
      token,
      newPassword: password,
      ...(emailConfirmed ? { emailConfirmed: true } : {}),
      ...(emailStep === "edit" ? { email: fixedEmail.trim() } : {}),
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error, { duration: 8000 });
    toast.success(
      emailStep === "edit"
        ? `Email обновлён на ${fixedEmail.trim()} — пароль установлен`
        : "Пароль установлен — вы вошли в систему",
    );
    onDone(res.data!);
  };

  // ---------- состояние загрузки / битой ссылки ----------
  if (!preview && !previewError) {
    return (
      <div className="theme-dark flex min-h-screen items-center justify-center bg-s0 px-4 text-ink3">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-sline border-t-gold" />
          <p className="text-xs">Проверяем ссылку…</p>
        </div>
      </div>
    );
  }
  if (previewError || !preview) {
    return (
      <div className="theme-dark flex min-h-screen items-center justify-center bg-s0 px-4 text-ink">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-sline bg-s1 p-7 shadow-2xl">
          <p className="text-base font-bold">Ссылка недействительна</p>
          <p className="text-xs leading-relaxed text-ink3">{previewError ?? "Истекла или уже использована"}</p>
          <Button onClick={() => navigate("/admin")} className="w-full bg-gold font-bold text-s0 hover:bg-gold/90">
            На страницу входа
          </Button>
        </div>
      </div>
    );
  }

  const canSetPassword = !needEmailStep || emailConfirmed || emailStep === "edit";
  return (
    <div className="theme-dark flex min-h-screen items-center justify-center bg-s0 px-4 text-ink">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-sline bg-s1 p-7 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold font-mono text-xl font-black text-white">{BRAND.mark}</span>
          <div className="min-w-0">
            <p className="text-lg font-black leading-none text-ink">{BRAND.name}</p>
            <p className="text-xs text-ink3">{preview.kind === "invite" ? "приглашение · установка пароля" : "сброс пароля"}</p>
          </div>
        </div>

        <div className="rounded-lg border border-sline bg-s2 p-3.5 text-xs leading-relaxed text-ink3">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <ShieldCheck className="h-3.5 w-3.5 text-gold" /> Одноразовая ссылка · {ttlText(preview)}
          </p>
          <p className="mt-1">
            Придумайте свой пароль — его знаете только вы. Ссылка работает один раз: после установки
            все прежние входы этого аккаунта закрываются. Роль: <b className="text-ink2">{preview.roleLabel}</b>.
          </p>
        </div>

        {/* ---------- Шаг 1 · подтверждение email (анти-опечатка) ---------- */}
        {needEmailStep && !emailConfirmed && (
          <div className="space-y-3 rounded-lg border border-sline bg-s2 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <MailCheck className="h-3.5 w-3.5 text-gold" /> Проверьте адрес аккаунта
            </p>
            <p className="break-all rounded-md bg-s1 px-2.5 py-2 font-mono text-sm text-ink">{preview.email}</p>
            {emailStep === "edit" ? (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-ink2">Верный адрес (логин)</label>
                <Input
                  type="email"
                  value={fixedEmail}
                  onChange={(e) => setFixedEmail(e.target.value)}
                  placeholder="user@example.com"
                  autoFocus
                />
                <p className="text-xs leading-relaxed text-ink3">
                  Новый адрес сохранится вместе с паролем и потребует подтверждения —
                  супер-админ увидит смену в панели.
                </p>
                <Button size="sm" variant="outline" className="border-sline bg-transparent text-ink3 hover:text-ink" onClick={() => setDecision(false)}>
                  Назад (подтвердить старый)
                </Button>
              </div>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-ink3">
                  На этот адрес приходят входы и сбросы пароля. Если он указан с опечаткой —
                  исправьте сейчас: доступ к ящику подтверждает владение аккаунтом.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-gold font-bold text-s0 hover:bg-gold/90"
                    onClick={() => { setDecision(true); toast.success("Email подтверждён — придумайте пароль"); }}
                  >
                    <MailCheck className="mr-1 h-3.5 w-3.5" /> Да, это мой адрес
                  </Button>
                  <Button size="sm" variant="outline" className="border-sline bg-transparent text-ink3 hover:text-ink" onClick={() => setDecision("edit")}>
                    <PencilLine className="mr-1 h-3.5 w-3.5" /> Указан неверно
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {needEmailStep && emailStep === true && (
          <p className="flex items-center gap-1.5 break-all rounded-lg border border-emerald-700/40 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-300">
            <MailCheck className="h-3.5 w-3.5 shrink-0" /> Email подтверждён: <b className="font-mono">{preview.email}</b>
          </p>
        )}

        {/* ---------- Шаг 2 · пароль ---------- */}
        {canSetPassword && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink2">Новый пароль (минимум 8 символов)</label>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  placeholder="••••••••"
                  autoFocus={emailStep !== "edit"}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink3 hover:text-ink"
                  aria-label={show ? "Скрыть пароль" : "Показать пароль"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink2">Повторите пароль</label>
              <Input
                type={show ? "text" : "password"}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                placeholder="••••••••"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
          </div>
        )}

        {canSetPassword && (
          <Button onClick={submit} disabled={busy || password.length < 8 || password !== repeat} className="w-full bg-gold font-bold text-s0 hover:bg-gold/90">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Установить пароль и войти
          </Button>
        )}

        <button onClick={() => navigate("/admin")} className="w-full text-center text-xs text-ink3 hover:text-ink">
          Отменить и войти с текущим паролем
        </button>
      </div>
    </div>
  );
}
