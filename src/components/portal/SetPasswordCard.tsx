"use client";

// ============================================================
// v1.0.32 · Установка пароля по одноразовой ссылке (золотой
// стандарт). Ссылку выдаёт супер-администратор (сам пароль он
// НЕ видит и НЕ задаёт): /admin?pwset=<токен>, 15 минут, один
// вход. После установки — автовход в панель.
// ============================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { apiPost } from "./hooks";
import { navigate } from "./router";
import type { SessionUserDTO } from "./types";
import { BRAND } from "./brand";

interface Props {
  token: string;
  onDone: (user: SessionUserDTO) => void;
}

export function SetPasswordCard({ token, onDone }: Props) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password.length < 8) return toast.error("Пароль — минимум 8 символов");
    if (password !== repeat) return toast.error("Пароли не совпадают");
    setBusy(true);
    const res = await apiPost<SessionUserDTO>("/api/auth/password/set", { token, newPassword: password });
    setBusy(false);
    if (!res.ok) return toast.error(res.error, { duration: 8000 });
    toast.success("Пароль установлен — вы вошли в систему");
    onDone(res.data!);
  };

  return (
    <div className="theme-dark flex min-h-screen items-center justify-center bg-s0 px-4 text-ink">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-sline bg-s1 p-7 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold font-mono text-xl font-black text-white">{BRAND.mark}</span>
          <div>
            <p className="text-lg font-black leading-none text-ink">{BRAND.name}</p>
            <p className="text-xs text-ink3">установка пароля</p>
          </div>
        </div>

        <div className="rounded-lg border border-sline bg-s2 p-3.5 text-xs leading-relaxed text-ink3">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <ShieldCheck className="h-3.5 w-3.5 text-gold" /> Одноразовая ссылка
          </p>
          <p className="mt-1">
            Придумайте свой пароль — его знаете только вы. Ссылка живёт 15 минут и
            работает один раз: после установки все прежние входы этого аккаунта
            закрываются. Если ссылка истекла — попросите новую у супер-администратора.
          </p>
        </div>

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
                autoFocus
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

        <Button onClick={submit} disabled={busy || password.length < 8 || password !== repeat} className="w-full bg-gold font-bold text-s0 hover:bg-gold/90">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
          Установить пароль и войти
        </Button>

        <button onClick={() => navigate("/admin")} className="w-full text-center text-xs text-ink3 hover:text-ink">
          Отменить и войти с текущим паролем
        </button>
      </div>
    </div>
  );
}
